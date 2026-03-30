"""
Pipeline Runner — Asenkron iş yürütme motoru.

Sorumluluklar:
    • QUEUED durumdaki bir job'u alır, RUNNING'e geçirir
    • Modüle göre pipeline adımlarını sırasıyla çalıştırır
    • Her adım öncesinde cache kontrolü yapar (idempotent)
    • Her adım sonrasında job_steps tablosunu günceller
    • SSE üzerinden canlı ilerleme ve log mesajları yayınlar
    • Hata durumunda fatal/non-fatal ayrımı yapar
    • Tamamlandığında job'u COMPLETED'a geçirir

Tasarım kararları:
    • Background task olarak çalışır (asyncio.create_task)
    • Kendi SessionLocal() instance'ını kullanır (FastAPI request session'ından bağımsız)
    • Her adım bağımsız try/catch — non-fatal adım başarısız olursa atlanır
    • Fatal adım başarısız olursa tüm job FAILED olur
    • Cache'li adımlar atlanır (duration_ms=0, cached=True)

Kullanım:
    from backend.pipeline.runner import run_pipeline
    import asyncio

    # Job oluşturulduktan sonra:
    asyncio.create_task(run_pipeline(job_id))
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from backend.config import settings as app_settings
from backend.database import SessionLocal
from backend.models.job import Job, JobStep
from backend.modules.base import PipelineStepDef
from backend.modules.registry import get_module
from backend.pipeline.cache import CacheManager
from backend.services.job_manager import JobManager
from backend.utils.logger import get_logger

log = get_logger(__name__)


async def run_pipeline(job_id: str) -> None:
    """
    Belirtilen job'un pipeline'ını baştan sona çalıştırır.

    Bu fonksiyon asyncio.create_task() ile background'da çalıştırılır.
    Kendi veritabanı session'ını oluşturur ve yönetir.

    Args:
        job_id: Çalıştırılacak job'un benzersiz kimliği.
    """
    db = SessionLocal()

    try:
        manager = JobManager(db)
        job = manager.get_job(job_id)

        if not job:
            log.error("Pipeline başlatılamadı: Job bulunamadı", job_id=job_id[:8])
            return

        # Worker loop job'u "queued"dan "running"a çekip sonra run_pipeline'ı
        # başlatır — bu yüzden "running" da geçerli başlangıç durumudur.
        if job.status not in ("queued", "running"):
            log.warning(
                "Pipeline atlandı: Job başlatılabilir durumda değil",
                job_id=job_id[:8],
                current_status=job.status,
            )
            return

        # ── Modülü al ──────────────────────────────────────────────────────
        module = get_module(job.module_key)
        if not module:
            log.error(
                "Pipeline başlatılamadı: Modül bulunamadı",
                job_id=job_id[:8],
                module_key=job.module_key,
            )
            await manager.update_job_status(
                job_id, "failed",
                error_message=f"Modül bulunamadı: {job.module_key}",
            )
            return

        # ── Job'u RUNNING'e geçir ──────────────────────────────────────────
        # Worker loop zaten "running" set etmiş olabilir — sadece "queued"
        # durumundaysa geçiş yap, zaten "running"sa doğrudan devam et.
        if job.status == "queued":
            await manager.update_job_status(job_id, "running")
        await manager.emit_log(
            job_id, "INFO",
            f"Pipeline başlatıldı: {module.display_name}",
        )

        # ── Resolved settings'i oku ────────────────────────────────────────
        config = _load_resolved_settings(job)

        # ── Modül aktiflik kontrolü ────────────────────────────────────────
        if config.get("enabled") is False:
            await manager.update_job_status(
                job_id, "failed",
                error_message="Bu modül sistem yöneticisi tarafından devre dışı bırakılmıştır.",
            )
            await manager.emit_log(
                job_id, "ERROR",
                f"Pipeline durduruldu: '{module.display_name}' modülü devre dışı.",
            )
            log.warning(
                "Devre dışı modül için pipeline reddedildi",
                job_id=job_id[:8],
                module_key=job.module_key,
            )
            return

        # Job title'ı config'e ekle (step fonksiyonlarının erişebilmesi için)
        config["_job_title"] = job.title
        config["_job_id"] = job_id
        config["_language"] = job.language

        # ── CacheManager oluştur ───────────────────────────────────────────
        from pathlib import Path
        session_dir = Path(job.session_dir) if job.session_dir else None
        cache = CacheManager(job_id, session_dir)

        # ── Pipeline adımlarını al ─────────────────────────────────────────
        pipeline_steps = module.get_pipeline_steps()

        log.info(
            "Pipeline çalıştırılıyor",
            job_id=job_id[:8],
            module_name=module.name,
            step_count=len(pipeline_steps),
        )

        # ── Adımları sırasıyla çalıştır ────────────────────────────────────
        all_successful = True

        for step_def in pipeline_steps:
            success = await _execute_step(
                manager=manager,
                job_id=job_id,
                step_def=step_def,
                config=config,
                cache=cache,
            )

            if not success and step_def.is_fatal:
                # Fatal adım başarısız — job'u FAILED yap
                all_successful = False
                await manager.update_job_status(
                    job_id, "failed",
                    error_message=f"Fatal adım başarısız: {step_def.key} ({step_def.label})",
                )
                await manager.emit_log(
                    job_id, "ERROR",
                    f"Pipeline durdu: Fatal adım '{step_def.label}' başarısız oldu.",
                    step=step_def.key,
                )
                break

            if not success and not step_def.is_fatal:
                # Non-fatal — atla, devam et
                await manager.emit_log(
                    job_id, "WARN",
                    f"Opsiyonel adım '{step_def.label}' atlandı.",
                    step=step_def.key,
                )

        # ── Pipeline tamamlandı ────────────────────────────────────────────
        if all_successful:
            # Output path'i güncelle
            # Önce output/ klasöründeki kopyalanmış dosyaya bak (tercih edilen)
            # Yoksa session dizinindeki render çıktısına düş
            output_dir_file = app_settings.output_dir / f"{job_id[:8]}.mp4"
            composition_session = cache.get_output_path("composition", "final.mp4")

            job = manager.get_job(job_id)
            if job:
                if output_dir_file.exists():
                    job.output_path = str(output_dir_file)
                elif composition_session.exists():
                    job.output_path = str(composition_session)
                db.commit()

            await manager.update_job_status(job_id, "completed")
            await manager.emit_log(
                job_id, "INFO",
                "Pipeline başarıyla tamamlandı!",
            )

            log.info(
                "Pipeline tamamlandı",
                job_id=job_id[:8],
                module_name=module.name,
            )

    except asyncio.CancelledError:
        log.warning("Pipeline iptal edildi", job_id=job_id[:8])
        try:
            manager = JobManager(db)
            await manager.update_job_status(job_id, "cancelled")
        except Exception:
            pass
        raise

    except Exception as exc:
        log.error(
            "Pipeline beklenmeyen hata",
            job_id=job_id[:8],
            error=str(exc),
            exc_info=True,
        )
        try:
            manager = JobManager(db)
            await manager.update_job_status(
                job_id, "failed",
                error_message=f"Beklenmeyen hata: {str(exc)[:500]}",
            )
        except Exception:
            pass

    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Tek adım çalıştırma
# ─────────────────────────────────────────────────────────────────────────────


async def _execute_step(
    manager: JobManager,
    job_id: str,
    step_def: PipelineStepDef,
    config: dict[str, Any],
    cache: CacheManager,
) -> bool:
    """
    Tek bir pipeline adımını çalıştırır.

    Çalıştırmadan önce:
      1. Cache kontrolü — çıktı varsa adım atlanır
      2. DB'de step durumunu "running" yapar
      3. Execute fonksiyonunu çağırır
      4. Başarıda "completed", hatada "failed" veya "skipped" yapar

    Args:
        manager: JobManager instance (SSE + DB işlemleri).
        job_id: İlgili job kimliği.
        step_def: Adım tanımı (PipelineStepDef).
        config: Çözümlenmiş ayarlar.
        cache: CacheManager instance.

    Returns:
        True ise adım başarılı (veya cache'den atlandı), False ise başarısız.
    """
    step_key = step_def.key

    # ── Cache kontrolü ──────────────────────────────────────────────────────
    # DB'deki step durumuna bak — daha önce completed ise ve cache varsa atla
    db = manager._db
    db_step = (
        db.query(JobStep)
        .filter(JobStep.job_id == job_id, JobStep.key == step_key)
        .first()
    )

    if db_step and db_step.status == "completed" and cache.has_output(step_key):
        log.info(
            "Adım cache'den atlanıyor",
            job_id=job_id[:8],
            step=step_key,
        )
        await manager.update_step(
            job_id=job_id,
            step_key=step_key,
            status="completed",
            message="Cache'den yüklendi (idempotent)",
            cached=True,
            duration_ms=0,
            output_artifact=cache.get_relative_path(step_key),
        )
        await manager.emit_log(
            job_id, "INFO",
            f"✓ {step_def.label} — cache'den yüklendi",
            step=step_key,
        )
        return True

    # ── Adımı RUNNING yap ──────────────────────────────────────────────────
    await manager.update_step(
        job_id=job_id,
        step_key=step_key,
        status="running",
        message=f"{step_def.label} çalıştırılıyor...",
        provider=step_def.default_provider,
    )
    await manager.emit_log(
        job_id, "INFO",
        f"▶ {step_def.label} başlıyor (provider: {step_def.default_provider or 'N/A'})",
        step=step_key,
    )

    start_time = time.monotonic()

    try:
        # ── Execute ────────────────────────────────────────────────────────
        result = await step_def.execute(
            job_id=job_id,
            step_key=step_key,
            config=config,
            cache=cache,
        )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # ── Başarılı — COMPLETED ───────────────────────────────────────────
        provider_used = result.get("provider", step_def.default_provider)
        cost = result.get("cost_estimate_usd", 0.0)
        output_artifact = cache.get_relative_path(step_key)

        await manager.update_step(
            job_id=job_id,
            step_key=step_key,
            status="completed",
            message=f"{step_def.label} tamamlandı",
            provider=provider_used,
            duration_ms=elapsed_ms,
            cost_estimate_usd=cost,
            cached=False,
            output_artifact=output_artifact,
        )
        await manager.emit_log(
            job_id, "INFO",
            f"✓ {step_def.label} tamamlandı ({elapsed_ms}ms, ${cost:.4f})",
            step=step_key,
            extra={"duration_ms": elapsed_ms, "cost_usd": cost},
        )

        log.info(
            "Step tamamlandı",
            job_id=job_id[:8],
            step=step_key,
            duration_ms=elapsed_ms,
            provider=provider_used,
        )

        return True

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        error_msg = f"{step_def.label} hatası: {str(exc)[:300]}"

        log.error(
            "Step başarısız",
            job_id=job_id[:8],
            step=step_key,
            error=str(exc),
            duration_ms=elapsed_ms,
            is_fatal=step_def.is_fatal,
        )

        if step_def.is_fatal:
            # Fatal — FAILED
            await manager.update_step(
                job_id=job_id,
                step_key=step_key,
                status="failed",
                message=error_msg,
                duration_ms=elapsed_ms,
            )
            await manager.emit_log(
                job_id, "ERROR",
                f"✗ {error_msg}",
                step=step_key,
            )
            return False
        else:
            # Non-fatal — SKIPPED
            await manager.update_step(
                job_id=job_id,
                step_key=step_key,
                status="skipped",
                message=f"Atlandı: {str(exc)[:200]}",
                duration_ms=elapsed_ms,
            )
            await manager.emit_log(
                job_id, "WARN",
                f"⚠ {step_def.label} atlandı: {str(exc)[:200]}",
                step=step_key,
            )
            return True  # Non-fatal, pipeline devam eder


# ─────────────────────────────────────────────────────────────────────────────
# Yardımcı fonksiyonlar
# ─────────────────────────────────────────────────────────────────────────────


def _load_resolved_settings(job: Job) -> dict[str, Any]:
    """
    Job oluşturulurken kaydedilen resolved settings snapshot'ını okur.

    Returns:
        Çözümlenmiş ayarlar sözlüğü, veya boş dict (parse edilemezse).
    """
    if not job.resolved_settings_json:
        log.warning(
            "Job'da resolved_settings_json bulunamadı, boş config kullanılıyor",
            job_id=job.id[:8],
        )
        return {}

    try:
        return json.loads(job.resolved_settings_json)
    except (json.JSONDecodeError, TypeError) as exc:
        log.error(
            "resolved_settings_json parse hatası",
            job_id=job.id[:8],
            error=str(exc),
        )
        return {}
