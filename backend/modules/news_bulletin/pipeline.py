"""
News Bulletin Pipeline --- Haber bulteni video uretim pipeline'i.

StandardVideo'dan farkliliklar:
  - Script adimi: URL/RSS kaynaklarindan haber icerigi ceker ve
    LLM'e haber bulteni formatinda senaryo yazdirir.
  - Diger adimlar (metadata, TTS, visuals, subtitles, composition)
    standard_video ile ayni fonksiyonlari kullanir.

Giris verisi (config uzerinden):
  _job_title: Bulten konusu/basligi
  _news_urls: list[str] --- Haber kaynagi URL'leri (opsiyonel)
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from backend.modules.base import Capability, ContentModule, PipelineStepDef
from backend.modules.news_bulletin.config import DEFAULT_CONFIG
from backend.modules.standard_video.pipeline import (
    step_metadata,
    step_tts,
    step_visuals,
    _normalize_script,
    _fallback_parse_script,
    _LANGUAGE_MAP,
)
from backend.pipeline.steps.composition import step_composition_remotion as step_composition
from backend.pipeline.steps.subtitles import step_subtitles_enhanced as step_subtitles
from backend.pipeline.cache import CacheManager
from backend.providers.registry import provider_registry
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Bulletin-specific system instruction
# ---------------------------------------------------------------------------

_BULLETIN_SYSTEM_INSTRUCTION = """Sen profesyonel bir haber spikeri ve bulten yazarisin.
Gorevin, verilen haber kaynaklarini ve bilgileri kullanarak izleyiciyi bilgilendiren
bir haber bulteni senaryosu yazmaktir.

KURALLAR:
- Senaryoyu tam olarak {scene_count} sahneye bol.
- Ilk sahne bultene guclu bir acilis yapmali (giris + gundem ozeti).
- Her sahne 12-20 saniyelik bir narasyon icermeli.
- Her haber icin kaynak belirt (news_source alani).
- Her sahne icin uygun bir kategori belirt (category alani). Ornek kategoriler: Ekonomi, Siyaset, Teknoloji, Spor, Saglik, Kultur, Dunya, Gundem.
- Her sahne icin uygun bir gorsel anahtar kelime oner (Ingilizce, stok video aramaya uygun).
- Haberleri onem sirasina gore sirala.
- Son sahne kapanis ve ozet olmali.
- Uslup: Profesyonel, tarafsiz, akici haber dili.
- Dil: {language_name}

CIKTI FORMATI (JSON):
{{
  "title": "Bulten basligi",
  "scenes": [
    {{
      "scene_number": 1,
      "narration": "Sahne metni...",
      "visual_keyword": "keyword for stock video search",
      "duration_hint_seconds": 15,
      "news_source": "kaynak adi veya URL",
      "category": "Ekonomi"
    }}
  ]
}}

