"""
YouTube Upload Service — Token yönetimi, credential oluşturma, hata kod eşleme.

Sorumluluklar:
  • OAuth2 credentials oluşturma (google-auth)
  • access_token süresi dolmuşsa refresh_token ile yenileme
  • Yenilenen token'ı DB'ye geri yazma
  • YouTube API hata kodlarını proje standart hata kodlarına eşleme
  • Metadata normalizer (title/description/tags/category)
  • Privacy validator

Tasarım kararları:
  • googleapiclient I/O blokayıcıdır → asyncio.get_event_loop().run_in_executor()
    ile thread pool'a gönderilir; event loop bloklanmaz.
  • Token refresh başarısızsa YtUploadError(YT_TOKEN_REFRESH_FAILED) fırlatılır.
  • Tüm secrets (token, refresh_token) loglara yazılmaz.
  • category_id: YouTube text kategori adını integer string'e map eder.
    Eşleşme yoksa "22" (People & Blogs) döner — sessiz fallback.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from backend.utils.logger import get_logger

log = get_logger(__name__)

# ─── Hata kodları ─────────────────────────────────────────────────────────────

YT_AUTH_ERROR              = "YT_AUTH_ERROR"
YT_TOKEN_REFRESH_FAILED    = "YT_TOKEN_REFRESH_FAILED"
YT_QUOTA_EXCEEDED          = "YT_QUOTA_EXCEEDED"
YT_FILE_NOT_FOUND          = "YT_FILE_NOT_FOUND"
YT_CHANNEL_NOT_FOUND       = "YT_CHANNEL_NOT_FOUND"
YT_NO_DEFAULT_CHANNEL      = "YT_NO_DEFAULT_CHANNEL"
YT_METADATA_INVALID        = "YT_METADATA_INVALID"
YT_UPLOAD_FAILED           = "YT_UPLOAD_FAILED"
YT_DUPLICATE_UPLOAD_BLOCKED = "YT_DUPLICATE_UPLOAD_BLOCKED"


class YtUploadError(Exception):
    """Upload pipeline'ında fırlatılan tip-güvenli hata."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"


# ─── YouTube kategori → categoryId map ────────────────────────────────────────
# https://developers.google.com/youtube/v3/docs/videoCategories

_CATEGORY_MAP: dict[str, str] = {
    # Türkçe
    "eğitim": "27",
    "egitim": "27",
    "eğlence": "24",
    "eglence": "24",
    "haber": "25",
    "teknoloji": "28",
    "bilim": "28",
    "bilim ve teknoloji": "28",
    "spor": "17",
    "oyun": "20",
    "gaming": "20",
    "müzik": "10",
    "muzik": "10",
    "film": "1",
    "yemek": "26",
    "seyahat": "19",
    "sağlık": "26",
    "saglik": "26",
    "çocuk": "20",
    "cocuk": "20",
    "motivasyon": "22",
    "genel": "22",
    # İngilizce
    "education": "27",
    "entertainment": "24",
    "news": "25",
    "technology": "28",
    "science": "28",
    "science & technology": "28",
    "sports": "17",
    "gaming": "20",
    "music": "10",
    "film & animation": "1",
    "howto": "26",
    "how-to": "26",
    "people & blogs": "22",
    "travel": "19",
    "health": "26",
    "comedy": "23",
}

_DEFAULT_CATEGORY_ID = "22"  # People & Blogs


def map_category_to_id(category: str | None) -> str:
    """
    Kategori ismini YouTube categoryId'ye çevirir.

    Eşleşme bulamazsa güvenli fallback "22" (People & Blogs) döner.
    Integer string gelirse (ör. "27") doğrudan döner.
    """
    if not category:
        return _DEFAULT_CATEGORY_ID

    # Integer string ise olduğu gibi döndür (zaten ID)
    stripped = str(category).strip()
    if stripped.isdigit():
        return stripped

    return _CATEGORY_MAP.get(stripped.lower(), _DEFAULT_CATEGORY_ID)


# ─── Privacy validator ────────────────────────────────────────────────────────

_ALLOWED_PRIVACY = {"private", "unlisted", "public"}
_DEFAULT_PRIVACY = "private"


def validate_privacy(value: Any) -> str:
    """
    YouTube privacy status değerini doğrular ve normalize eder.

    Kural:
      • private / unlisted / public → olduğu gibi döner
      • Tanınmayan değer → "private" döner (güvenli default, log ile)
    """
    if isinstance(value, str) and value.lower() in _ALLOWED_PRIVACY:
        return value.lower()

    log.warning(
        "Geçersiz youtube_privacy değeri, 'private' kullanılıyor",
        received=repr(value),
    )
    return _DEFAULT_PRIVACY


