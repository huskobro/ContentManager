"""
PlatformAccount ORM Modeli — platform_accounts tablosu.

YouTube, TikTok, Instagram, Facebook ve gelecekteki tüm platformlar
için tek bir hesap tablosu. YouTubeChannel'ın platform-genel karşılığı.

Tasarım:
  - platform: "youtube" | "tiktok" | "instagram" | "facebook" | ...
  - external_account_id: Platform tarafından atanan hesap ID'si (YouTube'da UCxxxxx)
  - credentials_json: OAuth token'ları JSON olarak saklar (access_token, refresh_token,
    token_expiry ve platform-spesifik alanlar). YouTubeChannel'ın
    ayrı ayrı sutunları yerine tek JSON blob.
  - is_default: Platform başına tek hesap varsayılan olabilir
  - is_active: Bağlantı kesilmişse False, kayıt silinmez

Geriye dönük uyumluluk:
  YouTubeChannel ORM modeli bu tabloyu REPLACE ETMİYOR.
  Geçiş dönemi boyunca her ikisi de mevcuttur.
  publishing/adapters/youtube_adapter.py, gerektiğinde YouTubeChannel
  → PlatformAccount köprüsü kurar.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text, UniqueConstraint

from backend.database import Base


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class PlatformAccount(Base):
    __tablename__ = "platform_accounts"

    id: int = Column(Integer, primary_key=True, autoincrement=True)

    # Platform kimliği
    platform: str = Column(
        String(32),
        nullable=False,
        index=True,
        comment="youtube | tiktok | instagram | facebook",
    )
    account_name: str = Column(
        String(256),
        nullable=False,
        default="",
        comment="İnsan okunabilir görünen ad (ör. kanal adı)",
    )
    external_account_id: str = Column(
        String(128),
        nullable=False,
        default="",
        index=True,
        comment="Platform tarafından atanan hesap ID'si (YouTube: UCxxxxxxx)",
    )

    # Kimlik bilgileri — sütun başına token yerine tek JSON blob
    credentials_json: str = Column(
        Text,
        nullable=False,
        default="{}",
        comment="JSON: {access_token, refresh_token, token_expiry, ...}",
    )

    # Yönetim
    is_active: bool = Column(Boolean, nullable=False, default=True)
    is_default: bool = Column(
        Boolean,
        nullable=False,
        default=False,
        comment="Platform başına tek varsayılan hesap",
    )

    # Zaman damgaları
    created_at: str = Column(String(64), nullable=False, default=_utcnow)
    updated_at: str = Column(String(64), nullable=False, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        UniqueConstraint("platform", "external_account_id", name="uq_platform_account"),
    )