SADECE JSON dondur, baska bir sey yazma."""

_URL_FETCH_TIMEOUT = 15.0
_MAX_CONTENT_PER_URL = 2000  # characters


# ---------------------------------------------------------------------------
# URL content fetcher
# ---------------------------------------------------------------------------


async def _fetch_url_content(url: str) -> str | None:
    """
    Verilen URL'den metin icerigi cekmeye calisir.

    Basit bir HTTP GET yapar ve HTML'den temel metni cikarma girisimine
    bulunur. RSS/XML ise ham icerigi dondurur.
    Basarisiz olursa None doner.
    """
    try:
        async with httpx.AsyncClient(
            timeout=_URL_FETCH_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "ContentManager/0.7.0 NewsBulletin"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            raw_text = resp.text

            # Basit HTML tag temizleme (tam parser yok, temel metin cikarma)
            if "html" in content_type.lower():
                # Script ve style bloklarini kaldir
                clean = re.sub(
                    r"<script[^>]*>.*?</script>",
                    "",
                    raw_text,
                    flags=re.DOTALL | re.IGNORECASE,
                )
                clean = re.sub(
                    r"<style[^>]*>.*?</style>",
                    "",
                    clean,
                    flags=re.DOTALL | re.IGNORECASE,
                )
                # Tum HTML tag'lerini kaldir
                clean = re.sub(r"<[^>]+>", " ", clean)
                # Birden fazla boslugu teke indir
                clean = re.sub(r"\s+", " ", clean).strip()
                return clean[:_MAX_CONTENT_PER_URL] if clean else None

            # XML/RSS veya duz metin
            return raw_text[:_MAX_CONTENT_PER_URL] if raw_text else None

    except Exception as exc:
        log.warning(
            "Haber URL'si cekilemedi",
            url=url[:100],
            error=str(exc)[:200],
        )
        return None


# ---------------------------------------------------------------------------
# Pipeline Step: Bulletin Script
# ---------------------------------------------------------------------------


async def step_script_bulletin(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Haber Bulteni Script Adimi.

    1. config'den URL listesini okur
    2. Her URL'den icerik ceker (async httpx)
    3. Cekilen haberleri + konu bilgisini LLM prompt'una ekler
    4. LLM ile bulten senaryosu uretir

    URL yoksa veya tumu basarisizsa, sadece baslik ile senaryo uretir.
    """
    scene_count = config.get("scene_count", 8)
    language = config.get("language", "tr")
    title = config.get("_job_title", "Gunun Haberleri")
    language_name = _LANGUAGE_MAP.get(language, language)

    # ---- URL listesini config'den al -----------------------------------
    # Öncelik: job-level _news_urls > config news_sources > DB'deki aktif kaynaklar
    news_urls: list[str] = config.get("_news_urls", []) or config.get("news_sources", [])

    # Hiç URL yoksa DB'deki aktif haber kaynaklarını kullan
    if not news_urls:
        db = config.get("_db")
        if db is not None:
            try:
                from backend.models.news_source import NewsSource
                db_sources = (
                    db.query(NewsSource)
                    .filter(NewsSource.enabled == True)  # noqa: E712
                    .order_by(NewsSource.sort_order, NewsSource.id)
                    .all()
                )
                news_urls = [s.url for s in db_sources]
                if news_urls:
                    log.info("DB'den aktif haber kaynakları yüklendi", count=len(news_urls))
            except Exception as exc:
                log.warning("DB haber kaynakları yüklenemedi", error=str(exc))

    # ---- URL'lerden icerik cek -----------------------------------------
    fetched_articles: list[dict[str, str]] = []

    if news_urls:
        max_articles = config.get("news_max_articles", 5)
        urls_to_fetch = news_urls[:max_articles]

        for url in urls_to_fetch:
            url = url.strip()
            if not url:
                continue

            content = await _fetch_url_content(url)
            if content:
                max_chars = config.get("news_summary_max_chars", 500)
                fetched_articles.append(
                    {
                        "url": url,
                        "content": content[:max_chars],
                    }
                )
                log.info(
                    "Haber icerigi cekildi",
                    url=url[:80],
                    content_length=len(content),
                )
            else:
                log.warning("Haber URL cekilemedi, atlaniyor", url=url[:80])

    # ---- Prompt olustur ------------------------------------------------
    articles_text = ""
    if fetched_articles:
        articles_text = "\n\nHABER KAYNAKLARI:\n"
        for i, article in enumerate(fetched_articles, 1):
            articles_text += (
                f"\n--- Kaynak {i} ({article['url'][:60]}) ---\n"
                f"{article['content']}\n"
            )
    else:
        articles_text = (
            "\n\nNot: Belirli haber kaynagi saglanmadi. "
            "Verilen konu hakkinda genel bilgilerle bulten olustur."
        )

    # PromptManager'dan ayarlanan master prompt şablonunu kullan;
    # ayarlanmamışsa varsayılan hardcoded şablona düş.
    prompt_template = config.get("script_prompt_template", "") or ""
    if prompt_template.strip():
        try:
            system_instruction = prompt_template.format(
                scene_count=scene_count,
                language_name=language_name,
            )
        except KeyError:
            system_instruction = prompt_template
    else:
        system_instruction = _BULLETIN_SYSTEM_INSTRUCTION.format(
            scene_count=scene_count,
            language_name=language_name,
        )

    prompt = (
        f"Haber bulteni konusu: {title}\n"
        f"Dil: {language_name}\n"
        f"Istenen sahne sayisi: {scene_count}\n"
        f"{articles_text}\n\n"
        f"Yukaridaki kaynaklara dayanarak {scene_count} sahneli "
        f"bir haber bulteni senaryosu yaz."
    )

    result = await provider_registry.execute_with_fallback(
        category="llm",
        input_data={
            "prompt": prompt,
            "system_instruction": system_instruction,
            "response_format": "json",
            "temperature": config.get("script_temperature", 0.6),
            "max_output_tokens": config.get("script_max_tokens", 4096),
        },
        config=config,
    )

    if not result.success:
        raise RuntimeError(
            f"Haber bulteni senaryo uretimi basarisiz: {result.error}"
        )

    # ---- LLM ciktisini parse et ----------------------------------------
    script_data = result.data
    if isinstance(script_data, str):
        try:
            script_data = json.loads(script_data)
        except json.JSONDecodeError:
            script_data = _fallback_parse_script(
                script_data, title, scene_count, language
            )

    script_data = _normalize_script(script_data, title, scene_count, language)

    # Bulten-spesifik metadata ekle
    script_data["module"] = "news_bulletin"
    script_data["sources_used"] = len(fetched_articles)
    script_data["source_urls"] = [a["url"] for a in fetched_articles]

    output_path = cache.save_json(step_key, script_data)

    return {
        "provider": result.provider_name,
        "scene_count": len(script_data.get("scenes", [])),
        "sources_fetched": len(fetched_articles),
        "sources_attempted": len(news_urls) if news_urls else 0,
        "output_path": str(output_path),
        "cost_estimate_usd": result.cost_estimate_usd,
    }