# ─── Metadata normalizer ─────────────────────────────────────────────────────

_MAX_TITLE_LEN       = 100   # YouTube limit: 100
_MAX_DESC_LEN        = 5000  # YouTube limit: 5000
_MAX_TAG_LEN         = 500   # YouTube: tek tag max 500 karakter
_MAX_TOTAL_TAG_CHARS = 500   # YouTube: tüm tag'ların toplamı max 500 karakter


def normalize_metadata(
    raw: dict[str, Any],
    job_title: str = "",
) -> dict[str, Any]:
    """
    Metadata step çıktısını YouTube upload için normalize eder.

    Alanlar:
      title       → boşsa job_title; > 100 karakter ise kes
      description → boşsa ""; > 5000 karakter ise kes
      tags        → her tag strip + max 500 karakter; toplam 500 karakter limiti
      category_id → map_category_to_id ile integer string'e çevir

    Herhangi bir alan eksik veya boşsa güvenli fallback uygulanır.
    YtUploadError fırlatılmaz — dönüş her zaman geçerli bir dict'tir.
    """
    title = str(raw.get("youtube_title") or "").strip()
    if not title:
        title = str(job_title or "Video").strip()[:_MAX_TITLE_LEN]
    else:
        title = title[:_MAX_TITLE_LEN]

    description = str(raw.get("youtube_description") or "").strip()
    description = description[:_MAX_DESC_LEN]

    raw_tags = raw.get("tags") or []
    if not isinstance(raw_tags, list):
        raw_tags = []

    # Tag normalizasyonu
    normalized_tags: list[str] = []
    total_chars = 0
    for tag in raw_tags:
        tag_str = str(tag).strip()[:_MAX_TAG_LEN]
        if not tag_str:
            continue
        if total_chars + len(tag_str) > _MAX_TOTAL_TAG_CHARS:
            break
        normalized_tags.append(tag_str)
        total_chars += len(tag_str)

    category_id = map_category_to_id(raw.get("category"))

    return {
        "title": title,
        "description": description,
        "tags": normalized_tags,
        "category_id": category_id,
    }


# ─── Credential / token refresh ──────────────────────────────────────────────


def _is_token_expired(token_expiry_iso: str) -> bool:
    """
    ISO-8601 UTC string'ini parse edip şu anki UTC ile karşılaştırır.
    Parse hatası → True döner (güvenli taraf: yenile).
    """
    if not token_expiry_iso:
        return True
    try:
        expiry = datetime.fromisoformat(token_expiry_iso)
        # Timezone-naive ise UTC kabul et
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        # 60 saniye erken refresh (clock drift için buffer)
        now = datetime.now(timezone.utc)
        return (expiry - now).total_seconds() < 60
    except (ValueError, TypeError):
        return True


def _build_credentials(channel):
    """
    YouTubeChannel ORM nesnesinden google.oauth2.credentials.Credentials oluşturur.

    Raises:
        ImportError: google-auth kütüphanesi yüklü değilse.
    """
    from google.oauth2.credentials import Credentials  # type: ignore[import]

    return Credentials(
        token=channel.access_token or None,
        refresh_token=channel.refresh_token or None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=_get_client_id(),
        client_secret=_get_client_secret(),
    )


def _get_client_id() -> str:
    from backend.config import settings as app_settings
    return app_settings.google_client_id or app_settings.youtube_client_id


def _get_client_secret() -> str:
    from backend.config import settings as app_settings
    return app_settings.google_client_secret or app_settings.youtube_client_secret


def refresh_channel_token(channel, db) -> None:
    """
    channel.access_token süresi dolmuşsa refresh_token ile yeniler.
    Yeni token değerlerini DB'ye yazar.

    Args:
        channel: YouTubeChannel ORM instance.
        db: SQLAlchemy Session.

    Raises:
        YtUploadError(YT_TOKEN_REFRESH_FAILED): Yenileme başarısızsa.
    """
    from google.auth.transport.requests import Request  # type: ignore[import]
    from google.auth.exceptions import RefreshError     # type: ignore[import]

    if not _is_token_expired(channel.token_expiry):
        return  # Token hâlâ geçerli

    log.info("YouTube token yenileniyor", channel_id=channel.channel_id)

    try:
        creds = _build_credentials(channel)
        creds.refresh(Request())

        # Güncel token'ları DB'ye yaz
        channel.access_token = creds.token or ""
        if creds.refresh_token:
            channel.refresh_token = creds.refresh_token
        channel.token_expiry = creds.expiry.isoformat() if creds.expiry else ""
        channel.updated_at = datetime.now(timezone.utc).isoformat()
        db.commit()

        log.info("YouTube token yenilendi", channel_id=channel.channel_id)

    except RefreshError as exc:
        log.error(
            "YouTube token yenileme başarısız",
            channel_id=channel.channel_id,
            error=str(exc),
        )
        raise YtUploadError(
            YT_TOKEN_REFRESH_FAILED,
            f"Token yenileme başarısız: {str(exc)[:200]}",
        ) from exc
    except Exception as exc:
        log.error(
            "YouTube token yenileme beklenmeyen hata",
            channel_id=channel.channel_id,
            error=str(exc),
        )
        raise YtUploadError(
            YT_TOKEN_REFRESH_FAILED,
            f"Token yenileme hatası: {str(exc)[:200]}",
        ) from exc


