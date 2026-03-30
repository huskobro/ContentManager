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

    # ── TTS ─────────────────────────────────────────────────────────────
    "tts_provider": "edge_tts",
    "tts_voice": "tr-TR-AhmetNeural",
    "tts_speed": 1.0,

    # ── Görseller ───────────────────────────────────────────────────────
    "visuals_provider": "pexels",

    # ── Altyazı ─────────────────────────────────────────────────────────
    "subtitle_style": "standard",
    "subtitle_font_size": 48,

    # ── Video kompozisyon ───────────────────────────────────────────────
    "video_resolution": "1920x1080",
    "video_fps": 30,

    # ── Ken Burns efekti ────────────────────────────────────────────────
    "ken_burns_enabled": True,
    "ken_burns_intensity": 0.05,
}
