"""
News Bulletin modulune ozgu varsayilan ayarlar.

Bu degerler 5 katmanli hiyerarsinin "module" katmaninda kullanilir.
Admin panelinden override edilebilir.

StandardVideo'dan farklar:
  - scene_count: 8 (haber sayisi)
  - target_duration_seconds: 120 (daha kisa bulten)
  - script_temperature: 0.6 (haberlerde daha dusuk yaraticilik, daha yuksek dogruluk)
  - tts_speed: 1.05 (haber spikeri hizi)
  - ken_burns_enabled: False (haber gorselleri statik)
  - background_music_enabled: False
  - news_sources: [] (URL/RSS listesi, runtime'da doldurulur)
  - news_max_articles: 5
  - news_summary_max_chars: 500
"""

from __future__ import annotations

from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    # -- Icerik uretimi -------------------------------------------------
    "scene_count": 8,
    "target_duration_seconds": 120,
    "language": "tr",

    # -- Script uretimi -------------------------------------------------
    "llm_provider": "gemini",
    "llm_model": "gemini-2.5-flash",
    "script_temperature": 0.6,
    "script_max_tokens": 4096,

    # -- Haber kaynaklari -----------------------------------------------
    "news_sources": [],
    "news_max_articles": 5,
    "news_summary_max_chars": 500,

    # -- Metadata -------------------------------------------------------
    "generate_metadata": True,

    # -- TTS ------------------------------------------------------------
    "tts_provider": "edge_tts",
    "tts_voice": "tr-TR-AhmetNeural",
    "tts_speed": 1.05,

    # -- Gorseller ------------------------------------------------------
    "visuals_provider": "pexels",
    "visuals_orientation": "landscape",
    "visuals_min_duration": 5,

    # -- Altyazi --------------------------------------------------------
    "subtitle_style": "standard",
    "subtitle_font_size": 48,
    "subtitle_position": "bottom",
    "generate_subtitles": True,

    # -- Video kompozisyon ----------------------------------------------
    "video_resolution": "1920x1080",
    "video_fps": 30,
    "composition_engine": "remotion",

    # -- Ken Burns efekti -----------------------------------------------
    "ken_burns_enabled": False,

    # -- Muzik ----------------------------------------------------------
    "background_music_enabled": False,
}
