"""
Standard Video Pipeline — 6 adımlı video üretim pipeline'ı.

Adımlar:
  0. Script    — Senaryo üretimi (LLM provider → Gemini fallback)
  1. Metadata  — Başlık, açıklama, etiket üretimi (LLM provider)
  2. TTS       — Ses sentezi (TTS provider → Edge TTS fallback)
  3. Visuals   — Görsel indirme (Visuals provider → Pexels fallback)
  4. Subtitles — Altyazı oluşturma (TTS word-timing verisi + cache)
  5. Composition — Video birleştirme (Remotion — Faz 8'de gerçek impl.)

Faz 6: Script, TTS ve Visuals adımları gerçek provider'ları kullanır.
Metadata ve Subtitles adımları LLM + TTS çıktılarını işler.
Composition adımı hâlâ mock — Remotion entegrasyonu Faz 8'de.

Her step fonksiyonu ProviderRegistry.execute_with_fallback() ile
provider zincirini çalıştırır. API key veya provider yoksa graceful
hata döner (non-fatal adımlar atlanır, fatal adımlar job'u durdurur).
"""

from __future__ import annotations

import asyncio
import json
import random
from typing import Any

from backend.modules.base import Capability, ContentModule, PipelineStepDef
from backend.modules.standard_video.config import DEFAULT_CONFIG
from backend.pipeline.cache import CacheManager
from backend.providers.registry import provider_registry
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Prompt şablonları
# ─────────────────────────────────────────────────────────────────────────────

_SCRIPT_SYSTEM_INSTRUCTION = """Sen profesyonel bir YouTube video senaristi ve içerik üreticisisin.
Görevin, verilen konu hakkında izleyiciyi saran, bilgilendirici ve akıcı bir video senaryosu yazmaktır.

KURALLAR:
- Senaryoyu tam olarak {scene_count} sahneye böl.
- Her sahne 15-25 saniye süreli bir narasyon içermeli.
- İlk sahne güçlü bir "hook" (dikkat çekici açılış) ile başlamalı.
- Her sahne için uygun bir görsel anahtar kelime öner (İngilizce, stok video aramaya uygun).
- Dil: {language_name}
- Ton: Bilgilendirici ama samimi, kanal izleyicisine hitap eden.

ÇIKTI FORMATI (JSON):
{{
  "title": "Video başlığı",
  "scenes": [
    {{
      "scene_number": 1,
      "narration": "Sahne metni...",
      "visual_keyword": "keyword for stock video search",
      "duration_hint_seconds": 18
    }}
  ]
}}

SADECE JSON döndür, başka bir şey yazma."""

_METADATA_SYSTEM_INSTRUCTION = """Sen bir YouTube SEO uzmanısın. Verilen video senaryosuna göre
YouTube için optimize edilmiş metadata üret.

ÇIKTI FORMATI (JSON):
{{
  "youtube_title": "Dikkat çekici, SEO uyumlu başlık (max 70 karakter)",
  "youtube_description": "Detaylı açıklama (emoji + hashtag dahil, 500-1000 karakter)",
  "tags": ["etiket1", "etiket2", "etiket3", "etiket4", "etiket5"],
  "category": "YouTube kategori adı"
}}

SADECE JSON döndür."""

_LANGUAGE_MAP = {
    "tr": "Türkçe",
    "en": "English",
    "de": "Deutsch",
    "fr": "Français",
    "es": "Español",
}


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Step Fonksiyonları
# ─────────────────────────────────────────────────────────────────────────────


