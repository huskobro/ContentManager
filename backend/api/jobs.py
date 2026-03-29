"""
Jobs API — Pipeline iş yönetimi endpoint'leri.

Endpoint'ler:
  POST   /api/jobs              → Yeni iş oluştur
  GET    /api/jobs              → İş listesi (sayfalanmış, filtrelenebilir)
  GET    /api/jobs/{job_id}     → Tekil iş detayı
  PATCH  /api/jobs/{job_id}     → İş durumu güncelle (iptal)
  GET    /api/jobs/{job_id}/events → SSE event stream (canlı ilerleme + log)
  GET    /api/jobs/stats        → Genel istatistikler

SSE Event Tipleri:
  job_status  → Job durumu değişti
  step_update → Pipeline adımı güncellendi
  log         → Canlı log mesajı
  heartbeat   → Bağlantı canlılık sinyali (her 15s)
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.database import get_db
from backend.models.schemas import (
    JobCreate,
    JobListResponse,
    JobResponse,
    JobStatusUpdate,
)
from backend.pipeline.runner import run_pipeline
from backend.services.job_manager import JobManager, sse_hub
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/jobs — Yeni iş oluştur
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/jobs",
    response_model=JobResponse,
    status_code=201,
    summary="Yeni pipeline işi oluştur",
    description=(
        "Belirtilen modül ve konu ile yeni bir video üretim işi başlatır. "
        "İş 'queued' durumunda oluşturulur. Pipeline Runner tarafından "
        "otomatik olarak sıraya alınır."
    ),
)
async def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    Yeni bir pipeline işi oluşturur ve pipeline'ı arka planda başlatır.

    İş oluşturulduğunda:
    - UUID4 tabanlı benzersiz kimlik atanır
    - 5 katmanlı ayar çözümlenir ve snapshot kaydedilir
    - Session dizini (sessions/{job_id}/) oluşturulur
    - Modüle göre pipeline adımları oluşturulur
    - Pipeline runner asyncio background task olarak başlatılır
    """
    manager = JobManager(db)
    job = manager.create_job(payload)

    # Pipeline'ı arka planda başlat (kendi DB session'ını kullanır)
    asyncio.create_task(
        run_pipeline(job.id),
        name=f"pipeline-{job.id[:8]}",
    )

    log.info(
        "Pipeline background task başlatıldı",
        job_id=job.id[:8],
        module_key=payload.module_key,
    )

    return JobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs — İş listesi
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/jobs",
    response_model=JobListResponse,
    summary="İş listesi (sayfalanmış)",
    description="Tüm işleri durum ve modüle göre filtreleyerek listeler.",
)
def list_jobs(
    page: int = Query(default=1, ge=1, description="Sayfa numarası"),
    page_size: int = Query(default=20, ge=1, le=100, description="Sayfa başına kayıt"),
    status: str | None = Query(default=None, description="Durum filtresi"),
    module_key: str | None = Query(default=None, description="Modül filtresi"),
    db: Session = Depends(get_db),
) -> JobListResponse:
    """
    Sayfalanmış ve filtrelenebilir iş listesi döndürür.

    Desteklenen filtreler:
    - `status`: queued, running, completed, failed, cancelled
    - `module_key`: standard_video, news_bulletin, product_review
    """
    manager = JobManager(db)
    jobs, total = manager.list_jobs(
        page=page,
        page_size=page_size,
        status=status,
        module_key=module_key,
    )

    return JobListResponse(
        items=[JobResponse.model_validate(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs/stats — İstatistikler
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/stats",
    summary="İş istatistikleri",
    description="Durum bazında iş sayılarını döndürür.",
)
def get_job_stats(
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """
    Sistem geneli iş istatistiklerini döndürür.
    Dashboard widget'ları için kullanılır.
    """
    manager = JobManager(db)
    return manager.get_stats()


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs/{job_id} — Tekil iş detayı
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}",
    response_model=JobResponse,
    summary="Tekil iş detayı",
    description="Belirtilen iş ID'siyle pipeline adımları dahil detay döndürür.",
)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    Tekil iş detayını pipeline adımları dahil döndürür.

    404 döner: İş bulunamazsa.
    """
    manager = JobManager(db)
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"İş bulunamadı: {job_id}",
        )

    return JobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /api/jobs/{job_id} — Durum güncelle (iptal)
# ─────────────────────────────────────────────────────────────────────────────

@router.patch(
    "/jobs/{job_id}",
    response_model=JobResponse,
    summary="İş durumunu güncelle",
    description=(
        "İş durumunu günceller. Şu an yalnızca 'cancelled' durumuna geçiş desteklenir. "
        "Sadece 'queued' veya 'running' durumundaki işler iptal edilebilir."
    ),
)
async def update_job_status(
    job_id: str,
    payload: JobStatusUpdate,
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    İş durumunu günceller.

    404 döner: İş bulunamazsa.
    409 döner: Geçersiz durum geçişi.
    """
    manager = JobManager(db)

    try:
        job = await manager.update_job_status(
            job_id=job_id,
            new_status=payload.status,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return JobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/jobs/{job_id} — İş sil (admin)
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin(x_admin_pin: str | None = Header(default=None)) -> str:
    """Admin PIN doğrulaması."""
    if not x_admin_pin or x_admin_pin != app_settings.admin_pin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz veya eksik admin PIN'i.",
        )
    return x_admin_pin


@router.delete(
    "/jobs/{job_id}",
    status_code=204,
    summary="İşi sil (admin)",
    description=(
        "Tamamlanan, başarısız veya iptal edilmiş bir işi kalıcı olarak siler. "
        "Aktif işler (queued/running) silinemez — önce iptal edilmelidir."
    ),
)
def delete_job(
    job_id: str,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> None:
    """
    İşi ve ilişkili step kayıtlarını siler.
    Admin PIN gereklidir.
    """
    manager = JobManager(db)

    try:
        manager.delete_job(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs/{job_id}/events — SSE Event Stream
# ─────────────────────────────────────────────────────────────────────────────

async def _sse_generator(
    job_id: str,
    db: Session,
) -> AsyncGenerator[str, None]:
    """
    Belirli bir job için SSE event stream üreteci.

    Event formatı (text/event-stream):
      event: job_status
      data: {"job_id": "abc", "status": "running", ...}

    Heartbeat: Her 15 saniyede bir bağlantı canlılık sinyali gönderir.
    Kapanış: Job terminal duruma geçtiğinde (completed/failed/cancelled)
             stream otomatik kapanır.
    """
    # Önce job'un var olup olmadığını doğrula
    manager = JobManager(db)
    job = manager.get_job(job_id)
    if not job:
        yield _format_sse("error", {"message": f"İş bulunamadı: {job_id}"})
        return

    # Mevcut durumu initial event olarak gönder
    yield _format_sse("job_status", {
        "job_id": job.id,
        "status": job.status,
        "current_step": job.current_step,
        "timestamp": job.created_at,
    })

    # Mevcut step durumlarını gönder
    for step in job.steps:
        yield _format_sse("step_update", {
            "job_id": job.id,
            "step_key": step.key,
            "status": step.status,
            "message": step.message,
            "provider": step.provider,
            "duration_ms": step.duration_ms,
            "cost_estimate_usd": step.cost_estimate_usd,
            "cached": step.cached,
            "output_artifact": step.output_artifact,
            "timestamp": step.started_at or step.completed_at,
        })

    # Eğer job zaten terminal durumdaysa stream'i kapat
    if job.status in ("completed", "failed", "cancelled"):
        yield _format_sse("complete", {
            "job_id": job.id,
            "status": job.status,
            "message": "İş zaten tamamlanmış",
        })
        return

    # Canlı event dinleme — subscriber ol
    queue = await sse_hub.subscribe(job_id)

    try:
        while True:
            try:
                # 15 saniye timeout ile event bekle (heartbeat için)
                message = await asyncio.wait_for(queue.get(), timeout=15.0)

                if message is None:
                    # Kapanış sinyali — stream biter
                    yield _format_sse("complete", {
                        "job_id": job_id,
                        "message": "Stream tamamlandı",
                    })
                    break

                event_type = message.get("event", "unknown")
                event_data = message.get("data", {})
                yield _format_sse(event_type, event_data)

            except asyncio.TimeoutError:
                # Heartbeat gönder — bağlantı canlı mı?
                yield _format_sse("heartbeat", {"status": "alive"})
    finally:
        await sse_hub.unsubscribe(job_id, queue)


def _format_sse(event_type: str, data: dict) -> str:
    """
    SSE text/event-stream formatına dönüştürür.

    Format:
      event: <type>
      data: <json>
      \\n
    """
    json_data = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"


@router.get(
    "/jobs/{job_id}/events",
    summary="SSE event stream (canlı ilerleme)",
    description=(
        "Server-Sent Events (SSE) stream'i üzerinden pipeline ilerlemesini, "
        "adım güncellemelerini ve canlı log mesajlarını iletir. "
        "Bağlantı canlılığı için her 15 saniyede heartbeat gönderilir."
    ),
    responses={
        200: {"description": "SSE event stream", "content": {"text/event-stream": {}}},
        404: {"description": "İş bulunamadı"},
    },
)
async def stream_job_events(
    job_id: str,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Belirli bir iş için SSE event stream başlatır.

    Frontend bu endpoint'e EventSource ile bağlanır:
    ```javascript
    const es = new EventSource("/api/jobs/{id}/events");
    es.addEventListener("step_update", (e) => { ... });
    es.addEventListener("log", (e) => { ... });
    ```
    """
    return StreamingResponse(
        _sse_generator(job_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Nginx proxy buffering devre dışı
        },
    )
