"""
JobPublishTarget + PublishAttempt ORM Modelleri.

JobPublishTarget:
  Bir job'un belirli bir platforma yayın hedefini temsil eder.
  Job başına platform başına tek kayıt (uq_job_platform).
  Job.youtube_* alanlarının platform-genel, future-proof karşılığı.

PublishAttempt:
  Her publish girişiminin audit kaydı. Hem başarı hem hata için
  request/response snapshot'ları saklar. Retry geçmişi burada.

Geriye dönük uyumluluk:
  PublishOrchestrator başarılı/başarısız her YouTube yayınında
  Job.youtube_* compat alanlarını da günceller. Bu sayede mevcut
  frontend kodu (JobDetail.tsx YoutubeUploadCard) kırılmadan çalışır.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


def _new_id() -> str:
    return uuid.uuid4().hex


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobPublishTarget(Base):
    """Bir job'un belirli bir platforma yayın hedefi."""

    __tablename__ = "job_publish_targets"

    id: str = Column(String(32), primary_key=True, default=_new_id)

    # Yabancı anahtarlar
    job_id: str = Column(
        String(32),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform_account_id: int = Column(
        Integer,
        ForeignKey("platform_accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Platform metadata
    platform: str = Column(
        String(32),
        nullable=False,
        comment="youtube | tiktok | instagram | facebook",
    )
    publish_type: str = Column(
        String(32),
        nullable=False,
        default="video",
        comment="video | short | reel | story | post",
    )
    content_type: str = Column(
        String(64),
        nullable=False,
        default="standard_video",
        comment="standard_video | news_bulletin | product_review",
    )

    # Durum takibi
    status: str = Column(
        String(32),
        nullable=False,
        default="pending",
        index=True,
        comment="pending | publishing | published | failed | skipped",
    )

    # Gizlilik ayarı
    privacy_status: str = Column(
        String(32),
        nullable=False,
        default="private",
        comment="private | unlisted | public",
    )

    # Zamanlama (gelecek kullanım)
    scheduled_publish_time: str = Column(
        String(64),
        nullable=True,
        comment="ISO-8601 UTC — gelecekteki planlanmış yayın zamanı",
    )

    # Sonuçlar
    external_object_id: str = Column(
        String(128),
        nullable=True,
        comment="Platform tarafından atanan içerik ID'si (YouTube video_id vb.)",
    )
    external_url: str = Column(
        String(512),
        nullable=True,
        comment="Yayınlanan içeriğin tam URL'si",
    )

    # Hata takibi
    error_message: str = Column(Text, nullable=True)
    attempts_count: int = Column(Integer, nullable=False, default=0)
    last_attempt_at: str = Column(String(64), nullable=True)

    # Zaman damgaları
    created_at: str = Column(String(64), nullable=False, default=_utcnow)
    updated_at: str = Column(String(64), nullable=False, default=_utcnow, onupdate=_utcnow)

    # İlişkiler
    attempts = relationship(
        "PublishAttempt",
        back_populates="target",
        cascade="all, delete-orphan",
        order_by="PublishAttempt.created_at",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_jpt_job_platform", "job_id", "platform"),
    )


class PublishAttempt(Base):
    """Her yayın girişiminin audit kaydı."""

    __tablename__ = "publish_attempts"

    id: str = Column(String(32), primary_key=True, default=_new_id)

    publish_target_id: str = Column(
        String(32),
        ForeignKey("job_publish_targets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Girişim metadata
    status: str = Column(
        String(32),
        nullable=False,
        default="pending",
        comment="pending | success | failed | cancelled",
    )
    action_type: str = Column(
        String(32),
        nullable=False,
        default="publish",
        comment="publish | retry | cancel",
    )

    # Audit snapshot'lar — JSON metin olarak saklanır
    request_payload_snapshot: str = Column(
        Text,
        nullable=True,
        comment="Platforma gönderilen isteğin JSON anlık görüntüsü",
    )
    response_payload_snapshot: str = Column(
        Text,
        nullable=True,
        comment="Platform API yanıtının JSON anlık görüntüsü",
    )

    # Hata detayı
    error_message: str = Column(Text, nullable=True)

    # Zamanlama
    started_at: str = Column(String(64), nullable=True)
    finished_at: str = Column(String(64), nullable=True)
    created_at: str = Column(String(64), nullable=False, default=_utcnow)

    # İlişki
    target = relationship("JobPublishTarget", back_populates="attempts")

    __table_args__ = (
        Index("ix_pa_target_created", "publish_target_id", "created_at"),
    )
