"""
[DEPRECATED — Faz 11.2C]

step_youtube_upload, Faz 11.2C itibarıyla standart pipeline'dan KALDIRILMIŞTIR.
Ana yayın adımı artık `step_publish` (Publishing Hub) kullanmaktadır.

Bu dosya aşağıdaki nedenlerle korunmaktadır:
  1. Mevcut test coverage (19 test) — regresyon izleme
  2. Eski job kayıtlarında job_steps tablosunda "youtube_upload" key'i bulunabilir
  3. Gerekirse harici araçlarla/manuel çağrı için

pipeline.py'ye BAĞLANMAZ. Herhangi bir pipeline bu adımı çalıştırmaz.

Faz 11.3 veya sonrasında tüm testler publish step testleriyle kapsandığında
bu dosya tamamen kaldırılabilir.

──────────────────────────────────────────────────────────────────────────────
Original docstring (historical reference):

YouTube Upload Pipeline Adımı — Faz 11.2

Composition sonrası çalışır (order=6, is_fatal=False).
Artık order=6 slot'unu step_publish kullanmaktadır.

SSE event tipi: "upload_progress"
Payload: {"phase": str, "percent": int | None, "video_id": str | None, ...}
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.pipeline.cache import CacheManager
from backend.services.job_manager import sse_hub, global_sse_hub
from backend.utils.logger import get_logger
from backend.services.youtube_upload_service import (
    YtUploadError,
    YT_NO_DEFAULT_CHANNEL,
    YT_FILE_NOT_FOUND,
    YT_DUPLICATE_UPLOAD_BLOCKED,
    normalize_metadata,
    validate_privacy,
    refresh_channel_token,
    upload_video_async,
)

log = get_logger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _emit_upload_progress(
    job_id: str,
    phase: str,
    percent: int | None = None,
    video_id: str | None = None,
    error_code: str | None = None,
) -> None:
    """Hem job-specific hem global SSE hub'a upload_progress eventi yayınlar."""
    data: dict[str, Any] = {
        "job_id": job_id,
        "phase": phase,
        "timestamp": _utcnow(),
    }
    if percent is not None:
        data["percent"] = percent
    if video_id is not None:
        data["video_id"] = video_id
    if error_code is not None:
        data["error_code"] = error_code

    await sse_hub.publish(job_id, "upload_progress", data)
    await global_sse_hub.publish("upload_progress", data)