async def step_script(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 0: Senaryo üretimi — LLM Provider (Gemini + fallback).

    ProviderRegistry üzerinden LLM kategorisindeki provider zincirini
    çalıştırır. Gemini başarısız olursa sıradaki LLM provider denenir.
    """
    scene_count = config.get("scene_count", 10)
    language = config.get("language", "tr")
    title = config.get("_job_title", "Yapay Zekanın Geleceği")
    language_name = _LANGUAGE_MAP.get(language, language)

    system_instruction = _SCRIPT_SYSTEM_INSTRUCTION.format(
        scene_count=scene_count,
        language_name=language_name,
    )

    prompt = (
        f"Konu: {title}\n\n"
        f"Bu konu hakkında {scene_count} sahneli bir YouTube video senaryosu yaz. "
        f"Dil: {language_name}."
    )

    result = await provider_registry.execute_with_fallback(
        category="llm",
        input_data={
            "prompt": prompt,
            "system_instruction": system_instruction,
            "response_format": "json",
            "temperature": config.get("script_temperature", 0.8),
            "max_output_tokens": config.get("script_max_tokens", 8192),
        },
        config=config,
    )

    if not result.success:
        raise RuntimeError(f"Senaryo üretimi başarısız: {result.error}")

    # LLM çıktısını parse et
    script_data = result.data

    # Eğer string geldiyse JSON'a parse et
    if isinstance(script_data, str):
        try:
            script_data = json.loads(script_data)
        except json.JSONDecodeError:
            # JSON parse edilemezse basit yapıya dönüştür
            script_data = _fallback_parse_script(script_data, title, scene_count, language)

    # Doğrulama ve normalizasyon
    script_data = _normalize_script(script_data, title, scene_count, language)

    output_path = cache.save_json(step_key, script_data)

    return {
        "provider": result.provider_name,
        "scene_count": len(script_data.get("scenes", [])),
        "output_path": str(output_path),
        "cost_estimate_usd": result.cost_estimate_usd,
    }


async def step_metadata(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 1: Metadata üretimi — LLM Provider.

    Script çıktısını okuyarak YouTube başlık, açıklama ve etiketler üretir.
    LLM başarısız olursa script'ten basit metadata türetir.
    """
    title = config.get("_job_title", "Yapay Zekanın Geleceği")
    language = config.get("language", "tr")

    # Script verisini oku
    script_data = cache.load_json("script")
    script_summary = ""
    if script_data:
        scenes = script_data.get("scenes", [])
        # İlk 3 sahneyi özetle
        for s in scenes[:3]:
            script_summary += f"Sahne {s.get('scene_number', '?')}: {s.get('narration', '')[:100]}...\n"

    prompt = (
        f"Video konusu: {title}\n"
        f"Dil: {_LANGUAGE_MAP.get(language, language)}\n\n"
        f"Senaryo özeti:\n{script_summary}\n\n"
        f"Bu video için YouTube metadata üret."
    )

    result = await provider_registry.execute_with_fallback(
        category="llm",
        input_data={
            "prompt": prompt,
            "system_instruction": _METADATA_SYSTEM_INSTRUCTION,
            "response_format": "json",
            "temperature": 0.6,
            "max_output_tokens": 2048,
        },
        config=config,
    )

    if result.success:
        metadata = result.data
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = _fallback_metadata(title, language)
    else:
        # LLM başarısız — basit metadata üret (non-fatal adım)
        log.warning("Metadata LLM başarısız, fallback kullanılıyor", error=result.error)
        metadata = _fallback_metadata(title, language)

    # Zorunlu alanları garantile
    metadata.setdefault("youtube_title", f"{title} | Video")
    metadata.setdefault("youtube_description", f"Bu videoda {title} konusunu inceliyoruz.")
    metadata.setdefault("tags", [title.lower()])
    metadata.setdefault("category", "Education")
    metadata["language"] = language

    output_path = cache.save_json(step_key, metadata)

    return {
        "provider": result.provider_name if result.success else "fallback",
        "title_length": len(metadata.get("youtube_title", "")),
        "tag_count": len(metadata.get("tags", [])),
        "output_path": str(output_path),
        "cost_estimate_usd": result.cost_estimate_usd if result.success else 0.0,
    }


async def step_tts(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 2: Ses sentezi — TTS Provider (Edge TTS + fallback).

    Script'teki her sahne için ayrı ayrı ses sentezi yapar.
    Her ses dosyası ve word-timing verisi cache'e kaydedilir.
    """
    script_data = cache.load_json("script")
    if not script_data:
        raise RuntimeError("Script verisi bulunamadı — TTS öncesinde script adımı tamamlanmalı.")

    scenes = script_data.get("scenes", [])
    if not scenes:
        raise RuntimeError("Script'te sahne bulunamadı.")

    voice = config.get("tts_voice", "tr-TR-AhmetNeural")

    tts_results = []
    total_audio_duration = 0.0
    total_cost = 0.0
    provider_used = "unknown"

    for scene in scenes:
        scene_num = f"{scene.get('scene_number', 0):02d}"
        narration = scene.get("narration", "")

        if not narration.strip():
            log.warning("Boş narasyon, sahne atlanıyor", scene_number=scene_num)
            continue

        result = await provider_registry.execute_with_fallback(
            category="tts",
            input_data={
                "text": narration,
                "voice": voice,
            },
            config=config,
        )

        if not result.success:
            raise RuntimeError(
                f"Sahne {scene_num} TTS başarısız: {result.error}"
            )

        provider_used = result.provider_name
        tts_data = result.data

        # Ses dosyasını kaydet
        audio_bytes = tts_data.get("audio_bytes", b"")
        audio_format = tts_data.get("format", "mp3")
        audio_filename = f"scene_{scene_num}.{audio_format}"

        cache.save_binary(step_key, audio_bytes, audio_filename)

        # Word-timing verisi
        word_timings = tts_data.get("word_timings", [])
        duration_ms = tts_data.get("duration_ms", 0)
        duration_sec = duration_ms / 1000.0

        tts_results.append({
            "scene_number": scene.get("scene_number", 0),
            "filename": audio_filename,
            "duration_seconds": round(duration_sec, 2),
            "size_bytes": len(audio_bytes),
            "word_timings": word_timings,
        })

        total_audio_duration += duration_sec
        total_cost += result.cost_estimate_usd

    # Manifest JSON kaydet
    tts_manifest = {
        "provider": provider_used,
        "voice": voice,
        "scene_count": len(tts_results),
        "total_duration_seconds": round(total_audio_duration, 2),
        "files": tts_results,
    }
    cache.save_json(step_key, tts_manifest)

    return {
        "provider": provider_used,
        "voice": voice,
        "scene_count": len(tts_results),
        "total_duration_seconds": round(total_audio_duration, 2),
        "output_path": str(cache.get_output_path(step_key)),
        "cost_estimate_usd": total_cost,
    }


async def step_visuals(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 3: Görsel indirme — Visuals Provider (Pexels + fallback).

    Script'teki her sahnenin visual_keyword'üne göre stok video/fotoğraf
    arar ve indirir.
    """
    script_data = cache.load_json("script")
    if not script_data:
        raise RuntimeError("Script verisi bulunamadı — Visuals öncesinde script adımı tamamlanmalı.")

    scenes = script_data.get("scenes", [])
    orientation = config.get("visuals_orientation", "landscape")

    visual_results = []
    provider_used = "unknown"

    for scene in scenes:
        scene_num = f"{scene.get('scene_number', 0):02d}"
        query = scene.get("visual_keyword", f"scene {scene.get('scene_number', 0)}")

        result = await provider_registry.execute_with_fallback(
            category="visuals",
            input_data={
                "query": query,
                "media_type": "video",
                "count": 1,
                "orientation": orientation,
                "min_duration": config.get("visuals_min_duration", 5),
            },
            config=config,
        )

        if result.success and result.data:
            provider_used = result.provider_name
            items = result.data.get("items", [])

            if items:
                item = items[0]
                content_bytes = item.get("content_bytes", b"")
                file_type = item.get("file_type", "video/mp4")
                ext = "mp4" if "video" in file_type else "jpg"
                visual_filename = f"scene_{scene_num}.{ext}"

                cache.save_binary(step_key, content_bytes, visual_filename)

                visual_results.append({
                    "scene_number": scene.get("scene_number", 0),
                    "filename": visual_filename,
                    "source": result.provider_name,
                    "query": query,
                    "pexels_id": item.get("id"),
                    "photographer": item.get("photographer", ""),
                    "width": item.get("width", 0),
                    "height": item.get("height", 0),
                    "duration": item.get("duration"),
                    "size_bytes": len(content_bytes),
                })
                continue

        # Başarısız — boş placeholder kaydet ama hata fırlatma
        log.warning(
            "Görsel bulunamadı, sahne için placeholder kullanılacak",
            scene_number=scene_num,
            query=query,
            error=result.error if not result.success else "No items",
        )
        visual_results.append({
            "scene_number": scene.get("scene_number", 0),
            "filename": None,
            "source": "placeholder",
            "query": query,
            "error": result.error or "No items found",
        })

    # En az bir gerçek görsel indirilmiş olmalı
    real_downloads = [v for v in visual_results if v.get("filename")]
    if not real_downloads:
        raise RuntimeError(
            "Hiçbir sahne için görsel indirilemedi. "
            "Pexels API key'i kontrol edin veya farklı anahtar kelimeler deneyin."
        )

    visuals_manifest = {
        "provider": provider_used,
        "scene_count": len(visual_results),
        "downloaded": len(real_downloads),
        "orientation": orientation,
        "files": visual_results,
    }
    cache.save_json(step_key, visuals_manifest)

    return {
        "provider": provider_used,
        "scene_count": len(visual_results),
        "downloaded": len(real_downloads),
        "output_path": str(cache.get_output_path(step_key)),
        "cost_estimate_usd": 0.0,
    }


async def step_subtitles(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 4: Altyazı oluşturma.

    TTS adımından gelen word-timing verilerini kullanarak
    altyazı JSON'ı oluşturur. Whisper gerektirmez — Edge TTS
    zaten word-level timing sağlar.
    """
    tts_data = cache.load_json("tts")
    script_data = cache.load_json("script")

    if not tts_data:
        raise RuntimeError("TTS verisi bulunamadı — altyazı öncesinde TTS adımı tamamlanmalı.")

    scenes = script_data.get("scenes", []) if script_data else []
    tts_files = tts_data.get("files", [])

    subtitle_entries = []
    current_offset_ms = 0.0

    for i, tts_file in enumerate(tts_files):
        scene_num = tts_file.get("scene_number", i + 1)
        duration_sec = tts_file.get("duration_seconds", 15.0)
        word_timings = tts_file.get("word_timings", [])

        narration = ""
        if i < len(scenes):
            narration = scenes[i].get("narration", "")

        if word_timings:
            # TTS'ten gelen gerçek word-timing'leri kullan
            adjusted_timings = []
            for wt in word_timings:
                adjusted_timings.append({
                    "word": wt["word"],
                    "start": round((current_offset_ms + wt.get("start_ms", 0)) / 1000.0, 3),
                    "end": round((current_offset_ms + wt.get("end_ms", 0)) / 1000.0, 3),
                })
        else:
            # Word-timing yoksa eşit dağıtım
            words = narration.split() if narration else [f"word_{j}" for j in range(5)]
            time_per_word = (duration_sec * 1000) / max(len(words), 1)
            adjusted_timings = []
            for j, word in enumerate(words):
                start_ms = current_offset_ms + j * time_per_word
                end_ms = start_ms + time_per_word
                adjusted_timings.append({
                    "word": word,
                    "start": round(start_ms / 1000.0, 3),
                    "end": round(end_ms / 1000.0, 3),
                })

        subtitle_entries.append({
            "scene_number": scene_num,
            "text": narration or f"Sahne {scene_num}",
            "start_time": round(current_offset_ms / 1000.0, 3),
            "end_time": round((current_offset_ms + duration_sec * 1000) / 1000.0, 3),
            "word_timings": adjusted_timings,
        })

        current_offset_ms += duration_sec * 1000

    subtitles_data = {
        "style": config.get("subtitle_style", "standard"),
        "font_size": config.get("subtitle_font_size", 48),
        "position": config.get("subtitle_position", "bottom"),
        "total_duration": round(current_offset_ms / 1000.0, 3),
        "entry_count": len(subtitle_entries),
        "source": "tts_word_timing",
        "entries": subtitle_entries,
    }

    output_path = cache.save_json(step_key, subtitles_data)

    return {
        "provider": "tts_word_timing",
        "style": config.get("subtitle_style", "standard"),
        "entry_count": len(subtitle_entries),
        "total_duration": round(current_offset_ms / 1000.0, 3),
        "output_path": str(output_path),
        "cost_estimate_usd": 0.0,
    }


async def step_composition(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Adım 5: Video kompozisyon — Remotion (Faz 8'de gerçek entegrasyon).

    Şu an tüm asset'lerin mevcut olduğunu doğrular ve bir manifest
    oluşturur. Gerçek Remotion render'ı Faz 8'de eklenecek.
    """
    script_data = cache.load_json("script")
    tts_data = cache.load_json("tts")
    visuals_data = cache.load_json("visuals")
    subtitles_data = cache.load_json("subtitles")

    # Asset özeti
    scene_count = len(script_data.get("scenes", [])) if script_data else 0
    total_duration = tts_data.get("total_duration_seconds", 0) if tts_data else 0
    visual_count = visuals_data.get("downloaded", 0) if visuals_data else 0
    subtitle_count = subtitles_data.get("entry_count", 0) if subtitles_data else 0

    log.info(
        "Composition asset özeti",
        job_id=job_id[:8],
        scene_count=scene_count,
        total_duration=total_duration,
        visual_count=visual_count,
        subtitle_count=subtitle_count,
    )

    # Remotion input props oluştur (Faz 8'de kullanılacak)
    composition_props = {
        "resolution": config.get("video_resolution", "1920x1080"),
        "fps": config.get("video_fps", 30),
        "duration_seconds": round(total_duration, 2),
        "scene_count": scene_count,
        "subtitle_style": config.get("subtitle_style", "standard"),
        "ken_burns_enabled": config.get("ken_burns_enabled", True),
        "ken_burns_intensity": config.get("ken_burns_intensity", 0.05),
        "background_music_enabled": config.get("background_music_enabled", False),
        "scenes": [],
    }

    # Her sahne için asset bilgilerini topla
    tts_files = tts_data.get("files", []) if tts_data else []
    visual_files = visuals_data.get("files", []) if visuals_data else []

    for i in range(scene_count):
        scene_asset: dict[str, Any] = {"scene_number": i + 1}

        if i < len(tts_files):
            scene_asset["audio_file"] = tts_files[i].get("filename")
            scene_asset["audio_duration"] = tts_files[i].get("duration_seconds", 0)

        if i < len(visual_files):
            scene_asset["visual_file"] = visual_files[i].get("filename")

        composition_props["scenes"].append(scene_asset)

    # Placeholder final video oluştur (Faz 8'de Remotion render'ı yapılacak)
    placeholder_video = (
        f"REMOTION_RENDER_PENDING_{job_id[:8]}_"
        f"{config.get('video_resolution', '1920x1080')}_"
        f"{config.get('video_fps', 30)}fps"
    ).encode("utf-8") * 100

    final_path = cache.save_binary(step_key, placeholder_video, "final.mp4")
    cache.save_json(step_key, composition_props)

    return {
        "provider": "remotion_pending",
        "resolution": config.get("video_resolution", "1920x1080"),
        "duration_seconds": round(total_duration, 2),
        "scene_count": scene_count,
        "output_file": str(final_path),
        "output_path": str(final_path),
        "cost_estimate_usd": 0.0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Yardımcı fonksiyonlar
# ─────────────────────────────────────────────────────────────────────────────


def _normalize_script(
    data: Any,
    title: str,
    scene_count: int,
    language: str,
) -> dict[str, Any]:
    """
    LLM çıktısını standart script formatına normalize eder.

    Eksik alanları tamamlar, fazla sahne varsa keser,
    az sahne varsa hata fırlatır.
    """
    if not isinstance(data, dict):
        return _fallback_parse_script(str(data), title, scene_count, language)

    data.setdefault("title", title)
    data.setdefault("language", language)

    scenes = data.get("scenes", [])
    if not scenes:
        raise RuntimeError("LLM boş senaryo döndürdü — scenes listesi boş.")

    # Sahne normalizasyonu
    for i, scene in enumerate(scenes):
        scene.setdefault("scene_number", i + 1)
        scene.setdefault("narration", f"Sahne {i + 1} metni.")
        scene.setdefault("visual_keyword", f"scene {i + 1}")
        scene.setdefault("duration_hint_seconds", random.uniform(15, 22))

    data["scene_count"] = len(scenes)
    data["total_estimated_duration"] = sum(
        s.get("duration_hint_seconds", 18) for s in scenes
    )

    return data


def _fallback_parse_script(
    text: str,
    title: str,
    scene_count: int,
    language: str,
) -> dict[str, Any]:
    """
    JSON parse edilemeyen LLM çıktısını basit senaryo yapısına dönüştürür.

    Metni paragraflara böler ve her paragrafı bir sahne olarak kullanır.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    if not paragraphs:
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    scenes = []
    for i in range(min(len(paragraphs), scene_count)):
        scenes.append({
            "scene_number": i + 1,
            "narration": paragraphs[i][:500],
            "visual_keyword": f"scene {i + 1} {title.split()[0] if title else 'video'}",
            "duration_hint_seconds": random.uniform(15, 22),
        })

    # Yeterli sahne yoksa kopyala
    while len(scenes) < max(scene_count // 2, 3):
        idx = len(scenes)
        scenes.append({
            "scene_number": idx + 1,
            "narration": f"Sahne {idx + 1}: {title} hakkında devam.",
            "visual_keyword": f"scene {idx + 1}",
            "duration_hint_seconds": random.uniform(15, 22),
        })

    return {
        "title": title,
        "language": language,
        "scene_count": len(scenes),
        "total_estimated_duration": sum(s["duration_hint_seconds"] for s in scenes),
        "scenes": scenes,
    }


def _fallback_metadata(title: str, language: str) -> dict[str, Any]:
    """LLM başarısız olduğunda kullanılan basit metadata."""
    return {
        "youtube_title": f"{title} | Detaylı Analiz",
        "youtube_description": (
            f"Bu videoda {title} konusunu derinlemesine inceliyoruz.\n\n"
            f"#Video #İçerik #ContentManager"
        ),
        "tags": [
            title.lower().replace(" ", "_"),
            "video",
            "analiz",
            language,
        ],
        "category": "Education",
        "language": language,
    }


# ─────────────────────────────────────────────────────────────────────────────
# StandardVideoModule Sınıfı
# ─────────────────────────────────────────────────────────────────────────────


class StandardVideoModule(ContentModule):
    """
    Genel amaçlı YouTube video üretim modülü.

    6 adımlı pipeline: Script → Metadata → TTS → Visuals → Subtitles → Composition

    Faz 6: Script, TTS ve Visuals gerçek provider'ları kullanır.
    Metadata = LLM + fallback, Subtitles = TTS word-timing,
    Composition = Remotion placeholder (Faz 8).
    """

    name = "standard_video"
    display_name = "Standart Video"
    description = (
        "Genel amaçlı YouTube video üretimi. Konu girin, "
        "senaryo, ses, görsel, altyazı ve final video otomatik üretilsin."
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
        """6 adımlı standard video pipeline tanımını döndürür."""
        return [
            PipelineStepDef(
                key="script",
                label="Senaryo Üretimi",
                order=0,
                capability=Capability.SCRIPT_GENERATION,
                execute=step_script,
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
        """Standard video modülünün varsayılan ayarlarını döndürür."""
        return dict(DEFAULT_CONFIG)
