"""
YouTubeChannel ORM Modeli — youtube_channels tablosu.

Her kayıt bağlı bir YouTube kanalını temsil eder.
OAuth 2.0 token'ları burada saklanır (access + refresh).

Tasarım:
  - channel_id: YouTube'dan gelen kanal ID'si (UCxxxx), benzersiz
  - is_default: Tek kanal varsayılan olabilir; upload endpoint'i bunu kullanır
  - access_token / refresh_token: Google OAuth2 token'ları (şifreli değil — DB erişim koruması yeterli)
  - token_expiry: ISO 8601 UTC; pipeline upload öncesi kontrol eder
  - is_active: Kanal bağlantısı kesilmişse False yapılır, kayıt tutulur
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text

from backend.database import Base


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class YouTubeChannel(Base):
    __tablename__ = "youtube_channels"

    id: int = Column(Integer, primary_key=True, autoincrement=True)

    # YouTube kimliği
    channel_id: str = Column(String(64), nullable=False, unique=True, index=True)
    channel_name: str = Column(String(256), nullable=False, default="")
    channel_thumbnail: str = Column(Text, nullable=False, default="")

    # OAuth token'lar
    access_token: str = Column(Text, nullable=False, default="")
    refresh_token: str = Column(Text, nullable=False, default="")
    token_expiry: str = Column(String(64), nullable=False, default="")  # ISO 8601

    # Yönetim
    is_default: bool = Column(Boolean, nullable=False, default=False)
    is_active: bool = Column(Boolean, nullable=False, default=True)

    # Zaman damgaları
    connected_at: str = Column(String(64), nullable=False, default=_utcnow)
    updated_at: str = Column(String(64), nullable=False, default=_utcnow, onupdate=_utcnow)
