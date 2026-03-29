"""
Standard Video modülüne özgü varsayılan ayarlar.

Bu değerler 5 katmanlı hiyerarşinin "module" katmanında kullanılır.
Admin panelinden override edilebilir.

Yapı:
    DEFAULT_CONFIG dict'i modülün get_default_config() metodundan döner
    ve SettingsResolver'ın module katmanına bootstrap olarak yazılabilir.
"""

from __future__ import annotations

from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    # ── İçerik üretimi ──────────────────────────────────────────────────
    "scene_count": 10,
    "target_duration_seconds": 180,
    "language": "tr",

    # ── Script üretimi ──────────────────────────────────────────────────
    "llm_provider": "gemini",
    "llm_model": "gemini-2.5-flash",
    "script_temperature": 0.8,
    "script_max_tokens": 4096,

    # ── Metadata ────────────────────────────────────────────────────────
    "metadata_provider": "gemini",
    "generate_metadata": True,
    "metadata_language": "tr",

    # ── TTS ─────────────────────────────────────────────────────────────
    "tts_provider": "edge_tts",
    "tts_voice": "tr-TR-AhmetNeural",
    "tts_speed": 1.0,

    # ── Görseller ───────────────────────────────────────────────────────
    "visuals_provider": "pexels",
    "visuals_per_scene": 1,
    "visuals_orientation": "landscape",
    "visuals_min_duration": 5,

    # ── Altyazı ─────────────────────────────────────────────────────────
    "subtitle_style": "standard",
    "subtitle_font_size": 48,
    "subtitle_position": "bottom",
    "generate_subtitles": True,

    # ── Video kompozisyon ───────────────────────────────────────────────
    "video_resolution": "1920x1080",
    "video_fps": 30,
    "video_format": "mp4",
    "composition_engine": "remotion",

    # ── Ken Burns efekti ────────────────────────────────────────────────
    "ken_burns_enabled": True,
    "ken_burns_intensity": 0.05,

    # ── Müzik ───────────────────────────────────────────────────────────
    "background_music_enabled": False,
    "background_music_volume": 0.15,
}
