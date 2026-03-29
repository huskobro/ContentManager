"""
Altyazı Oluşturma Modülü — Kelime Bazlı Zamanlama ve Stil Sistemi.

3 katmanlı zamanlama stratejisi:
  1. TTS Word-Timing (birincil): Edge TTS'in WordBoundary event'lerinden
     gelen kelime bazlı zamanlama. Ücretsiz ve hassas.
  2. Whisper API (ikincil): OpenAI Whisper ile ses dosyasından transkripsiyon
     ve kelime bazlı zamanlama çıkarma. Ücretli ($0.006/dakika).
  3. Eşit Dağıtım (son çare): Kelime sayısına göre süreyi eşit böler.

5 altyazı stili (youtube_video_bot'tan):
  - standard: Beyaz metin, koyu gölge, alt konum
  - neon_blue: Cyan/elektrik mavisi parlama efekti, orta konum
  - gold: Altın/amber metin, hafif parlama, alt konum
  - minimal: Küçük beyaz metin, çok hafif gölge, sol alt konum
  - hormozi: Kalın beyaz metin, kelime bazlı sarı vurgulama, orta konum

Bu modül doğrudan pipeline step olarak veya standard_video'nun step_subtitles'ı
yerine kullanılabilir.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from backend.pipeline.cache import CacheManager
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Altyazı Stil Tanımları
# ─────────────────────────────────────────────────────────────────────────────

SUBTITLE_STYLES: dict[str, dict[str, Any]] = {
    "standard": {
        "name": "Standart",
        "font_weight": "bold",
        "font_color": "#FFFFFF",
        "shadow_color": "#000000",
        "shadow_blur": 4,
        "glow_enabled": False,
        "glow_color": None,
        "position": "bottom",
        "alignment": "center",
        "highlight_mode": "none",
        "highlight_color": None,
        "background_enabled": False,
        "background_color": None,
        "background_opacity": 0,
    },
    "neon_blue": {
        "name": "Neon Mavi",
        "font_weight": "bold",
        "font_color": "#00F5FF",
        "shadow_color": "#0066FF",
        "shadow_blur": 12,
        "glow_enabled": True,
        "glow_color": "#00AAFF",
        "position": "center",
        "alignment": "center",
        "highlight_mode": "none",
        "highlight_color": None,
        "background_enabled": False,
        "background_color": None,
        "background_opacity": 0,
    },
    "gold": {
        "name": "Altın",
        "font_weight": "bold",
        "font_color": "#FFD700",
        "shadow_color": "#8B6914",
        "shadow_blur": 6,
        "glow_enabled": True,
        "glow_color": "#FFA500",
        "position": "bottom",
        "alignment": "center",
        "highlight_mode": "none",
        "highlight_color": None,
        "background_enabled": False,
        "background_color": None,
        "background_opacity": 0,
    },
    "minimal": {
        "name": "Minimal",
        "font_weight": "normal",
        "font_color": "#FFFFFF",
        "shadow_color": "#333333",
        "shadow_blur": 2,
        "glow_enabled": False,
        "glow_color": None,
        "position": "bottom_left",
        "alignment": "left",
        "highlight_mode": "none",
        "highlight_color": None,
        "background_enabled": False,
        "background_color": None,
        "background_opacity": 0,
    },
    "hormozi": {
        "name": "Hormozi Shorts",
        "font_weight": "900",
        "font_color": "#FFFFFF",
        "shadow_color": "#000000",
        "shadow_blur": 8,
        "glow_enabled": False,
        "glow_color": None,
        "position": "center",
        "alignment": "center",
        "highlight_mode": "word",
        "highlight_color": "#FFD700",
        "background_enabled": True,
        "background_color": "#000000",
        "background_opacity": 0.5,
    },
}


def get_style_config(style_name: str) -> dict[str, Any]:
    """
    Belirtilen altyazı stilinin tam konfigürasyonunu döndürür.

    Args:
        style_name: Stil adı ("standard", "neon_blue", "gold", "minimal", "hormozi").

    Returns:
        Stil konfigürasyon dict'i. Tanınmayan stil için "standard" döner.
    """
    return dict(SUBTITLE_STYLES.get(style_name, SUBTITLE_STYLES["standard"]))


# ─────────────────────────────────────────────────────────────────────────────
# Whisper API Entegrasyonu
# ─────────────────────────────────────────────────────────────────────────────

_WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions"
_WHISPER_COST_PER_MINUTE = 0.006  # $0.006/dakika


async def transcribe_with_whisper(
    audio_path: str,
    api_key: str,
    language: str = "tr",
) -> dict[str, Any] | None:
    """
    OpenAI Whisper API ile ses dosyasından kelime bazlı transkripsiyon çıkarır.

    Args:
        audio_path: Ses dosyasının mutlak yolu (MP3, WAV, M4A, vb.).
        api_key: OpenAI API anahtarı.
        language: Transkripsiyon dili (ISO 639-1).

    Returns:
        Whisper API response dict'i (word-level timestamps dahil).
        Başarısız olursa None.
    """
    if not os.path.exists(audio_path):
        log.warning("Whisper: Ses dosyası bulunamadı", path=audio_path)
        return None

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(audio_path, "rb") as audio_file:
                resp = await client.post(
                    _WHISPER_API_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    data={
                        "model": "whisper-1",
                        "language": language,
                        "response_format": "verbose_json",
                        "timestamp_granularity[]": "word",
                    },
                    files={"file": (os.path.basename(audio_path), audio_file)},
                )
                resp.raise_for_status()
                return resp.json()

    except Exception as exc:
        log.warning(
            "Whisper API hatası",
            error=str(exc)[:300],
            path=audio_path[:80],
        )
        return None


def _extract_word_timings_from_whisper(
    whisper_response: dict[str, Any],
    offset_seconds: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Whisper API yanıtından kelime bazlı zamanlama listesi çıkarır.

    Args:
        whisper_response: Whisper API'nin verbose_json yanıtı.
        offset_seconds: Global zaman offseti (sahne birleştirme için).

    Returns:
        [{"word": str, "start": float, "end": float}, ...]
    """
    words = whisper_response.get("words", [])

    result = []
    for w in words:
        result.append({
            "word": w.get("word", "").strip(),
            "start": round(w.get("start", 0.0) + offset_seconds, 3),
            "end": round(w.get("end", 0.0) + offset_seconds, 3),
        })

    return result


