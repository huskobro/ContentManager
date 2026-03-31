"""
Jobs API — Pipeline iş yönetimi endpoint'leri.

Endpoint'ler:
  POST   /api/jobs              → Yeni iş oluştur (QUEUED — worker başlatır)
  GET    /api/jobs              → İş listesi (sayfalanmış, filtrelenebilir)
  GET    /api/jobs/stream       → Global SSE stream (tüm job değişiklikleri)
  GET    /api/jobs/{job_id}     → Tekil iş detayı
  PATCH  /api/jobs/{job_id}     → İş durumu güncelle (iptal)
  GET    /api/jobs/{job_id}/events → SSE event stream (canlı ilerleme + log)
  GET    /api/jobs/stats        → Genel istatistikler

SSE Event Tipleri (tekil job):
  job_status  → Job durumu değişti
  step_update → Pipeline adımı güncellendi
  log         → Canlı log mesajı
  heartbeat   → Bağlantı canlılık sinyali (her 15s)

SSE Event Tipleri (global stream - /api/jobs/stream):
  job_status  → Herhangi bir job'un durumu değişti
  step_update → Herhangi bir job'un adımı güncellendi
  heartbeat   → Bağlantı canlılık sinyali (her 20s)
"""

from __future__ import annotations

import asyncio
import json
import platform
import subprocess
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
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
from backend.services.job_manager import JobManager, sse_hub, global_sse_hub
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

    # Pipeline'ı ARTIK burada başlatmıyoruz — iş QUEUED olarak bırakılır.
    # Arka plandaki job_worker_loop (main.py lifespan'de başlatılır) işi alır
    # ve max_concurrent_jobs limitine göre pipeline'ı başlatır.

    log.info(
        "İş QUEUED olarak oluşturuldu — worker loop başlatacak",
        job_id=job.id[:8],
        module_key=payload.module_key,
    )

    # Global SSE üzerinden yeni iş bildir
    asyncio.create_task(
        global_sse_hub.publish("job_status", {
            "job_id": job.id,
            "status": "queued",
            "error_message": None,
            "timestamp": job.created_at,
        })
    )

    return JobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs/stream — Global SSE Stream (Dashboard / JobList için)
# ─────────────────────────────────────────────────────────────────────────────

async def _global_sse_generator() -> AsyncGenerator[str, None]:
    """
    Sistem geneli SSE event stream üreteci.

    Sistemdeki HERHANGİ bir job'ın durumu veya adımı değiştiğinde
    frontend'e event gönderir. Dashboard ve JobList bu endpoint'i kullanır.

    Event tipleri:
      job_status  → Herhangi bir job'un durumu değişti
      step_update → Herhangi bir job'un pipeline adımı güncellendi
      heartbeat   → Her 20 saniyede bir bağlantı canlılık sinyali

    Polling kullanmaz — tamamen push-based, gerçek zamanlı.
    """
    queue = await global_sse_hub.subscribe()

    try:
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=20.0)

                if message is None:
                    # Kapanış sinyali
                    break

                event_type = message.get("event", "unknown")
                event_data = message.get("data", {})
                yield _format_sse(event_type, event_data)

            except asyncio.TimeoutError:
                # Heartbeat — bağlantı canlı mı?
                yield _format_sse("heartbeat", {"status": "alive"})

    finally:
        await global_sse_hub.unsubscribe(queue)