# ─── API hata kodu eşleme ─────────────────────────────────────────────────────


def map_api_error(exc: Exception) -> YtUploadError:
    """
    googleapiclient.errors.HttpError'ı proje hata koduna eşler.

    Tanınan hata kalıpları:
      403 quotaExceeded / userRateLimitExceeded → YT_QUOTA_EXCEEDED
      401 / authError / invalidCredentials       → YT_AUTH_ERROR
      Diğer tüm HTTP hataları                    → YT_UPLOAD_FAILED
    """
    try:
        from googleapiclient.errors import HttpError  # type: ignore[import]
        if isinstance(exc, HttpError):
            status = exc.resp.status if exc.resp else 0
            content = exc.content or b""
            body_str = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else str(content)

            if status == 401 or "authError" in body_str or "invalidCredentials" in body_str:
                return YtUploadError(YT_AUTH_ERROR, f"YouTube kimlik doğrulama hatası (HTTP {status})")

            if status == 403 and ("quotaExceeded" in body_str or "userRateLimitExceeded" in body_str):
                return YtUploadError(YT_QUOTA_EXCEEDED, "YouTube API kotası aşıldı")

            return YtUploadError(
                YT_UPLOAD_FAILED,
                f"YouTube API hatası (HTTP {status}): {body_str[:200]}",
            )
    except ImportError:
        pass

    return YtUploadError(YT_UPLOAD_FAILED, f"YouTube yükleme hatası: {str(exc)[:200]}")


# ─── Async upload wrapper ─────────────────────────────────────────────────────


async def upload_video_async(
    channel,
    video_path: str,
    metadata: dict[str, Any],
    privacy: str,
    progress_callback,
) -> str:
    """
    YouTube Data API v3 ile video yükler (thread pool'da çalışır).

    Args:
        channel: YouTubeChannel ORM instance (token'lar dolu olmalı).
        video_path: Yüklenecek MP4 dosyasının tam yolu.
        metadata: normalize_metadata() çıktısı.
        privacy: "private" | "unlisted" | "public"
        progress_callback: async callable(phase: str, percent: int | None)

    Returns:
        Yüklenen videonun YouTube video ID'si.

    Raises:
        YtUploadError: Herhangi bir yükleme hatasında.
    """
    loop = asyncio.get_event_loop()

    def _blocking_upload():
        from googleapiclient.discovery import build        # type: ignore[import]
        from googleapiclient.http import MediaFileUpload   # type: ignore[import]
        from googleapiclient.errors import HttpError       # type: ignore[import]

        creds = _build_credentials(channel)

        yt_service = build(
            "youtube", "v3",
            credentials=creds,
            cache_discovery=False,  # credentials.json önbelleği bypass
        )

        request_body = {
            "snippet": {
                "title": metadata["title"],
                "description": metadata["description"],
                "tags": metadata["tags"],
                "categoryId": metadata["category_id"],
            },
            "status": {
                "privacyStatus": privacy,
                "madeForKids": False,
            },
        }

        media = MediaFileUpload(
            video_path,
            mimetype="video/mp4",
            resumable=True,
            chunksize=5 * 1024 * 1024,  # 5 MB chunk
        )

        insert_request = yt_service.videos().insert(
            part="snippet,status",
            body=request_body,
            media_body=media,
        )

        response = None
        while response is None:
            try:
                status, response = insert_request.next_chunk()
            except HttpError as exc:
                raise map_api_error(exc) from exc

        return response.get("id", "")

    try:
        await progress_callback("uploading", 0)
        video_id = await loop.run_in_executor(None, _blocking_upload)
        await progress_callback("processing_response", 100)
        return video_id

    except YtUploadError:
        raise
    except Exception as exc:
        raise map_api_error(exc) from exc
