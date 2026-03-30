"""
Product Review Pipeline — Ürün inceleme video üretim pipeline'ı.

StandardVideo'dan farklılıklar:
  - Script adımı: Ürün adı ve teknik özellikler alarak Pro/Con
    (Artı/Eksi) formatında yapılandırılmış bir inceleme senaryosu üretir.
  - Senaryo 5 bölümlü: Hook → Overview → Pros → Cons → Verdict
  - Diğer adımlar standard_video ile aynı fonksiyonları kullanır.

Giriş verisi (config üzerinden):
  _job_title: Ürün adı
  _product_specs: str — Opsiyonel teknik özellikler
"""

from __future__ import annotations

import json
from typing import Any

from backend.modules.base import Capability, ContentModule, PipelineStepDef
from backend.modules.product_review.config import DEFAULT_CONFIG
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

_REVIEW_SYSTEM_INSTRUCTION = """Sen profesyonel bir teknoloji ve ürün inceleme uzmanısın.
Görevin, verilen ürünü detaylı ve dengeli bir şekilde inceleyerek izleyiciyi bilgilendiren
bir ürün inceleme video senaryosu yazmaktır.

YAPI (tam olarak {scene_count} sahne):
1. Hook (1 sahne): Dikkat çekici açılış, ürünü tanıt
2. Genel Bakış (1 sahne): Ürünün ne olduğu, hedef kitlesi, fiyat aralığı
3. Artıları ({pros_count} sahne): Her sahne bir güçlü yön
4. Eksileri ({cons_count} sahne): Her sahne bir zayıf yön
5. Sonuç (1 sahne): Genel değerlendirme, puan ({score_range}) ve tavsiye

KURALLAR:
- Her sahne 12-20 saniyelik bir narasyon içermeli.
- Artılar ve eksileri somut örneklerle destekle.
- Tarafsız ve dürüst bir üslup kullan.
- Her sahne için uygun bir görsel anahtar kelime öner (İngilizce, stok video aramaya uygun).
- Dil: {language_name}

ÇIKTI FORMATI (JSON):
{{
  "title": "İnceleme başlığı",
  "product_name": "Ürün adı",
  "overall_score": 7.5,
  "scenes": [
    {{
      "scene_number": 1,
      "section_type": "hook|overview|pro|con|verdict",
      "narration": "Sahne metni...",
      "visual_keyword": "keyword for stock video search",
      "duration_hint_seconds": 15
    }}
  ]
}}

SADECE JSON döndür, başka bir şey yazma."""


async def step_script_review(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Ürün İnceleme Script Adımı.

    1. config'den ürün adı ve teknik özellikleri okur
    2. Pro/Con formatında yapılandırılmış prompt oluşturur
    3. LLM ile inceleme senaryosu üretir
    """
    scene_count = config.get("scene_count", 8)
    language = config.get("language", "tr")
    product_name = config.get("_job_title", "Bilinmeyen Ürün")
    product_specs = config.get("_product_specs", "")
    language_name = _LANGUAGE_MAP.get(language, language)

    pros_count = config.get("review_pros_count", 3)
    cons_count = config.get("review_cons_count", 3)
    score_enabled = config.get("review_score_enabled", True)

    # Sahne dağılımı: 1 hook + 1 overview + pros + cons + 1 verdict
    calculated_scenes = 1 + 1 + pros_count + cons_count + 1
    # Config'deki scene_count'u da dikkate al
    actual_scene_count = max(scene_count, calculated_scenes)

    score_range = "1-10 arası puan ver" if score_enabled else "puan verme"

    # Admin prompt template override — boş değilse hardcoded instruction yerine kullan.
    # Runner, "{module_key}_script_prompt" key'ini "script_prompt_template" olarak alias'lar.
    prompt_template = config.get("script_prompt_template", "") or ""
    if prompt_template.strip():
        try:
            system_instruction = prompt_template.format(
                scene_count=actual_scene_count,
                pros_count=pros_count,
                cons_count=cons_count,
                score_range=score_range,
                language_name=language_name,
            )
        except KeyError:
            system_instruction = prompt_template
    else:
        system_instruction = _REVIEW_SYSTEM_INSTRUCTION.format(
            scene_count=actual_scene_count,
            pros_count=pros_count,
            cons_count=cons_count,
            score_range=score_range,
            language_name=language_name,
        )

    specs_text = ""
    if product_specs:
        specs_text = f"\n\nTeknik Özellikler:\n{product_specs}"

    prompt = (
        f"İncelenecek ürün: {product_name}\n"
        f"Dil: {language_name}\n"
        f"İstenen sahne sayısı: {actual_scene_count}\n"
        f"Artı sayısı: {pros_count}, Eksi sayısı: {cons_count}\n"
        f"{specs_text}\n\n"
        f"Bu ürün hakkında {actual_scene_count} sahneli bir inceleme senaryosu yaz."
    )

    result = await provider_registry.execute_with_fallback(
        category="llm",
        input_data={
            "prompt": prompt,
            "system_instruction": system_instruction,
            "response_format": "json",
            "temperature": config.get("script_temperature", 0.7),
            "max_output_tokens": config.get("script_max_tokens", 4096),
        },
        config=config,
    )

    if not result.success:
        raise RuntimeError(f"Ürün inceleme senaryo üretimi başarısız: {result.error}")

    # LLM çıktısını parse et
    script_data = result.data
    if isinstance(script_data, str):
        try:
            script_data = json.loads(script_data)
        except json.JSONDecodeError:
            script_data = _fallback_parse_script(
                script_data, product_name, actual_scene_count, language
            )

    script_data = _normalize_script(script_data, product_name, actual_scene_count, language)

    # İnceleme-spesifik metadata ekle
    script_data["module"] = "product_review"
    script_data["product_name"] = product_name
    script_data.setdefault("overall_score", 7.0)

    if product_specs:
        script_data["product_specs"] = product_specs

    output_path = cache.save_json(step_key, script_data)

    return {
        "provider": result.provider_name,
        "scene_count": len(script_data.get("scenes", [])),
        "product_name": product_name,
        "overall_score": script_data.get("overall_score", 0),
        "output_path": str(output_path),
        "cost_estimate_usd": result.cost_estimate_usd,
    }


class ProductReviewModule(ContentModule):
    """
    Ürün inceleme video üretim modülü.

    6 adımlı pipeline: ReviewScript -> Metadata -> TTS -> Visuals -> Subtitles -> Composition

    StandardVideo'dan farkı: Script adımı Pro/Con formatında
    yapılandırılmış ürün inceleme senaryosu üretir.
    """

    name = "product_review"
    display_name = "Ürün İnceleme"
    description = (
        "Ürün adı ve opsiyonel teknik özellikler ile Pro/Con formatında "
        "yapılandırılmış YouTube inceleme videosu üretir."
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
        return [
            PipelineStepDef(
                key="script",
                label="İnceleme Senaryosu",
                order=0,
                capability=Capability.SCRIPT_GENERATION,
                execute=step_script_review,
                is_fatal=True,
                default_provider="gemini",
            ),
            PipelineStepDef(
                key="metadata",
                label="Metadata Üretimi",
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
                label="Görsel İndirme",
                order=3,
                capability=Capability.VISUALS,
                execute=step_visuals,
                is_fatal=True,
                default_provider="pexels",
            ),
            PipelineStepDef(
                key="subtitles",
                label="Altyazı Oluşturma",
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
        return dict(DEFAULT_CONFIG)
