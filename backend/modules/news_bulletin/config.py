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

Not:
    Sadece pipeline step'lerinde fiilen okunan ayarlar burada tutulur.
    Pipeline'da okunmayan ayarlar 2026-03-31 teshis raporuyla kaldirilmistir.
"""

from __future__ import annotations

from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    # -- Icerik uretimi -------------------------------------------------
    "scene_count": 8,
    "target_duration_seconds": 120,
    "language": "tr",

    # -- Script uretimi -------------------------------------------------
    "llm_provider": "kieai",
    "script_temperature": 0.6,
    "script_max_tokens": 4096,

    # -- Haber kaynaklari -----------------------------------------------
    "news_sources": [],
    "news_max_articles": 5,
    "news_summary_max_chars": 500,

    # -- TTS ------------------------------------------------------------
    # tts_voice burada tanımlanmıyor — _GLOBAL_DEFAULTS'tan gelir.
    # Varsayılan: config.py default_tts_voice. Admin panelinden override edilebilir.
    "tts_provider": "edge_tts",
    "tts_speed": 1.05,

    # -- Gorseller ------------------------------------------------------
    "visuals_provider": "pexels",

    # -- Altyazi --------------------------------------------------------
    "subtitle_style": "standard",
    "subtitle_font_size": 48,

    # -- Video kompozisyon ----------------------------------------------
    "video_resolution": "1920x1080",
    "video_fps": 30,

    # -- Ken Burns efekti -----------------------------------------------
    "ken_burns_enabled": False,
}