# ─────────────────────────────────────────────────────────────────────────────
# TTS Word-Timing Çıkarma
# ─────────────────────────────────────────────────────────────────────────────

def _extract_word_timings_from_tts(
    tts_word_timings: list[dict[str, Any]],
    offset_seconds: float = 0.0,
) -> list[dict[str, Any]]:
    """
    TTS (Edge TTS) WordBoundary event'lerinden kelime bazlı zamanlama çıkarır.

    Args:
        tts_word_timings: TTS'ten gelen [{word, start_ms, end_ms}, ...] listesi.
        offset_seconds: Global zaman offseti.

    Returns:
        [{"word": str, "start": float, "end": float}, ...]
    """
    result = []
    for wt in tts_word_timings:
        start_sec = wt.get("start_ms", 0) / 1000.0 + offset_seconds
        end_sec = wt.get("end_ms", 0) / 1000.0 + offset_seconds
        result.append({
            "word": wt.get("word", ""),
            "start": round(start_sec, 3),
            "end": round(end_sec, 3),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Eşit Dağıtım Fallback
# ─────────────────────────────────────────────────────────────────────────────

def _distribute_words_evenly(
    text: str,
    duration_seconds: float,
    offset_seconds: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Kelime bazlı zamanlama yoksa süreyi kelimelere eşit böler.

    Args:
        text: Narasyon metni.
        duration_seconds: Toplam sahne süresi.
        offset_seconds: Global zaman offseti.

    Returns:
        [{"word": str, "start": float, "end": float}, ...]
    """
    words = text.split() if text else ["..."]
    time_per_word = duration_seconds / max(len(words), 1)

    result = []
    for i, word in enumerate(words):
        start = offset_seconds + i * time_per_word
        end = start + time_per_word
        result.append({
            "word": word,
            "start": round(start, 3),
            "end": round(end, 3),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Ana Pipeline Step Fonksiyonu
# ─────────────────────────────────────────────────────────────────────────────

async def step_subtitles_enhanced(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Gelişmiş Altyazı Oluşturma Adımı.

    3 katmanlı zamanlama stratejisi:
      1. TTS Word-Timing (ücretsiz, varsayılan)
      2. Whisper API (ücretli, ses dosyasından)
      3. Eşit dağıtım (son çare)

    Çıktı JSON'ına altyazı stili metadata'sı gömülür.
    """
    tts_data = cache.load_json("tts")
    script_data = cache.load_json("script")

    if not tts_data:
        raise RuntimeError("TTS verisi bulunamadı — altyazı öncesinde TTS adımı tamamlanmalı.")

    scenes = script_data.get("scenes", []) if script_data else []
    tts_files = tts_data.get("files", [])

    # Stil bilgisini al
    style_name = config.get("subtitle_style", "standard")
    style_config = get_style_config(style_name)
    font_size = config.get("subtitle_font_size", 48)

    # Whisper kullanılacak mı?
    use_whisper = config.get("subtitle_use_whisper", False)
    openai_api_key = config.get("openai_api_key", "")
    whisper_available = use_whisper and bool(openai_api_key)

    subtitle_entries = []
    current_offset_sec = 0.0
    total_cost = 0.0
    timing_source = "tts_word_timing"  # Varsayılan kaynak

    for i, tts_file in enumerate(tts_files):
        scene_num = tts_file.get("scene_number", i + 1)
        duration_sec = tts_file.get("duration_seconds", 15.0)
        tts_word_timings = tts_file.get("word_timings", [])

        # Narasyon metnini al
        narration = ""
        if i < len(scenes):
            narration = scenes[i].get("narration", "")

        word_timings: list[dict[str, Any]] = []
        scene_timing_source = "unknown"

        # Strateji 1: TTS Word-Timing
        if tts_word_timings:
            word_timings = _extract_word_timings_from_tts(
                tts_word_timings, current_offset_sec
            )
            scene_timing_source = "tts_word_timing"

        # Strateji 2: Whisper API (TTS timing yoksa ve Whisper aktifse)
        elif whisper_available:
            audio_filename = tts_file.get("filename", "")
            if audio_filename:
                audio_path = str(cache.get_output_path("tts", audio_filename))

                whisper_result = await transcribe_with_whisper(
                    audio_path,
                    openai_api_key,
                    language=config.get("language", "tr"),
                )

                if whisper_result:
                    word_timings = _extract_word_timings_from_whisper(
                        whisper_result, current_offset_sec
                    )
                    scene_timing_source = "whisper"

                    # Maliyet hesapla
                    cost = (duration_sec / 60.0) * _WHISPER_COST_PER_MINUTE
                    total_cost += cost

                    log.info(
                        "Whisper transkripsiyon tamamlandı",
                        scene=scene_num,
                        words=len(word_timings),
                        cost_usd=round(cost, 4),
                    )

        # Strateji 3: Eşit dağıtım (son çare)
        if not word_timings:
            word_timings = _distribute_words_evenly(
                narration, duration_sec, current_offset_sec
            )
            scene_timing_source = "equal_distribution"

        if scene_timing_source != "tts_word_timing":
            timing_source = scene_timing_source

        subtitle_entries.append({
            "scene_number": scene_num,
            "text": narration or f"Sahne {scene_num}",
            "start_time": round(current_offset_sec, 3),
            "end_time": round(current_offset_sec + duration_sec, 3),
            "word_timings": word_timings,
            "timing_source": scene_timing_source,
        })

        current_offset_sec += duration_sec

    # Çıktı JSON — stil metadata'sı gömülü
    subtitles_output = {
        "style": style_name,
        "style_config": style_config,
        "font_size": font_size,
        "total_duration": round(current_offset_sec, 3),
        "entry_count": len(subtitle_entries),
        "timing_source": timing_source,
        "entries": subtitle_entries,
    }

    output_path = cache.save_json(step_key, subtitles_output)

    return {
        "provider": timing_source,
        "style": style_name,
        "entry_count": len(subtitle_entries),
        "total_duration": round(current_offset_sec, 3),
        "timing_source": timing_source,
        "whisper_cost_usd": round(total_cost, 4),
        "output_path": str(output_path),
        "cost_estimate_usd": total_cost,
    }


def get_available_styles() -> list[dict[str, str]]:
    """
    Kullanılabilir altyazı stillerini döndürür.

    Returns:
        [{"key": "standard", "name": "Standart"}, ...]
    """
    return [
        {"key": key, "name": style["name"]}
        for key, style in SUBTITLE_STYLES.items()
    ]