async def step_youtube_upload(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    YouTube upload pipeline adımı.

    Args:
        job_id: Çalışan job'un kimliği.
        step_key: Adım anahtarı ("youtube_upload").
        config: Çözümlenmiş ayarlar (resolved_settings_json + runtime).
        cache: CacheManager instance.

    Returns:
        dict — step sonuç verisi (provider, video_id, cost_estimate_usd, vb.)

    Raises:
        YtUploadError: Upload başarısız olduğunda (is_fatal=False → runner SKIPPED yapar).
        Exception: Beklenmeyen hatalar.
    """
    # ── DEPRECATED WARNING ────────────────────────────────────────────────────
    # Faz 11.2C itibarıyla bu adım pipeline'a bağlı değildir.
    # Herhangi bir normal pipeline çalışması bu fonksiyonu çağırmamalıdır.
    # Bu uyarı görünüyorsa bir hata var demektir — loglayıp devam et.
    log.warning(
        "[DEPRECATED] step_youtube_upload çağrıldı. "
        "Bu adım Faz 11.2C'de pipeline'dan kaldırılmıştır. "
        "Ana yayın: step_publish (Publishing Hub). "
        "Bu çağrı yok sayılıyor.",
        job_id=job_id[:8],
    )
    return {
        "provider": "youtube_api",
        "skipped": True,
        "reason": "deprecated_step_removed_in_11_2C",
        "cost_estimate_usd": 0.0,
    }

    # ── Aşağıdaki kod artık çalışmaz — historical reference için korunur ──────

    db = config.get("_db")
    job_title = config.get("_job_title", "Video")

    # ── 1. publish_to_youtube opt-in kontrolü ─────────────────────────────────
    publish = config.get("publish_to_youtube")
    # Settings resolver JSON decode'dan bool veya string gelebilir
    if isinstance(publish, str):
        publish = publish.lower() in ("true", "1", "yes")
    if not publish:
        log.info(
            "YouTube upload atlandı: publish_to_youtube=false",
            job_id=job_id[:8],
        )
        return {
            "provider": "youtube_api",
            "skipped": True,
            "reason": "publish_to_youtube devre dışı",
            "cost_estimate_usd": 0.0,
        }

    # ── 2. Duplicate upload guard ─────────────────────────────────────────────
    if db:
        from backend.models.job import Job as _Job
        job_row = db.query(_Job).filter_by(id=job_id).first()
        if job_row and job_row.youtube_video_id:
            log.warning(
                "Duplicate upload engellendi — video zaten yüklenmiş",
                job_id=job_id[:8],
                existing_video_id=job_row.youtube_video_id,
            )
            await _emit_upload_progress(
                job_id, "skipped",
                error_code=YT_DUPLICATE_UPLOAD_BLOCKED,
            )
            raise YtUploadError(
                YT_DUPLICATE_UPLOAD_BLOCKED,
                f"Video zaten yüklenmiş: {job_row.youtube_video_id}",
            )

    # ── 2b. Publishing Hub çift yükleme koruması ──────────────────────────────
    # step_publish (order=7) zaten yüklediyse bu adım (order=6) atlanır.
    # JobPublishTarget.status == "published" → çift yükleme olmaz.
    if db:
        try:
            from backend.models.publish_target import JobPublishTarget as _JPT
            published_target = (
                db.query(_JPT)
                .filter_by(job_id=job_id, platform="youtube", status="published")
                .first()
            )
            if published_target:
                log.info(
                    "YouTube upload atlandı — Publishing Hub zaten yükledi",
                    job_id=job_id[:8],
                    external_id=published_target.external_object_id,
                )
                return {
                    "provider": "youtube_api",
                    "skipped": True,
                    "reason": "already_published_via_hub",
                    "video_id": published_target.external_object_id,
                    "video_url": published_target.external_url,
                    "cost_estimate_usd": 0.0,
                }
        except Exception:
            # Publishing Hub tabloları henüz mevcut değilse sessizce devam et
            pass

    # ── 3. Video dosya yolunu çöz ─────────────────────────────────────────────
    await _emit_upload_progress(job_id, "preparing_upload")

    video_path: Path | None = None

    # 3a. job.output_path'i dene
    if db:
        from backend.models.job import Job as _Job
        job_row = db.query(_Job).filter_by(id=job_id).first()
        if job_row and job_row.output_path:
            candidate = Path(job_row.output_path)
            if candidate.exists() and candidate.stat().st_size > 0:
                video_path = candidate

    # 3b. Cache fallback: sessions/{job_id}/step_composition/final.mp4
    if video_path is None:
        cache_path = cache.get_output_path("composition", "final.mp4")
        if cache_path.exists() and cache_path.stat().st_size > 0:
            video_path = cache_path

    if video_path is None:
        await _emit_upload_progress(job_id, "failed", error_code=YT_FILE_NOT_FOUND)
        raise YtUploadError(
            YT_FILE_NOT_FOUND,
            "Video dosyası bulunamadı. Composition adımı başarıyla tamamlanmış olmalı.",
        )

    # ── 4. Metadata yükle + normalize ─────────────────────────────────────────
    raw_metadata = cache.load_json("metadata") or {}
    metadata = normalize_metadata(raw_metadata, job_title=job_title)

    log.info(
        "Upload metadata hazırlandı",
        job_id=job_id[:8],
        title=metadata["title"][:60],
        tag_count=len(metadata["tags"]),
        category_id=metadata["category_id"],
    )

    # ── 5. Varsayılan aktif kanal bul ─────────────────────────────────────────
    if not db:
        raise YtUploadError(
            YT_NO_DEFAULT_CHANNEL,
            "DB session config'de yok — kanal sorgulanamıyor.",
        )

    from backend.models.youtube_channel import YouTubeChannel
    channel = (
        db.query(YouTubeChannel)
        .filter(YouTubeChannel.is_active == True, YouTubeChannel.is_default == True)  # noqa: E712
        .first()
    )
    if not channel:
        await _emit_upload_progress(job_id, "failed", error_code=YT_NO_DEFAULT_CHANNEL)
        _update_job_youtube_fields(
            db, job_id,
            upload_status="skipped",
            error_code=YT_NO_DEFAULT_CHANNEL,
        )
        raise YtUploadError(
            YT_NO_DEFAULT_CHANNEL,
            "Aktif & varsayılan YouTube kanalı bulunamadı. "
            "Admin panelinden kanal bağlayın ve varsayılan olarak ayarlayın.",
        )

    # ── 6. Token refresh ─────────────────────────────────────────────────────
    await _emit_upload_progress(job_id, "refreshing_token")
    refresh_channel_token(channel, db)  # YtUploadError(YT_TOKEN_REFRESH_FAILED) fırlatabilir

    # ── 7. Privacy ayarı ─────────────────────────────────────────────────────
    privacy = validate_privacy(config.get("youtube_privacy", "private"))

    log.info(
        "YouTube upload başlıyor",
        job_id=job_id[:8],
        video_path=str(video_path),
        channel_id=channel.channel_id,
        privacy=privacy,
    )

    # ── 8. Job upload_status = uploading (DB'ye yaz) ──────────────────────────
    _update_job_youtube_fields(
        db, job_id,
        channel_id=channel.channel_id,
        upload_status="uploading",
    )

    # ── 9. Upload ─────────────────────────────────────────────────────────────
    async def _progress_cb(phase: str, percent: int | None) -> None:
        await _emit_upload_progress(job_id, phase, percent=percent)

    try:
        video_id = await upload_video_async(
            channel=channel,
            video_path=str(video_path),
            metadata=metadata,
            privacy=privacy,
            progress_callback=_progress_cb,
        )
    except YtUploadError as exc:
        _update_job_youtube_fields(
            db, job_id,
            upload_status="failed",
            error_code=exc.code,
        )
        await _emit_upload_progress(job_id, "failed", error_code=exc.code)
        raise

    # ── 10. DB güncelle ───────────────────────────────────────────────────────
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    _update_job_youtube_fields(
        db, job_id,
        video_id=video_id,
        video_url=video_url,
        channel_id=channel.channel_id,
        upload_status="completed",
        uploaded_at=_utcnow(),
    )

    await _emit_upload_progress(job_id, "completed", percent=100, video_id=video_id)

    log.info(
        "YouTube upload tamamlandı",
        job_id=job_id[:8],
        video_id=video_id,
        channel_id=channel.channel_id,
    )

    # Upload sonucunu cache'e kaydet (idempotency için)
    cache.save_json(step_key, {
        "video_id": video_id,
        "video_url": video_url,
        "channel_id": channel.channel_id,
        "privacy": privacy,
        "uploaded_at": _utcnow(),
    })

    return {
        "provider": "youtube_api",
        "video_id": video_id,
        "video_url": video_url,
        "channel_id": channel.channel_id,
        "privacy": privacy,
        "cost_estimate_usd": 0.0,
    }


# ─── Yardımcı: Job youtube_* alanlarını güncelle ─────────────────────────────

def _update_job_youtube_fields(
    db,
    job_id: str,
    video_id: str | None = None,
    video_url: str | None = None,
    channel_id: str | None = None,
    upload_status: str | None = None,
    error_code: str | None = None,
    uploaded_at: str | None = None,
) -> None:
    """
    Job tablosundaki youtube_* alanlarını günceller.
    db=None ise sessizce atlar (hata fırlatmaz).
    """
    if not db:
        return
    try:
        from backend.models.job import Job as _Job
        job = db.query(_Job).filter_by(id=job_id).first()
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
        db.commit()
    except Exception as exc:
        log.error(
            "Job youtube_ alanları güncellenirken hata",
            job_id=job_id[:8],
            error=str(exc),
        )
        try:
            db.rollback()
        except Exception:
            pass
