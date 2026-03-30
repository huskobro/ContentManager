"""
ContentManager — FastAPI uygulama giriş noktası.

Sorumluluklar:
  • FastAPI app örneği oluşturma
  • CORS middleware
  • Lifespan: uygulama açılış/kapanış olayları (DB tabloları, log)
  • API router kayıtları (/api/v1/...)
  • /health endpoint
  • Uvicorn başlatma (python -m backend.main ile doğrudan çalıştırma)
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.database import create_tables, check_db_health
from backend.utils.logger import get_logger
from backend.api import jobs as jobs_router
from backend.api import settings as settings_router

log = get_logger(__name__)


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Uygulama başlangıç ve kapanış mantığı.
    FastAPI'nin modern lifespan API'si (deprecated @on_event yerine).
    """
    # ── Başlangıç ──
    log.info(
        "ContentManager başlatılıyor",
        version=settings.app_version,
        environment=settings.environment,
        host=settings.backend_host,
        port=settings.backend_port,
    )

    # Veritabanı tablolarını oluştur (yoksa)
    create_tables()

    # Çalışma dizinlerini doğrula
    for path_attr in ("sessions_dir", "output_dir", "tmp_dir", "logs_dir"):
        directory = getattr(settings, path_attr)
        directory.mkdir(parents=True, exist_ok=True)

    # Admin panel'de ayarlanan output_dir'i yükle + interrupted jobs kurtarma
    # (İki işlemi de aynı DB session'da yap — startup time optimizasyonu)
    from pathlib import Path
    from backend.database import SessionLocal
    from backend.services.job_manager import JobManager

    with SessionLocal() as db:
        # 1. Output_dir'i yükle (admin ayarından) — DB'ye direkt sorgula
        from backend.models.settings import Setting
        import json as _json
        try:
            row = (
                db.query(Setting)
                .filter(Setting.scope == "admin", Setting.key == "output_dir")
                .first()
            )
            if row:
                saved_output_dir = _json.loads(row.value)
                settings.output_dir = Path(saved_output_dir)
                settings.output_dir.mkdir(parents=True, exist_ok=True)
                log.info(
                    "Admin panel'den output_dir yüklendi",
                    path=str(settings.output_dir),
                )
        except Exception as e:
            log.warning("output_dir yüklenirken hata (default kullanılacak)", error=str(e))

        # 2. Interrupted job'ları kurtarma (sistem yeniden başlatıldığında)
        manager = JobManager(db)
        recovered = manager.recover_interrupted_jobs()
        if recovered:
            log.warning(
                f"{len(recovered)} interrupted job kuyruğa alındı",
            )

    # 3. Job worker loop'u arka planda başlat
    # Bu döngü QUEUED işleri max_concurrent_jobs limitine göre işlemeye alır.
    # POST /api/jobs artık pipeline'ı doğrudan başlatmaz — işi QUEUED bırakır.
    from backend.services.job_manager import job_worker_loop
    worker_task = asyncio.create_task(job_worker_loop(), name="job-worker-loop")

    log.info("Başlangıç tamamlandı — API ve worker loop hazır")

    yield  # ← uygulama burada çalışır

    # ── Kapanış öncesi worker loop'u iptal et ──
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

    # ── Kapanış ──
    log.info("ContentManager kapatılıyor")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Modüler, localhost-first YouTube içerik üretim ve yönetim platformu. "
        "Standard Video, Haber Bülteni ve Ürün İnceleme modülleri desteklenir."
    ),
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)


# ─── Middleware ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# İstek süresi loglama middleware'i
@app.middleware("http")
async def _log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    # Sağlık kontrolü ve statik dosyaları gürültüden koru
    if request.url.path not in ("/health", "/favicon.ico"):
        log.info(
            f"{request.method} {request.url.path}",
            status_code=response.status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else "unknown",
        )
    return response


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    summary="Sistem sağlık kontrolü",
    tags=["system"],
    response_description="Uygulama ve veritabanı durumu",
)
def health_check() -> JSONResponse:
    """
    Servis canlılık uç noktası.

    Dönen bilgiler:
    - `status`: "ok" veya "degraded"
    - `version`: uygulama versiyonu
    - `environment`: development / production
    - `database`: WAL modu dahil DB durumu
    """
    db_status = check_db_health()
    overall = "ok" if db_status["status"] == "ok" else "degraded"

    return JSONResponse(
        status_code=200,
        content={
            "status": overall,
            "version": settings.app_version,
            "environment": settings.environment,
            "database": db_status,
        },
    )


# ─── API Router Kayıtları ─────────────────────────────────────────────────────
# Her router /api prefix'i altına mount edilir.
# Frontend proxy: /api → backend:8000/api (vite.config.ts)

app.include_router(jobs_router.router, prefix="/api", tags=["jobs"])
app.include_router(settings_router.router, prefix="/api", tags=["settings"])

# Sonraki fazlarda eklenecek router'lar:
#   app.include_router(modules.router,   prefix="/api", tags=["modules"])   # Faz 4
#   app.include_router(providers.router, prefix="/api", tags=["providers"]) # Faz 4
#   app.include_router(admin.router,     prefix="/api", tags=["admin"])     # Faz 4


# ─── Doğrudan çalıştırma ──────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=settings.backend_reload and settings.is_development,
        log_config=None,   # Uvicorn'un kendi log config'ini devre dışı bırak;
                           # bizim JSON formatter devralır (logger.py)
    )
