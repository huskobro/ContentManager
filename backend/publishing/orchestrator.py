"""
Publishing Hub Orchestrator — Faz 11.1A

Sorumluluğu:
  - Hedef (JobPublishTarget) için doğru adapter'ı seçer
  - Yayın girişimini (PublishAttempt) başlatır ve sonucu kaydeder
  - JobPublishTarget.status / external_object_id'yi günceller
  - YouTube yayınlarında Job.youtube_* compat alanlarını günceller

Adapter Registry:
  _ADAPTER_REGISTRY dict'ine platform adı → adapter sınıfı eklenir.
  Yeni platform eklemek için sadece yeni bir adapter yazıp register_adapter()
  çağırmak yeterlidir — orchestrator'da değişiklik gerekmez.

Bu modül import edildiğinde YouTubeAdapter otomatik olarak kayıt edilir.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from backend.publishing.adapters.base import BasePublishAdapter, PublishError
from backend.utils.logger import get_logger

log = get_logger(__name__)

# ─── Adapter Registry ─────────────────────────────────────────────────────────

_ADAPTER_REGISTRY: dict[str, type[BasePublishAdapter]] = {}


def register_adapter(platform: str, adapter_cls: type[BasePublishAdapter]) -> None:
    """
    Bir platform için adapter sınıfını kayıt eder.

    Args:
        platform:    "youtube" | "tiktok" | "instagram" | "facebook" | ...
        adapter_cls: BasePublishAdapter'dan türeyen sınıf.
    """
    _ADAPTER_REGISTRY[platform] = adapter_cls
    log.debug("Publish adapter kayıt edildi", platform=platform, adapter=adapter_cls.__name__)


def get_adapter(platform: str) -> BasePublishAdapter:
    """
    Platform için adapter instance döndürür.

    Raises:
        KeyError: Platform için kayıtlı adapter yoksa.
    """
    cls = _ADAPTER_REGISTRY.get(platform)
    if cls is None:
        available = list(_ADAPTER_REGISTRY.keys())
        raise KeyError(
            f"'{platform}' platformu için publish adapter kayıtlı değil. "
            f"Mevcut: {available}"
        )
    return cls()


def list_registered_platforms() -> list[str]:
    """Kayıtlı tüm platform adlarını döndürür."""
    return list(_ADAPTER_REGISTRY.keys())


# ─── Yardımcı ─────────────────────────────────────────────────────────────────

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_external_url(platform: str, external_id: str) -> str:
    """Platform + external ID'den public URL üretir."""
    templates: dict[str, str] = {
        "youtube":   "https://www.youtube.com/watch?v={id}",
        "tiktok":    "https://www.tiktok.com/video/{id}",
        "instagram": "https://www.instagram.com/p/{id}/",
        "facebook":  "https://www.facebook.com/video/{id}",
    }
    tmpl = templates.get(platform)
    if tmpl:
        return tmpl.format(id=external_id)
    return external_id


# ─── Orchestrator ─────────────────────────────────────────────────────────────

