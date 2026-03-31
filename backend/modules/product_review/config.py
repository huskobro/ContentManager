"""
Product Review Module — Varsayılan yapılandırma.

İnceleme videosuna özgü ayarlar: Pro/Con bölüm sayıları,
puan sistemi, sahne dağılımı vb.

Not:
    Sadece pipeline step'lerinde fiilen okunan ayarlar burada tutulur.
    Pipeline'da okunmayan ayarlar 2026-03-31 teşhis raporuyla kaldırılmıştır.
"""

DEFAULT_CONFIG: dict = {
    # --- Sahne & Süre ---
    "scene_count": 8,  # hook, overview, 2 pros, 2 cons, verdict, closing
    "target_duration_seconds": 150,
    "language": "tr",
    # --- LLM / Script ---
    "llm_provider": "kieai",
    "script_temperature": 0.7,
    "script_max_tokens": 4096,
    # --- İnceleme Yapısı ---
    "review_sections": ["hook", "overview", "pros", "cons", "verdict"],
    "review_pros_count": 3,
    "review_cons_count": 3,
    "review_score_enabled": True,  # 1-10 arası puan verdict bölümünde
    # --- TTS ---
    # tts_voice burada tanımlanmıyor — _GLOBAL_DEFAULTS'tan gelir.
    # Varsayılan: config.py default_tts_voice. Admin panelinden override edilebilir.
    "tts_provider": "edge_tts",
    "tts_speed": 1.0,
    # --- Görseller ---
    "visuals_provider": "pexels",
    # --- Altyazı ---
    "subtitle_style": "standard",
    "subtitle_font_size": 48,
    # --- Video Çıktı ---
    "video_resolution": "1920x1080",
    "video_fps": 30,
    "ken_burns_enabled": True,

    # --- İnceleme görsel stili (YTRobot-v3'ten port) ---
    "review_style": "modern",         # modern, dark, energetic, minimal, premium
    "review_price_enabled": False,    # Fiyat badge'i (veri gerektirir)
    "review_star_rating_enabled": False,  # Yıldız puanı (veri gerektirir)
    "review_comments_enabled": False,     # Floating comments (veri gerektirir)
    "subtitle_animation": "none",
    "subtitle_font": "inter",

    # -- TTS post-processing ---
    "tts_clean_apostrophes": True,
    "tts_trim_silence": True,
    "tts_apply_speed_post": False,
}
