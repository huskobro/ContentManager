"""
Standard Video modülüne özgü varsayılan ayarlar.

Bu değerler 5 katmanlı hiyerarşinin "module" katmanında kullanılır.
Admin panelinden override edilebilir.

Yapı:
    DEFAULT_CONFIG dict'i modülün get_default_config() metodundan döner
    ve SettingsResolver'ın module katmanına bootstrap olarak yazılabilir.

Not:
    Sadece pipeline step'lerinde fiilen okunan ayarlar burada tutulur.
    Pipeline'da okunmayan ayarlar (ör. composition_engine, background_music_*)
    2026-03-31 teşhis raporuyla kaldırılmıştır — bkz. docs/QA_LOG.md
"""

from __future__ import annotations

from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    # ── İçerik üretimi ──────────────────────────────────────────────────
    "scene_count": 10,
    "target_duration_seconds": 180,
    "language": "tr",

    # ── Script üretimi ──────────────────────────────────────────────────
    "llm_provider": "kieai",
    "script_temperature": 0.8,
    "script_max_tokens": 4096,

    # ── Narration Enhancement (YTRobot-v3'ten port) ──────────────────────
    # LLM ile narasyon iyileştirme: doğallaştırma + TTS vurgu ekleme.
    # Kapalı iken narasyonlar olduğu gibi TTS'e gönderilir.
    "narration_humanize_enabled": False,  # Narasyon doğallaştırma (AI klişe temizleme)
    "narration_enhance_enabled": False,   # TTS vurgu ekleme (BÜYÜK HARF, ..., !)

    # ── TTS ─────────────────────────────────────────────────────────────
    # tts_voice burada tanımlanmıyor — _GLOBAL_DEFAULTS'tan gelir (settings_resolver.py).
    # Varsayılan: config.py default_tts_voice (tr-TR-EmelNeural).
    # Admin panelinden "tts_voice" key'i ile override edilebilir.
    "tts_provider": "edge_tts",
    "tts_speed": 1.0,
    # TTS ön-işleme (YTRobot-v3'ten port):
    "tts_clean_apostrophes": True,  # Apostrof kaldırma (Türkçe ek apostrofları mikro-duraklama yaratır)
    "tts_trim_silence": True,       # Baştaki sessizliği kırp (ffmpeg silenceremove)

    # ── Görseller ───────────────────────────────────────────────────────
    "visuals_provider": "pexels",

    # ── Altyazı ─────────────────────────────────────────────────────────
    "subtitle_style": "standard",
    "subtitle_font_size": 48,
    "subtitle_animation": "none",     # Karaoke animasyon: none, hype, explosive, vibrant, minimal_anim
    "subtitle_font": "inter",         # Font: inter, roboto, montserrat, oswald, bebas, serif, sans

    # ── Video kompozisyon ───────────────────────────────────────────────
    "video_resolution": "1920x1080",
    "video_fps": 30,

    # ── Ken Burns efekti ────────────────────────────────────────────────
    "ken_burns_enabled": True,
    "ken_burns_intensity": 0.05,
    "ken_burns_direction": "center",  # center, pan-left, pan-right, random

    # ── Video efektleri (YTRobot-v3'ten port) ──────────────────────────
    "video_effect": "none",     # none, vignette, warm, cool, cinematic
    "subtitle_bg": "none",      # none, box, pill

    # ── TTS post-processing ────────────────────────────────────────────
    # apply_speed: TTS'in kendi hız parametresi olmayan sağlayıcılarda
    # post-synthesis hız ayarı. Edge TTS pre-synthesis hız desteklediği
    # için varsayılan olarak kapalı.
    "tts_apply_speed_post": False,
}
