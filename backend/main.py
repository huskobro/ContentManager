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
from backend.api import admin as admin_router

log = get_logger(__name__)


# ─── Legacy Settings Migration ───────────────────────────────────────────────

#: Eski admin anahtar adı → yeni anahtar adı.
#: Bu eşleştirme, frontend schema yeniden adlandırmasıyla (2026-03-31) oluştu.
_LEGACY_KEY_RENAMES: dict[str, str] = {
    "default_language": "language",
    "default_tts_provider": "tts_provider",
    "default_llm_provider": "llm_provider",
    "default_visuals_provider": "visuals_provider",
    "default_subtitle_style": "subtitle_style",
}


def _migrate_legacy_setting_keys(db) -> None:
    """
    Eski "default_*" anahtar adlarını yeni adlara idempotent olarak taşır.

    Kural:
    - Eski key varsa ve yeni key YOKSA: eski kaydı yeni key adıyla güncelle.
    - Eski key varsa ve yeni key DE VARSA: eski kaydı sil (yeni kazanır).
    - Yeni key zaten varsa ve eski yoksa: işlem yok.

    Tüm işlemler tek commit'te, scope="admin", scope_id="" üzerinde yapılır.
    """
    from backend.models.settings import Setting

    changed = False
    for old_key, new_key in _LEGACY_KEY_RENAMES.items():
        old_row = (
            db.query(Setting)
            .filter(Setting.scope == "admin", Setting.scope_id == "", Setting.key == old_key)
            .first()
        )
        if not old_row:
            continue  # Eski kayıt yok — bir şey yapma

        new_row = (
            db.query(Setting)
            .filter(Setting.scope == "admin", Setting.scope_id == "", Setting.key == new_key)
            .first()
        )

        if new_row is None:
            # Yeni kayıt yok — eski kaydın key'ini güncelle (değeri koru)
            old_row.key = new_key
            log.info(
                "Eski ayar anahtarı yeni adına taşındı",
                old_key=old_key,
                new_key=new_key,
                value=old_row.value[:60],
            )
        else:
            # Yeni kayıt zaten var — eski kaydı sil (kullanıcının yeni kaydı öncelikli)
            db.delete(old_row)
            log.info(
                "Eski ayar anahtarı silindi (yeni anahtar zaten var)",
                old_key=old_key,
                new_key=new_key,
            )
        changed = True

    if changed:
        db.commit()
        log.info("Legacy ayar anahtarı migrasyonu tamamlandı")


def _repair_list_elements(items: list) -> list:
    """
    Bozuk serileştirilmiş list elemanlarını onarır.

    Bilinen bozulma kalıbı:
      Orijinal: ["edge_tts", "openai_tts"]
      Bozuk: ['["edge_tts"', '"openai_tts"]', 'edge_tts']
      (JSON array brackets elemanlar arasında parçalanmış + ekstra eleman)

    Strateji:
      1. Tüm elemanlar string ise, '[' ile başlayan ve ']' ile biten
         ardışık fragment'ları birleştirip JSON array olarak parse et.
      2. Kalan (fragment olmayan) elemanları olduğu gibi ekle.
      3. Her elemanı iteratif json.loads ile decode et.
      4. Sonucu deduplicate et (sıra korunarak).
    """
    import json as _json

    if not all(isinstance(x, str) for x in items):
        return items

    # Fragment tespiti: '[' ile başlayan ama kendi başına parse edilemeyen
    # elemanlar bir array'in parçasıdır.
    reconstructed: list = []
    fragment_buf: list[str] = []
    in_fragment = False

    for elem in items:
        stripped = elem.strip()
        is_fragment_start = stripped.startswith("[") and not stripped.endswith("]")
        is_fragment_end = not stripped.startswith("[") and stripped.endswith("]")

        # Fragment'ın tam bir JSON array olup olmadığını kontrol et
        if not in_fragment:
            try:
                _json.loads(stripped)
                # Geçerli JSON — fragment değil
                reconstructed.append(elem)
                continue
            except (_json.JSONDecodeError, TypeError):
                pass

        if is_fragment_start and not in_fragment:
            in_fragment = True
            fragment_buf = [stripped]
        elif in_fragment:
            fragment_buf.append(stripped)
            if is_fragment_end:
                # Fragment tamamlandı — birleştirip parse et
                joined = ",".join(fragment_buf)
                try:
                    parsed = _json.loads(joined)
                    if isinstance(parsed, list):
                        reconstructed.extend(parsed)
                    else:
                        reconstructed.append(parsed)
                except (_json.JSONDecodeError, TypeError):
                    # Parse edilemezse olduğu gibi ekle
                    reconstructed.extend(fragment_buf)
                in_fragment = False
                fragment_buf = []
        else:
            reconstructed.append(elem)

    # Fragment buffer kaldıysa (] olmadan bitmişse) olduğu gibi ekle
    if fragment_buf:
        reconstructed.extend(fragment_buf)

    # Her elemanı iteratif decode et
    cleaned = []
    for item in reconstructed:
        decoded = item
        for _ in range(5):
            if not isinstance(decoded, str):
                break
            try:
                decoded = _json.loads(decoded)
            except (_json.JSONDecodeError, TypeError):
                break
        cleaned.append(decoded)

    # Deduplicate (sıra koruyarak)
    seen: set = set()
    deduped: list = []
    for item in cleaned:
        key = str(item)
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    return deduped


