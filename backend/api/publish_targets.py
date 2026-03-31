"""
Publishing Hub API — Faz 11.2B

Endpoint'ler:
  GET  /api/jobs/{job_id}/publish-targets          → Job'a ait yayın hedefleri
  GET  /api/publish-targets/{target_id}/history    → Girişim geçmişi
  POST /api/publish-targets/{target_id}/retry      → Manuel yeniden yayın denemesi

Tasarım kararları:
  - retry endpoint'i mevcut `step_publish` akışını kullanmaz; orchestrator'ı doğrudan çağırır
  - Retry için video dosyası cache'den alınır (CacheManager)
  - Metadata job config'den yeniden oluşturulur (normalize_metadata)
  - Retry force=True ise 'published' hedef de yeniden denenir
  - Tüm endpoint'ler DB bağımlılığı için Depends(get_db) kullanır
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.publish_target import JobPublishTarget, PublishAttempt
from backend.models.schemas import (
    PublishAttemptResponse,
    PublishRetryRequest,
    PublishTargetListResponse,
    PublishTargetResponse,
)
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["publish-targets"])


# ─── Yardımcı ─────────────────────────────────────────────────────────────────


def _get_target_or_404(target_id: str, db: Session) -> JobPublishTarget:
    target = db.query(JobPublishTarget).filter_by(id=target_id).first()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Yayın hedefi bulunamadı: {target_id}",
        )
    return target


# ─── Endpoint'ler ──────────────────────────────────────────────────────────────


@router.get(
    "/jobs/{job_id}/publish-targets",
    response_model=PublishTargetListResponse,
    summary="Job yayın hedeflerini listele",
    description=(
        "Belirtilen job'a ait tüm platform yayın hedeflerini döndürür. "
        "Her hedef kendi girişim geçmişini (attempts) içerir."
    ),
)
def list_publish_targets(
    job_id: str,
    db: Session = Depends(get_db),
) -> PublishTargetListResponse:
    targets = (
        db.query(JobPublishTarget)
        .filter_by(job_id=job_id)
        .order_by(JobPublishTarget.created_at)
        .all()
    )
    return PublishTargetListResponse(
        job_id=job_id,
        targets=[PublishTargetResponse.model_validate(t) for t in targets],
        total=len(targets),
    )


@router.get(
    "/publish-targets/{target_id}/history",
    response_model=list[PublishAttemptResponse],
    summary="Yayın hedefi girişim geçmişi",
    description=(
        "Belirtilen yayın hedefine ait tüm girişimleri kronolojik sırayla döndürür."
    ),
)
def get_publish_history(
    target_id: str,
    db: Session = Depends(get_db),
) -> list[PublishAttemptResponse]:
    _get_target_or_404(target_id, db)

    attempts = (
        db.query(PublishAttempt)
        .filter_by(publish_target_id=target_id)
        .order_by(PublishAttempt.created_at)
        .all()
    )
    return [PublishAttemptResponse.model_validate(a) for a in attempts]


@router.post(
    "/publish-targets/{target_id}/retry",
    response_model=PublishTargetResponse,
    summary="Yayın hedefini yeniden dene",
    description=(
        "Başarısız veya bekleyen bir yayın hedefi için yeni bir girişim başlatır. "
        "force=True ise 'published' durumundaki hedef de yeniden denenir."
    ),
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_publish_target(
    target_id: str,
    request: PublishRetryRequest = PublishRetryRequest(),
    db: Session = Depends(get_db),
) -> PublishTargetResponse:
    target = _get_target_or_404(target_id, db)

    # Durum kontrolü
    if target.status == "published" and not request.force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Hedef zaten 'published' durumunda. "
                "Yeniden denemek için force=true gönderin."
            ),
        )
    if target.status == "publishing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hedef şu an yayınlanıyor. Lütfen bekleyin.",
        )

    # Video dosyasını cache'den al
    video_path = _resolve_video_path(target.job_id, db)
    if video_path is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Video dosyası bulunamadı. İş tamamlanmamış olabilir.",
        )

    # Metadata'yı job config'den oluştur
    metadata = _resolve_metadata(target.job_id, db)

    # Orchestrator ile yeniden dene (arkaplanda)
    asyncio.create_task(
        _run_retry(
            db=db,
            target=target,
            job_id=target.job_id,
            video_path=video_path,
            metadata=metadata,
        )
    )

    # Hedef durumunu hemen "pending" yaparak dön (202 Accepted)
    target.status = "pending"
    db.commit()
    db.refresh(target)

    log.info(
        "Yayın yeniden denemesi başlatıldı",
        target_id=target_id[:8],
        job_id=target.job_id[:8],
        platform=target.platform,
        force=request.force,
    )

    return PublishTargetResponse.model_validate(target)


# ─── Retry yardımcıları ───────────────────────────────────────────────────────


def _resolve_video_path(job_id: str, db: Session) -> str | None:
    """
    Job'un composition adımının çıktı dosyasını bulur.
    Önce job_steps tablosuna bakar, sonra session_dir'de tahmin eder.
    """
    from backend.models.job import Job, JobStep

    job = db.query(Job).filter_by(id=job_id).first()
    if job is None:
        return None

    # job_steps'ten composition adımının output_artifact'ını al
    comp_step = (
        db.query(JobStep)
        .filter_by(job_id=job_id, key="composition", status="completed")
        .first()
    )
    if comp_step and comp_step.output_artifact:
        p = Path(comp_step.output_artifact)
        if p.exists():
            return str(p)

    # Fallback: session_dir içinde final.mp4 ara
    if job.session_dir:
        candidates = [
            Path(job.session_dir) / "composition" / "final.mp4",
            Path(job.session_dir) / "final.mp4",
        ]
        for c in candidates:
            if c.exists():
                return str(c)

    return None


def _resolve_metadata(job_id: str, db: Session) -> dict[str, Any]:
    """
    Job'un metadata adımının çıktısını okur.
    Yoksa job title'dan minimal metadata üretir.
    """
    import json as _json

    from backend.models.job import Job, JobStep

    job = db.query(Job).filter_by(id=job_id).first()
    if job is None:
        return {}

    # metadata step output_artifact'ından oku
    meta_step = (
        db.query(JobStep)
        .filter_by(job_id=job_id, key="metadata", status="completed")
        .first()
    )
    if meta_step and meta_step.output_artifact:
        p = Path(meta_step.output_artifact)
        if p.exists():
            try:
                return _json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass

    # Fallback: job title'dan minimal metadata
    return {
        "title": job.title or "Video",
        "description": "",
        "tags": [],
        "category": "22",
    }


async def _run_retry(
    db: Session,
    target: JobPublishTarget,
    job_id: str,
    video_path: str,
    metadata: dict[str, Any],
) -> None:
    """
    Orchestrator'ı çağırarak retry girişimini yürütür.
    Hata olursa loglanır — exception raise edilmez (arka plan task).
    """
    from backend.publishing.orchestrator import PublishOrchestrator
    from backend.services.job_manager import sse_hub

    async def _progress_callback(phase: str, percent: int | None = None, **kwargs: Any) -> None:
        payload: dict[str, Any] = {
            "job_id": job_id,
            "platform": target.platform,
            "phase": phase,
            "action": "retry",
        }
        if percent is not None:
            payload["percent"] = percent
        payload.update(kwargs)
        await sse_hub.broadcast(job_id, "publish_progress", payload)

    try:
        orchestrator = PublishOrchestrator(db=db)
        await orchestrator.publish_job(
            job_id=job_id,
            target=target,
            video_path=video_path,
            metadata=metadata,
            progress_callback=_progress_callback,
        )
    except Exception as exc:
        log.error(
            "Retry girişimi başarısız",
            target_id=target.id[:8],
            job_id=job_id[:8],
            platform=target.platform,
            error=str(exc),
        )