@router.get(
    "/jobs/stream",
    summary="Global SSE stream (tüm job değişiklikleri)",
    description=(
        "Sistemdeki herhangi bir job'ın durumu veya pipeline adımı değiştiğinde "
        "gerçek zamanlı event gönderir. Dashboard ve JobList bu endpoint'e abone olur. "
        "Polling yoktur — tamamen push-based SSE."
    ),
    responses={
        200: {"description": "Global SSE event stream", "content": {"text/event-stream": {}}},
    },
)
async def stream_global_events() -> StreamingResponse:
    """
    Global job değişiklik stream'i.

    Frontend bu endpoint'e EventSource ile bağlanır:
    ```javascript
    const es = new EventSource("/api/jobs/stream");
    es.addEventListener("job_status", (e) => { ... });
    es.addEventListener("step_update", (e) => { ... });
    ```
    """
    return StreamingResponse(
        _global_sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
# POST /api/jobs/{job_id}/retry — Başarısız işi yeniden dene
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/jobs/{job_id}/retry",
    response_model=JobResponse,
    summary="Başarısız işi yeniden dene",
    description=(
        "Başarısız (failed) veya iptal edilmiş (cancelled) bir işi kaldığı yerden devam ettirir. "
        "Tamamlanan adımlar atlanır, başarısız adımdan itibaren pipeline yeniden başlatılır."
    ),
)
async def retry_job(
    job_id: str,
    db: Session = Depends(get_db),
) -> JobResponse:
    """
    Başarısız işi yeniden başlatır.

    Sadece 'failed' veya 'cancelled' durumundaki işler retry edilebilir.
    Tamamlanan adımlar korunur (cache kullanılır).
    """
    manager = JobManager(db)
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"İş bulunamadı: {job_id}")

    if job.status not in ("failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Yalnızca 'failed' veya 'cancelled' işler retry edilebilir. Mevcut durum: {job.status}",
        )

    # Başarısız adımları ve sonraki adımları sıfırla
    from backend.models.job import JobStep
    steps = db.query(JobStep).filter(
        JobStep.job_id == job_id,
        JobStep.status.in_(["failed", "pending"]),
    ).all()
    for step in steps:
        step.status = "pending"
        step.message = None
        step.started_at = None
        step.completed_at = None
        step.duration_ms = None

    job.status = "queued"
    job.error_message = None
    db.commit()
    db.refresh(job)

    # Pipeline başlatmayı worker loop'a bırak — iş QUEUED olarak kuyruğa alındı.
    # worker loop 2 saniye içinde alıp başlatacak.

    # Global SSE üzerinden retry bildir
    asyncio.create_task(
        global_sse_hub.publish("job_status", {
            "job_id": job.id,
            "status": "queued",
            "error_message": None,
            "timestamp": job.created_at,
        })
    )

    log.info("Job retry kuyruğa alındı — worker loop başlatacak", job_id=job_id[:8])
    return JobResponse.model_validate(job)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/jobs/{job_id}/output — Final video dosyasını indir
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/jobs/{job_id}/output",
    summary="Video çıktısını indir",
    description=(
        "Tamamlanan işin final video dosyasını (final.mp4) indirir. "
        "İş 'completed' durumunda olmalı ve output_path geçerli olmalıdır."
    ),
)
def download_job_output(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Tamamlanan işin final video dosyasını indirir.

    404 döner: İş bulunamazsa veya output dosyası bulunamazsa.
    409 döner: İş tamamlanmamışsa.
    """
    manager = JobManager(db)
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"İş bulunamadı: {job_id}")

    if job.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"İş tamamlanmamış. Mevcut durum: {job.status}",
        )

    if not job.output_path:
        raise HTTPException(
            status_code=404,
            detail="Çıktı dosyası bulunamadı. output_path boş.",
        )

    output_file = Path(job.output_path)
    if not output_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Dosya disk üzerinde bulunamadı: {job.output_path}",
        )

    log.info("Video indiriliyor", job_id=job_id[:8], file_size=output_file.stat().st_size)

    return FileResponse(
        path=output_file,
        filename=f"video_{job_id[:8]}.mp4",
        media_type="video/mp4",
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/jobs/{job_id}/open-output — Çıktı klasörünü Finder/Explorer'da aç
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/jobs/{job_id}/open-output",
    summary="Çıktı klasörünü dosya gezgininde aç",
    description=(
        "İşin çıktı dosyasını veya bulunduğu klasörü işletim sisteminin "
        "dosya gezgininde açar. macOS: open -R (dosyayı seçer), "
        "Windows: explorer /select, Linux: xdg-open (klasör). "
        "İş tamamlanmış ve output_path mevcut olmalıdır."
    ),
)
def open_job_output_folder(
    job_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """
    Çıktı klasörünü dosya gezgininde açar.
    output_path varsa dosyayı seçer (macOS/Windows), yoksa klasörü açar.
    """
    manager = JobManager(db)
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"İş bulunamadı: {job_id}")

    if not job.output_path:
        raise HTTPException(status_code=404, detail="Bu iş için çıktı dosyası yok.")

    output_file = Path(job.output_path)
    if not output_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Çıktı dosyası disk üzerinde bulunamadı: {job.output_path}",
        )

    sys_name = platform.system()
    try:
        if sys_name == "Darwin":
            # -R: Finder'da dosyayı vurgular (reveal)
            subprocess.Popen(["open", "-R", str(output_file)])
        elif sys_name == "Windows":
            # /select: Explorer'da dosyayı seçer
            subprocess.Popen(["explorer", "/select,", str(output_file)])
        else:
            # Linux: klasörü aç
            subprocess.Popen(["xdg-open", str(output_file.parent)])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Dosya gezgini açılamadı: {exc}")

    log.info("Çıktı klasörü açıldı", job_id=job_id[:8], path=str(output_file))

    return {"opened": True, "path": str(output_file)}


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