def _repair_multi_encoded_values(db) -> None:
    """
    Çoklu JSON encode olmuş ayar değerlerini onarır (idempotent).

    Geçmiş buglar nedeniyle bazı değerler birden fazla kez json.dumps ile
    encode edilmiş olabilir. Bu fonksiyon her kaydın value sütununu iteratif
    json.loads ile çözüp, stabil haline yeniden encode eder.

    Örnek bozulma kalıpları:
      - '["[\\"edge_tts\\"", "\\"openai_tts\\"]"]'  (array elemanları string)
      - '"[\\"a\\",\\"b\\"]"'  (array string içinde)
      - 'bc633fe...' (bare string, JSON encode edilmemiş)

    Ayrıca array türü ayarlarda (fallback_order) elemanları da kontrol eder —
    her eleman hâlâ JSON-encoded string ise onu da çözer.
    """
    import json as _json
    from backend.models.settings import Setting

    rows = db.query(Setting).all()
    repaired = 0

    for row in rows:
        original_raw = row.value

        # 1. Iteratif decode: string olduğu sürece json.loads tekrarla
        result = original_raw
        for _ in range(5):
            if not isinstance(result, str):
                break
            try:
                result = _json.loads(result)
            except (_json.JSONDecodeError, TypeError):
                break

        # 2. Array/list elemanlarında kalan encode'ları temizle
        if isinstance(result, list):
            result = _repair_list_elements(result)

        # 3. Canonical JSON encode (tek katman)
        canonical = _json.dumps(result, ensure_ascii=False)

        # 4. Bare string'leri de düzelt (JSON encode edilmemiş ham değerler)
        # Eğer original_raw bir string ise ve json.loads başarısız oluyorsa,
        # result == original_raw olur; canonical = json.dumps(string) olur
        # (ör. "bc633fe..." → '"bc633fe..."'). Bu doğru davranış.

        if canonical != original_raw:
            row.value = canonical
            repaired += 1
            log.info(
                "Çoklu encode onarıldı",
                key=row.key,
                scope=row.scope,
                before=original_raw[:80],
                after=canonical[:80],
            )

    if repaired:
        db.commit()
        log.info(
            "Çoklu encode onarımı tamamlandı",
            repaired_count=repaired,
        )


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

    # output_dir ayarını DB'den yükle (SettingsResolver üzerinden) + interrupted jobs kurtarma
    from pathlib import Path
    from backend.database import SessionLocal
    from backend.services.job_manager import JobManager
    from backend.services.settings_resolver import SettingsResolver

    with SessionLocal() as db:
        # 0a. Eski "default_*" anahtar adlarını yeni adlara migrate et (idempotent)
        _migrate_legacy_setting_keys(db)

        # 0b. Çoklu encode olmuş ayar değerlerini onar (idempotent)
        _repair_multi_encoded_values(db)

        # 1. Output_dir'i SettingsResolver üzerinden yükle
        try:
            resolver = SettingsResolver(db)
            saved_output_dir = resolver.get(key="output_dir")
            if saved_output_dir and str(saved_output_dir).strip():
                # Olası kalıntı tırnak karakterlerini temizle (eski çift-kodlama artefaktı)
                clean_path_str = str(saved_output_dir).strip().strip('"').strip("'")
                resolved_path = Path(clean_path_str)
                # Absolute değilse (ör. göreceli path gelirse) güvenli değil — skip
                if resolved_path.is_absolute():
                    resolved_path.mkdir(parents=True, exist_ok=True)
                    settings.output_dir = resolved_path
                    log.info(
                        "SettingsResolver'dan output_dir yüklendi",
                        path=str(settings.output_dir),
                    )
                else:
                    log.warning(
                        "output_dir göreceli path, varsayılan kullanılacak",
                        raw_value=clean_path_str,
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
app.include_router(admin_router.router, prefix="/api", tags=["admin"])


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
