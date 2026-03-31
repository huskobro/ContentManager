"""
Global uygulama konfigürasyonu.

Pydantic BaseSettings ile çalışır:
  1. .env dosyasındaki değerler
  2. Gerçek ortam değişkenleri
  3. Buradaki kod-içi default'lar
öncelik sırasıyla uygulanır (1 > 2 > 3).

Kullanım:
    from backend.config import settings
    print(settings.backend_host)
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Projenin kök dizini (ContentManager/)
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """
    Tek kaynak, tüm ayarlar.

    Alanlar üç gruba ayrılır:
      A) Uygulama & sunucu
      B) Veritabanı & dosya sistemi
      C) Provider API anahtarları (admin panelinden SQLite'a da yazılır,
         ancak ilk yükleme için .env'den okunur)
    """

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # bilinmeyen .env anahtarlarını sessizce yoksay
    )

    # ── A) Uygulama & Sunucu ────────────────────────────────────────────────

    app_name: str = Field(default="ContentManager", description="Uygulama adı")
    app_version: str = Field(default="0.1.0", description="Semantic version")
    environment: Literal["development", "production"] = Field(
        default="development",
        description="Çalışma ortamı. 'production'da debug kapatılır.",
    )

    backend_host: str = Field(default="127.0.0.1", description="Uvicorn bind adresi")
    backend_port: int = Field(default=8000, description="Uvicorn port")
    backend_reload: bool = Field(
        default=True,
        description="Uvicorn hot-reload (yalnızca development'ta True olmalı)",
    )

    # CORS: virgülle ayrılmış origin listesi, .env'de
    #   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    # str olarak tutulur, _parse_cors validator liste döndürür
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Virgülle ayrılmış CORS origin listesi",
    )

    # Admin PIN — localhost-first basit yetkilendirme
    admin_pin: str = Field(
        default="0000",
        description="Admin panel erişim PIN'i. .env'de mutlaka değiştirilmeli.",
    )

    # ── B) Veritabanı & Dosya Sistemi ───────────────────────────────────────

    database_path: Path = Field(
        default=BASE_DIR / "contentmanager.db",
        description="SQLite veritabanı dosya yolu",
    )
    sessions_dir: Path = Field(
        default=BASE_DIR / "sessions",
        description="Her job'ın çıktı dosyalarının tutulduğu kök dizin",
    )
    output_dir: Path = Field(
        default=BASE_DIR / "output",
        description="Tamamlanan videoların kaydedileceği klasör",
    )
    tmp_dir: Path = Field(
        default=BASE_DIR / ".tmp",
        description="Pipeline ara dosyaları (gitignore'da)",
    )
    logs_dir: Path = Field(
        default=BASE_DIR / "logs",
        description="Uygulama log dosyaları",
    )

    # Pipeline çalışma sınırları
    max_concurrent_jobs: int = Field(
        default=2,
        ge=1,
        le=10,
        description="Aynı anda çalışabilecek maksimum job sayısı",
    )
    job_timeout_seconds: int = Field(
        default=1800,
        description="Bir job'ın zaman aşımı süresi (saniye, default 30 dk)",
    )

    # ── C) Provider API Anahtarları ─────────────────────────────────────────
    # Bu değerler .env'den gelir. Hiçbiri zorunlu değil (provider
    # devre dışıysa kullanılmaz); ancak ilgili provider aktifse
    # admin panelinde girilmesi gerekir.

    # LLM
    kieai_api_key: str = Field(
        default="", description="kie.ai üzerinden Gemini erişimi için API anahtarı"
    )
    openai_api_key: str = Field(default="", description="OpenAI API anahtarı (GPT + Whisper + TTS)")

    # TTS
    elevenlabs_api_key: str = Field(default="", description="ElevenLabs API anahtarı")

    # Visuals
    pexels_api_key: str = Field(default="", description="Pexels stok video/fotoğraf API anahtarı")

    # YouTube / Google OAuth2
    youtube_client_id: str = Field(default="", description="YouTube OAuth2 client ID")
    youtube_client_secret: str = Field(
        default="", description="YouTube OAuth2 client secret"
    )
    # GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env alias desteği
    google_client_id: str = Field(default="", description="Google OAuth2 client ID (alias)")
    google_client_secret: str = Field(default="", description="Google OAuth2 client secret (alias)")
    # OAuth callback adresi — Google Cloud Console'da kayıtlı olmalı
    youtube_oauth_redirect_uri: str = Field(
        default="http://localhost:8000/api/youtube/oauth/callback",
        description="Google OAuth2 redirect URI",
    )

    # ── D) Pipeline Varsayılanları ──────────────────────────────────────────
    # Bu değerler admin panelinden SQLite'a yazılabilir; burası sadece
    # ilk-açılış (bootstrap) default'larıdır.

    default_language: str = Field(default="tr", description="Varsayılan içerik dili")
    default_tts_provider: str = Field(
        default="edge_tts",
        description="Varsayılan TTS provider adı",
    )
    default_llm_provider: str = Field(
        default="kieai",
        description="Varsayılan LLM provider adı",
    )
    default_visuals_provider: str = Field(
        default="pexels",
        description="Varsayılan görsel kaynak provider adı",
    )
    default_video_resolution: str = Field(
        default="1920x1080",
        description="Varsayılan video çözünürlüğü",
    )
    default_video_fps: int = Field(default=30, description="Varsayılan kare hızı")
    default_subtitle_style: str = Field(
        default="standard",
        description="Varsayılan altyazı stili",
    )
    default_video_format: str = Field(
        default="long",
        description="Varsayılan video formatı: 'long' (16:9 yatay) veya 'shorts' (9:16 dikey)",
    )
    default_tts_voice: str = Field(
        default="tr-TR-EmelNeural",
        description="Varsayılan TTS ses adı (Edge TTS SSML voice ID). .env veya admin panelinden override edilebilir.",
    )

    # ── Validators ─────────────────────────────────────────────────────────

    @field_validator("database_path", "sessions_dir", "tmp_dir", "logs_dir", mode="after")
    @classmethod
    def _ensure_dirs(cls, v: Path) -> Path:
        """
        Dizin gerektiren path'ler için dizini oluşturur.
        database_path bir dosyadır — onun parent'ını oluşturur.
        """
        target = v.parent if v.suffix else v
        target.mkdir(parents=True, exist_ok=True)
        return v

    # ── Yardımcı özellikler ─────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def database_url(self) -> str:
        """SQLAlchemy bağlantı dizesi."""
        return f"sqlite:///{self.database_path}"

    @property
    def cors_origins_list(self) -> list[str]:
        """cors_origins string'ini liste olarak döndürür."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


# Tek örnek — tüm uygulama bu nesneyi import eder.
settings = Settings()