class PublishOrchestrator:
    """
    Tek bir platform hedefine yayın yapar.

    Sözleşme:
      1. PlatformAccount'u yükle
      2. PublishAttempt satırını oluştur (started_at)
      3. Adapter'ı seç ve publish() çağır
      4. Başarıda: target.status=published, external_object_id/external_url güncelle
      5. Başarısızlıkta: target.status=failed, error_message güncelle
      6. PublishAttempt'i bitir (finished_at, status, response_snapshot)
      7. YouTube platformu ise Job.youtube_* compat alanlarını güncelle

    Not: Token refresh adapter.publish() içinde yapılır (db parametresi ile).
    Orchestrator token'a doğrudan erişmez.
    """

    def __init__(self, db: Any) -> None:
        self._db = db

    async def publish_job(
        self,
        job_id: str,
        target: Any,                # JobPublishTarget ORM instance
        video_path: str,
        metadata: dict[str, Any],
        progress_callback: Any,     # async callable(phase: str, percent: int | None)
    ) -> Any:  # PublishAttempt
        """
        Verilen hedef için tek bir yayın girişimi yürütür.

        Args:
            job_id:            Üst job'un kimliği (loglama + compat bridge için).
            target:            JobPublishTarget ORM satırı.
            video_path:        Son video dosyasının mutlak yolu.
            metadata:          normalize_metadata() çıktısı.
            progress_callback: async çağrılabilir (phase, percent).

        Returns:
            PublishAttempt ORM instance (sonuçla birlikte).

        Raises:
            PublishError: Adapter publish'i başarısız yaparsa (compat için de fırlatılır).
            Exception:    Beklenmedik hatalar için.
        """
        from backend.models.publish_target import PublishAttempt
        from backend.models.platform_account import PlatformAccount

        # PlatformAccount'u yükle
        account = None
        if target.platform_account_id is not None:
            account = self._db.query(PlatformAccount).filter_by(
                id=target.platform_account_id
            ).first()

        # PublishAttempt kaydı oluştur
        attempt = PublishAttempt(
            publish_target_id=target.id,
            action_type="publish",
            status="pending",
            started_at=_utcnow(),
        )
        self._db.add(attempt)
        self._db.flush()  # attempt.id al, henüz commit etme

        # Adapter seç
        try:
            adapter = get_adapter(target.platform)
        except KeyError as exc:
            attempt.status = "failed"
            attempt.error_message = str(exc)
            attempt.finished_at = _utcnow()
            target.status = "failed"
            target.error_message = str(exc)
            target.updated_at = _utcnow()
            self._db.commit()
            log.error(
                "Publish adapter bulunamadı",
                job_id=job_id[:8],
                platform=target.platform,
                error=str(exc),
            )
            return attempt

        # Request snapshot'ı kaydet (token içermez)
        attempt.request_payload_snapshot = json.dumps({
            "platform": target.platform,
            "privacy": target.privacy_status,
            "title": metadata.get("title", ""),
            "tag_count": len(metadata.get("tags", [])),
            "video_path": video_path,
        }, ensure_ascii=False)

        # Target durumunu "publishing" yap
        target.status = "publishing"
        target.attempts_count = (target.attempts_count or 0) + 1
        target.last_attempt_at = _utcnow()
        self._db.commit()

        try:
            external_id = await adapter.publish(
                target=target,
                account=account,
                video_path=video_path,
                metadata=metadata,
                privacy=target.privacy_status,
                progress_callback=progress_callback,
                db=self._db,
            )

            # Başarı yolu
            external_url = _build_external_url(target.platform, external_id)

            target.status = "published"
            target.external_object_id = external_id
            target.external_url = external_url
            target.updated_at = _utcnow()

            attempt.status = "success"
            attempt.response_payload_snapshot = json.dumps({
                "external_id": external_id,
                "external_url": external_url,
            }, ensure_ascii=False)
            attempt.finished_at = _utcnow()
            self._db.commit()

            log.info(
                "Yayın başarılı",
                job_id=job_id[:8],
                platform=target.platform,
                external_id=external_id,
            )

            # Geriye dönük uyumluluk: YouTube ise Job.youtube_* güncelle
            if target.platform == "youtube":
                channel_id = (
                    account.external_account_id if account else None
                )
                self._mirror_youtube_compat(
                    job_id=job_id,
                    video_id=external_id,
                    video_url=external_url,
                    channel_id=channel_id,
                    upload_status="completed",
                    uploaded_at=_utcnow(),
                )

        except PublishError as exc:
            target.status = "failed"
            target.error_message = str(exc)
            target.updated_at = _utcnow()

            attempt.status = "failed"
            attempt.error_message = str(exc)
            attempt.finished_at = _utcnow()
            self._db.commit()

            log.error(
                "Yayın başarısız (PublishError)",
                job_id=job_id[:8],
                platform=target.platform,
                code=exc.code,
                error=exc.message,
            )

            if target.platform == "youtube":
                self._mirror_youtube_compat(
                    job_id=job_id,
                    upload_status="failed",
                    error_code=exc.code,
                )
            raise

        except Exception as exc:
            msg = f"Beklenmedik hata: {str(exc)[:300]}"
            target.status = "failed"
            target.error_message = msg
            target.updated_at = _utcnow()

            attempt.status = "failed"
            attempt.error_message = msg
            attempt.finished_at = _utcnow()
            self._db.commit()

            log.error(
                "Yayın beklenmedik hata",
                job_id=job_id[:8],
                platform=target.platform,
                error=str(exc),
            )

            if target.platform == "youtube":
                self._mirror_youtube_compat(
                    job_id=job_id,
                    upload_status="failed",
                    error_code="PUBLISH_UNEXPECTED_ERROR",
                )
            raise

        return attempt

    def _mirror_youtube_compat(
        self,
        job_id: str,
        video_id: str | None = None,
        video_url: str | None = None,
        channel_id: str | None = None,
        upload_status: str | None = None,
        error_code: str | None = None,
        uploaded_at: str | None = None,
    ) -> None:
        """
        Job.youtube_* uyumluluk alanlarını günceller.

        Mevcut frontend kodu (JobDetail.tsx YoutubeUploadCard) bu alanları okuduğu için
        silmek yerine senkronize tutuyoruz. Yayın kaynağı artık JobPublishTarget.
        """
        try:
            from backend.models.job import Job as _Job
            job = self._db.query(_Job).filter_by(id=job_id).first()
            if not job:
                return
            if video_id is not None:
                job.youtube_video_id = video_id
            if video_url is not None:
                job.youtube_video_url = video_url
            if channel_id is not None:
                job.youtube_channel_id = channel_id
            if upload_status is not None:
                job.youtube_upload_status = upload_status
            if error_code is not None:
                job.youtube_error_code = error_code
            if uploaded_at is not None:
                job.youtube_uploaded_at = uploaded_at
            self._db.commit()
        except Exception as exc:
            log.error(
                "Job.youtube_* compat mirror başarısız",
                job_id=job_id[:8] if job_id else "?",
                error=str(exc),
            )
            try:
                self._db.rollback()
            except Exception:
                pass


# ─── Otomatik Adapter Kaydı ────────────────────────────────────────────────────
# Bu modül import edildiğinde YouTube adapter otomatik kayıt edilir.
# Yeni platform eklemek için buraya register_adapter() çağrısı ekleyin.

from backend.publishing.adapters.youtube_adapter import YouTubeAdapter  # noqa: E402

register_adapter("youtube", YouTubeAdapter)
