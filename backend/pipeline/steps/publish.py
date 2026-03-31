"""
Generic Publish Pipeline Adımı — Faz 11.1A

Mevcut youtube_upload.py'nin platform-genel karşılığı.
Bir veya daha fazla platformu aynı anda hedefleyebilir.

Yapılandırma bayrakları (config dict'ten okunur, tümü boolean, varsayılan False):
  publish_to_youtube   → YouTube'a yükle
  publish_to_tiktok    → TikTok'a yükle   (gelecek)
  publish_to_instagram → Instagram'a yükle (gelecek)
  publish_to_facebook  → Facebook'a yükle  (gelecek)

Platform başına gizlilik ayarı:
  youtube_privacy  → "private" | "unlisted" | "public" (varsayılan: "private")

Davranış:
  - is_fatal=False: Herhangi bir platform başarısız olursa job yine "completed"
  - Her platform bağımsız olarak çalışır; biri başarısız olursa diğerleri devam eder
  - Var olan "published" JobPublishTarget bulunursa platform atlanır (idempotent)
  - Video dosyası yoksa platform "skipped" olarak işaretlenir
  - Sonuç cache'e kaydedilir

SSE Olayları:
  "publish_progress" → {job_id, platform, phase, percent?, external_id?, error_code?}

Geriye Dönük Uyumluluk:
  - Mevcut youtube_upload step (order=6) değişmeden kalır
  - Bu step order=7 olarak eklenir
  - orchestrator._mirror_youtube_compat() sayesinde Job.youtube_* alanları güncellenir
  - Çift yükleme koruması: JobPublishTarget.status == "published" ise atlanır
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.pipeline.cache import CacheManager
from backend.services.job_manager import sse_hub, global_sse_hub
from backend.utils.logger import get_logger

log = get_logger(__name__)

_SUPPORTED_PLATFORMS = ("youtube", "tiktok", "instagram", "facebook")


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_bool(value: Any) -> bool:
    """Her türden gelen flag değerini bool'a çevirir."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("true", "1", "yes")
    return bool(value)


async def _emit_publish_progress(
    job_id: str,
    platform: str,
    phase: str,
    percent: int | None = None,
    external_id: str | None = None,
    error_code: str | None = None,
) -> None:
    """Her platforma özel publish_progress SSE eventi yayınlar."""
    data: dict[str, Any] = {
        "job_id": job_id,
        "platform": platform,
        "phase": phase,
        "timestamp": _utcnow(),
    }
    if percent is not None:
        data["percent"] = percent
    if external_id is not None:
        data["external_id"] = external_id
    if error_code is not None:
        data["error_code"] = error_code

    await sse_hub.publish(job_id, "publish_progress", data)
    await global_sse_hub.publish("publish_progress", data)