# ---------------------------------------------------------------------------
# Module Class
# ---------------------------------------------------------------------------


class NewsBulletinModule(ContentModule):
    """
    Haber bulteni video uretim modulu.

    6 adimli pipeline:
        BulletinScript -> Metadata -> TTS -> Visuals -> Subtitles -> Composition

    StandardVideo'dan farki: Script adimi URL/RSS kaynaklarindan
    haber cekerek zenginlestirilmis bulten senaryosu uretir.
    """

    name = "news_bulletin"
    display_name = "Haber Bulteni"
    description = (
        "RSS veya URL tabanli haber kaynaklarindan bulten formatinda "
        "YouTube videosu uretir. Haber URL'leri girin veya sadece bir konu "
        "belirleyin, sistem profesyonel bir haber bulteni olustursun."
    )
    capabilities = [
        Capability.SCRIPT_GENERATION,
        Capability.METADATA_GENERATION,
        Capability.TTS,
        Capability.VISUALS,
        Capability.SUBTITLES,
        Capability.COMPOSITION,
    ]

    def get_pipeline_steps(self) -> list[PipelineStepDef]:
        """6 adimli news bulletin pipeline tanimini dondurur."""
        return [
            PipelineStepDef(
                key="script",
                label="Bulten Senaryosu",
                order=0,
                capability=Capability.SCRIPT_GENERATION,
                execute=step_script_bulletin,
                is_fatal=True,
                default_provider="gemini",
            ),
            PipelineStepDef(
                key="metadata",
                label="Metadata Uretimi",
                order=1,
                capability=Capability.METADATA_GENERATION,
                execute=step_metadata,
                is_fatal=False,
                default_provider="gemini",
            ),
            PipelineStepDef(
                key="tts",
                label="Ses Sentezi (TTS)",
                order=2,
                capability=Capability.TTS,
                execute=step_tts,
                is_fatal=True,
                default_provider="edge_tts",
            ),
            PipelineStepDef(
                key="visuals",
                label="Gorsel Indirme",
                order=3,
                capability=Capability.VISUALS,
                execute=step_visuals,
                is_fatal=True,
                default_provider="pexels",
            ),
            PipelineStepDef(
                key="subtitles",
                label="Altyazi Olusturma",
                order=4,
                capability=Capability.SUBTITLES,
                execute=step_subtitles,
                is_fatal=False,
                default_provider="tts_word_timing",
            ),
            PipelineStepDef(
                key="composition",
                label="Video Kompozisyon",
                order=5,
                capability=Capability.COMPOSITION,
                execute=step_composition,
                is_fatal=True,
                default_provider="remotion",
            ),
        ]

    def get_default_config(self) -> dict[str, Any]:
        """News bulletin modulunun varsayilan ayarlarini dondurur."""
        return dict(DEFAULT_CONFIG)
