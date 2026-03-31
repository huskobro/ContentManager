"""
Job ve JobStep ORM modelleri.

Job: Bir pipeline işini temsil eder (topic → final video).
JobStep: Pipeline'ın her adımının durumunu tutar (script, tts, visuals, …).

İlişki: Job 1 ←→ N JobStep (cascade delete).

Tasarım kararları:
  • id: UUID4 string — tüm katmanlarda tek biçimli tanımlayıcı
  • status enum: SQLite'ta VARCHAR olarak saklanır; Python tarafında Literal ile kısıtlanır
  • timestamps: ISO-8601 UTC string — SQLite native datetime yerine tutarlı JSON çıktı
  • cost_estimate_usd: REAL — provider API maliyetlerinin toplam tahmini
  • error_message: TEXT — fatal hata durumunda son hata açıklaması
  • output_path: iş tamamlandığında final_output.mp4'ün session-relatif yolu
  • session_dir: sessions/{job_id} — bu işe ait tüm ara ve son dosyalar
  • current_step: Pipeline'ın en son çalışan adımı — resume için kritik
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    String,
    Text,
    Integer,
    Float,
    Boolean,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow_iso() -> str:
    """UTC zaman damgası, ISO-8601 formatında."""
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    """UUID4 tabanlı benzersiz kimlik."""
    return uuid.uuid4().hex


class Job(Base):
    """
    Bir pipeline işi.

    Yaşam döngüsü:
      queued → running → completed | failed | cancelled

    Sistem kapandığında 'running' statüsündeki işler, yeniden açılışta
    tespit edilir ve current_step'ten itibaren devam edebilir
    (idempotent cache sayesinde).
    """

    __tablename__ = "jobs"

    # ── Kimlik ──────────────────────────────────────────────────────────────
    id: str = Column(String(32), primary_key=True, default=_new_id)

    # ── İçerik bilgisi ──────────────────────────────────────────────────────
    module_key: str = Column(
        String(64),
        nullable=False,
        index=True,
        comment="İçerik modülü: standard_video, news_bulletin, product_review",
    )
    title: str = Column(
        String(512),
        nullable=False,
        comment="Kullanıcının girdiği konu/başlık",
    )
    language: str = Column(
        String(10),
        nullable=False,
        default="tr",
        comment="İçerik dili (ISO 639-1)",
    )

    # ── Durum ───────────────────────────────────────────────────────────────
    status: str = Column(
        String(20),
        nullable=False,
        default="queued",
        index=True,
        comment="queued | running | completed | failed | cancelled",
    )
    current_step: str = Column(
        String(32),
        nullable=True,
        comment="Pipeline'ın en son çalışan adım anahtarı (resume için)",
    )
    error_message: str = Column(
        Text,
        nullable=True,
        comment="Fatal hata mesajı",
    )

    # ── Zaman damgaları ─────────────────────────────────────────────────────
    created_at: str = Column(
        String(32),
        nullable=False,
        default=_utcnow_iso,
        comment="Oluşturulma zamanı (ISO-8601 UTC)",
    )
    started_at: str = Column(
        String(32),
        nullable=True,
        comment="Pipeline başlatılma zamanı",
    )
    completed_at: str = Column(
        String(32),
        nullable=True,
        comment="Tamamlanma/başarısızlık zamanı",
    )

    # ── Çıktı ───────────────────────────────────────────────────────────────
    session_dir: str = Column(
        String(512),
        nullable=True,
        comment="sessions/{job_id} — bu işe ait dosya dizini",
    )
    output_path: str = Column(
        String(512),
        nullable=True,
        comment="Final video dosya yolu (session_dir'e göreceli)",
    )

    # ── YouTube upload ──────────────────────────────────────────────────────
    youtube_video_id: str = Column(
        String(32),
        nullable=True,
        comment="Yüklenen YouTube video ID'si (ör. dQw4w9WgXcQ)",
    )
    youtube_video_url: str = Column(
        String(256),
        nullable=True,
        comment="Yüklenen videonun YouTube URL'si",
    )
    youtube_channel_id: str = Column(
        String(64),
        nullable=True,
        comment="Yüklemenin yapıldığı kanal ID'si (UC...)",
    )
    youtube_upload_status: str = Column(
        String(32),
        nullable=True,
        comment="uploading | completed | failed | skipped",
    )
    youtube_error_code: str = Column(
        String(64),
        nullable=True,
        comment="Hata kodu (ör. YT_QUOTA_EXCEEDED, YT_AUTH_ERROR)",
    )
    youtube_uploaded_at: str = Column(
        String(32),
        nullable=True,
        comment="Yükleme tamamlanma zamanı (ISO-8601 UTC)",
    )

    # ── Maliyet takibi ──────────────────────────────────────────────────────
    cost_estimate_usd: float = Column(
        Float,
        nullable=False,
        default=0.0,
        comment="Toplam tahmini API maliyeti (USD)",
    )

    # ── Pipeline ayarları ───────────────────────────────────────────────────
    # Job başlatılırken resolve edilen ayarların anlık kopyası (JSON text).
    # Bu sayede sonradan admin default'ları değişse bile bu iş
    # kendi başlangıç ayarlarıyla yeniden başlatılabilir.
    resolved_settings_json: str = Column(
        Text,
        nullable=True,
        comment="Job başlatılırken çözümlenen ayar snapshot'ı (JSON)",
    )

    # ── İlişki ──────────────────────────────────────────────────────────────
    steps = relationship(
        "JobStep",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobStep.order",
        lazy="selectin",
        uselist=True,
    )

    # ── İndeksler ───────────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id[:8]}… status={self.status} module={self.module_key}>"


class JobStep(Base):
    """
    Pipeline'ın tek bir adımı.

    Her Job için sabit bir adım seti oluşturulur (modüle göre).
    Adım durumu SSE üzerinden frontend'e canlı olarak iletilir.
    """

    __tablename__ = "job_steps"

    # ── Kimlik ──────────────────────────────────────────────────────────────
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    job_id: str = Column(
        String(32),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Adım bilgisi ────────────────────────────────────────────────────────
    key: str = Column(
        String(32),
        nullable=False,
        comment="Adım tanımlayıcısı: script, metadata, tts, visuals, subtitles, composition",
    )
    label: str = Column(
        String(128),
        nullable=False,
        comment="Okunabilir adım adı (ör. 'Senaryo Üretimi')",
    )
    order: int = Column(
        Integer,
        nullable=False,
        comment="Sıralama indeksi (0-tabanlı)",
    )

    # ── Durum ───────────────────────────────────────────────────────────────
    status: str = Column(
        String(20),
        nullable=False,
        default="pending",
        comment="pending | running | completed | failed | skipped",
    )
    message: str = Column(
        Text,
        nullable=True,
        comment="Adıma ait özet mesaj veya hata detayı",
    )
    provider: str = Column(
        String(64),
        nullable=True,
        comment="Bu adımda kullanılan provider adı (ör. elevenlabs, pexels)",
    )

    # ── Zaman ───────────────────────────────────────────────────────────────
    started_at: str = Column(String(32), nullable=True)
    completed_at: str = Column(String(32), nullable=True)
    duration_ms: int = Column(
        Integer,
        nullable=True,
        comment="Adım süresi (milisaniye)",
    )

    # ── Maliyet ─────────────────────────────────────────────────────────────
    cost_estimate_usd: float = Column(
        Float,
        nullable=False,
        default=0.0,
        comment="Bu adımın tahmini API maliyeti (USD)",
    )

    # ── Cache (idempotency) ─────────────────────────────────────────────────
    cached: bool = Column(
        Boolean,
        nullable=False,
        default=False,
        comment="True ise bu adım önceden cache'lenmiş sonuçtan atlandı",
    )
    output_artifact: str = Column(
        Text,
        nullable=True,
        comment="Adım çıktı dosyası yolu — cache kontrolü için (session_dir'e göreceli)",
    )

    # ── İlişki ──────────────────────────────────────────────────────────────
    job = relationship("Job", back_populates="steps")

    # ── İndeksler ───────────────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_job_steps_job_order", "job_id", "order"),
    )

    def __repr__(self) -> str:
        return f"<JobStep job={self.job_id[:8]}… key={self.key} status={self.status}>"