async def step_publish(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Platform-agnostik çoklu yayın adımı.

    Her etkin platform için:
      1. JobPublishTarget bul veya oluştur
      2. Varsayılan PlatformAccount'u çöz (yoksa YouTubeChannel bridge'i dene)
      3. PublishOrchestrator.publish_job() çağır
      4. SSE publish_progress eventi yayınla

    Returns:
        {platforms: {platform: result}, any_published, any_enabled, cost_estimate_usd, provider}
    """
    db = config.get("_db")
    job_title = config.get("_job_title", "Video")
    module_key = config.get("_module_key", "standard_video")

    results: dict[str, Any] = {"platforms": {}}
    any_published = False
    any_enabled = False

    # ── Video dosyası yolunu çöz ─────────────────────────────────────────────
    video_path: Path | None = None

    if db:
        from backend.models.job import Job as _Job
        job_row = db.query(_Job).filter_by(id=job_id).first()
        if job_row and job_row.output_path:
            candidate = Path(job_row.output_path)
            if candidate.exists() and candidate.stat().st_size > 0:
                video_path = candidate

    if video_path is None:
        cache_path = cache.get_output_path("composition", "final.mp4")
        if cache_path.exists() and cache_path.stat().st_size > 0:
            video_path = cache_path

    # ── Metadata normalize et ────────────────────────────────────────────────
    from backend.services.youtube_upload_service import normalize_metadata
    raw_metadata = cache.load_json("metadata") or {}
    metadata = normalize_metadata(raw_metadata, job_title=job_title)

    # ── Her platform için işle ───────────────────────────────────────────────
    for platform in _SUPPORTED_PLATFORMS:
        flag_key = f"publish_to_{platform}"
        if not _parse_bool(config.get(flag_key)):
            continue

        any_enabled = True
        log.info("Platform yayın başlıyor", job_id=job_id[:8], platform=platform)

        # Video dosyası yoksa atla
        if video_path is None:
            await _emit_publish_progress(
                job_id, platform, "failed",
                error_code="PUBLISH_FILE_NOT_FOUND",
            )
            results["platforms"][platform] = {
                "skipped": True,
                "reason": "video_file_not_found",
            }
            continue

        if not db:
            results["platforms"][platform] = {
                "skipped": True,
                "reason": "no_db_session",
            }
            continue

        # ── PlatformAccount'u bul ────────────────────────────────────────────
        from backend.models.platform_account import PlatformAccount
        account = (
            db.query(PlatformAccount)
            .filter(
                PlatformAccount.platform == platform,
                PlatformAccount.is_active == True,   # noqa: E712
                PlatformAccount.is_default == True,  # noqa: E712
            )
            .first()
        )

        # YouTube için geriye dönük bridge: yoksa YouTubeChannel'dan oluştur
        if account is None and platform == "youtube":
            account = _youtube_channel_bridge(db)

        if account is None:
            await _emit_publish_progress(
                job_id, platform, "failed",
                error_code=f"{platform.upper()}_NO_DEFAULT_ACCOUNT",
            )
            results["platforms"][platform] = {
                "skipped": True,
                "reason": "no_default_account",
            }
            continue

        # ── JobPublishTarget bul veya oluştur ─────────────────────────────────
        from backend.models.publish_target import JobPublishTarget
        target = (
            db.query(JobPublishTarget)
            .filter(
                JobPublishTarget.job_id == job_id,
                JobPublishTarget.platform == platform,
            )
            .first()
        )

        if target is None:
            privacy = _resolve_privacy(platform, config)
            target = JobPublishTarget(
                job_id=job_id,
                platform_account_id=account.id,
                platform=platform,
                content_type=module_key,
                privacy_status=privacy,
            )
            db.add(target)
            db.flush()

        # Zaten yayınlanmışsa atla (idempotency)
        if target.status == "published":
            log.info(
                "Platform zaten yayınlanmış — atlandı",
                job_id=job_id[:8],
                platform=platform,
                external_id=target.external_object_id,
            )
            results["platforms"][platform] = {
                "skipped": True,
                "reason": "already_published",
                "external_id": target.external_object_id,
                "external_url": target.external_url,
            }
            any_published = True  # sayılır
            continue

        # ── Yayın ────────────────────────────────────────────────────────────
        await _emit_publish_progress(job_id, platform, "preparing")

        from backend.publishing.orchestrator import PublishOrchestrator
        orchestrator = PublishOrchestrator(db)

        async def _progress_cb(phase: str, percent: int | None) -> None:
            await _emit_publish_progress(job_id, platform, phase, percent=percent)

        try:
            attempt = await orchestrator.publish_job(
                job_id=job_id,
                target=target,
                video_path=str(video_path),
                metadata=metadata,
                progress_callback=_progress_cb,
            )

            await _emit_publish_progress(
                job_id, platform, "completed",
                percent=100,
                external_id=target.external_object_id,
            )

            results["platforms"][platform] = {
                "published": True,
                "external_id": target.external_object_id,
                "external_url": target.external_url,
                "attempt_id": attempt.id,
            }
            any_published = True

        except Exception as exc:
            error_code = getattr(exc, "code", "PUBLISH_ERROR")
            await _emit_publish_progress(
                job_id, platform, "failed", error_code=error_code
            )
            results["platforms"][platform] = {
                "published": False,
                "error": str(exc)[:300],
                "error_code": error_code,
            }
            log.error(
                "Platform yayın hatası (devam ediliyor)",
                job_id=job_id[:8],
                platform=platform,
                error=str(exc),
            )

    results["any_published"] = any_published
    results["any_enabled"] = any_enabled
    results["cost_estimate_usd"] = 0.0
    results["provider"] = "publishing_hub"

    # Cache'e yaz (idempotency için)
    cache.save_json(step_key, results)
    return results


# ─── Yardımcılar ──────────────────────────────────────────────────────────────


def _resolve_privacy(platform: str, config: dict[str, Any]) -> str:
    """Platform-spesifik gizlilik değerini çözer."""
    from backend.services.youtube_upload_service import validate_privacy
    # Önce platform-özel anahtar (ör. youtube_privacy), yoksa genel privacy
    key = f"{platform}_privacy"
    return validate_privacy(config.get(key) or config.get("privacy", "private"))


def _youtube_channel_bridge(db: Any) -> Any | None:
    """
    Geriye Dönük Uyumluluk Köprüsü: YouTubeChannel → PlatformAccount.

    Mevcut varsayılan aktif YouTubeChannel'ı bulur ve karşılık gelen
    PlatformAccount kaydını döndürür. Kayıt yoksa oluşturur (lazy migration).

    Bu fonksiyon yalnızca PlatformAccount tablosunda YouTube hesabı olmadığında çalışır.
    Bir kez çalıştıktan sonra (PlatformAccount oluşturulduktan sonra) bir daha çalışmaz.
    """
    from backend.models.youtube_channel import YouTubeChannel
    from backend.models.platform_account import PlatformAccount
    import json as _json

    channel = (
        db.query(YouTubeChannel)
        .filter(
            YouTubeChannel.is_active == True,   # noqa: E712
            YouTubeChannel.is_default == True,  # noqa: E712
        )
        .first()
    )
    if not channel:
        return None

    # Zaten var mı?
    existing = (
        db.query(PlatformAccount)
        .filter(
            PlatformAccount.platform == "youtube",
            PlatformAccount.external_account_id == channel.channel_id,
        )
        .first()
    )
    if existing:
        return existing

    # Lazy migration: PlatformAccount oluştur
    creds = _json.dumps({
        "access_token":  channel.access_token  or "",
        "refresh_token": channel.refresh_token or "",
        "token_expiry":  channel.token_expiry  or "",
    })
    account = PlatformAccount(
        platform="youtube",
        account_name=channel.channel_name or "YouTube Kanalı",
        external_account_id=channel.channel_id,
        credentials_json=creds,
        is_active=channel.is_active,
        is_default=channel.is_default,
    )
    db.add(account)
    db.commit()

    log.info(
        "YouTubeChannel → PlatformAccount köprüsü kuruldu",
        channel_id=channel.channel_id,
        account_id=account.id,
    )
    return account
