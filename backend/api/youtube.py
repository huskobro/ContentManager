"""
YouTube API — Kanal bağlama, OAuth 2.0 ve kanal yönetimi.

Endpoint'ler:
  GET    /api/youtube/channels              → Bağlı kanalları listele
  POST   /api/youtube/channels/{id}/default → Varsayılan kanal seç
  DELETE /api/youtube/channels/{id}         → Kanal bağlantısını kes
  PATCH  /api/youtube/channels/{id}/active  → Kanal aktif/pasif toggle

  OAuth flow:
  GET    /api/youtube/oauth/url             → Google OAuth başlatma URL'si
  GET    /api/youtube/oauth/callback        → Google redirect callback → token al → kanal kaydet
  GET    /api/youtube/oauth/status          → OAuth yapılandırma durumu

Yetkilendirme:
  • Tüm channel yönetim endpoint'leri Admin PIN gerektirir.
  • /oauth/callback Google tarafından çağrılır (state param ile PIN doğrulanır).
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.database import get_db
from backend.models.youtube_channel import YouTubeChannel
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter()

# OAuth state → admin_pin geçici haritası (process-local, restart'ta temizlenir)
_OAUTH_STATE_STORE: dict[str, str] = {}

# Google OAuth scopes
_YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
]


# ─── Yardımcılar ─────────────────────────────────────────────────────────────

def _require_admin(x_admin_pin: str | None = Header(default=None)) -> str:
    if not x_admin_pin or x_admin_pin != app_settings.admin_pin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz veya eksik admin PIN'i.",
        )
    return x_admin_pin


def _get_oauth_client_id() -> str:
    """google_client_id öncelikli, fallback youtube_client_id."""
    return app_settings.google_client_id or app_settings.youtube_client_id


def _get_oauth_client_secret() -> str:
    return app_settings.google_client_secret or app_settings.youtube_client_secret


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_flow():
    """google-auth-oauthlib Flow nesnesi oluşturur."""
    from google_auth_oauthlib.flow import Flow  # type: ignore[import]

    client_config = {
        "web": {
            "client_id": _get_oauth_client_id(),
            "client_secret": _get_oauth_client_secret(),
            "redirect_uris": [app_settings.youtube_oauth_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=_YOUTUBE_SCOPES,
        redirect_uri=app_settings.youtube_oauth_redirect_uri,
    )
    return flow


# ─── Pydantic şemaları ────────────────────────────────────────────────────────

class ChannelResponse(BaseModel):
    id: int
    channel_id: str
    channel_name: str
    channel_thumbnail: str
    is_default: bool
    is_active: bool
    connected_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


# ─── OAuth Endpoints ─────────────────────────────────────────────────────────

@router.get(
    "/youtube/oauth/status",
    summary="OAuth yapılandırma durumu",
    tags=["youtube"],
)
def oauth_status(
    _pin: str = Depends(_require_admin),
) -> dict:
    """Client ID yapılandırılmış mı kontrolü."""
    client_id = _get_oauth_client_id()
    configured = bool(client_id and client_id.strip())
    return {
        "configured": configured,
        "client_id_hint": client_id[:20] + "..." if configured else "",
        "redirect_uri": app_settings.youtube_oauth_redirect_uri,
        "scopes": _YOUTUBE_SCOPES,
    }


@router.get(
    "/youtube/oauth/url",
    summary="Google OAuth başlatma URL'si al",
    tags=["youtube"],
)
def get_oauth_url(
    _pin: str = Depends(_require_admin),
    x_admin_pin: str | None = Header(default=None),
) -> dict:
    """
    Frontend bu URL'yi popup/redirect olarak açar.
    State parametresi admin PIN ile eşleştirilir (CSRF koruması).
    """
    client_id = _get_oauth_client_id()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth yapılandırılmamış. .env dosyasına GOOGLE_CLIENT_ID ekleyin.",
        )

    try:
        flow = _build_flow()
        state = secrets.token_urlsafe(32)
        _OAUTH_STATE_STORE[state] = x_admin_pin or ""
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",  # her seferinde refresh_token al
            state=state,
        )
        return {"url": auth_url, "state": state}
    except Exception as exc:
        log.error("OAuth URL oluşturulamadı", error=str(exc))
        raise HTTPException(status_code=500, detail=f"OAuth URL oluşturulamadı: {exc}")


@router.get(
    "/youtube/oauth/callback",
    summary="Google OAuth callback — token al ve kanalı kaydet",
    include_in_schema=False,  # Swagger'da gizle (internal)
    tags=["youtube"],
)
def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Google bu endpoint'i callback olarak çağırır.
    Başarılıysa: frontend'e redirect (kanal kaydedildi)
    Başarısızsa: frontend'e hata redirect
    """
    frontend_base = "http://localhost:5173"

    if error:
        log.warning("OAuth callback hata", error=error)
        return RedirectResponse(
            url=f"{frontend_base}/admin/channels?oauth_error={error}",
            status_code=302,
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{frontend_base}/admin/channels?oauth_error=missing_code",
            status_code=302,
        )

    # State doğrulama
    if state not in _OAUTH_STATE_STORE:
        return RedirectResponse(
            url=f"{frontend_base}/admin/channels?oauth_error=invalid_state",
            status_code=302,
        )
    _OAUTH_STATE_STORE.pop(state, None)

    try:
        # Token al
        flow = _build_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Kanal bilgisi çek (YouTube Data API)
        from googleapiclient.discovery import build  # type: ignore[import]

        yt_service = build("youtube", "v3", credentials=credentials)
        channels_response = yt_service.channels().list(
            part="snippet",
            mine=True,
        ).execute()

        items = channels_response.get("items", [])
        if not items:
            return RedirectResponse(
                url=f"{frontend_base}/admin/channels?oauth_error=no_channel",
                status_code=302,
            )

        channel_item = items[0]
        channel_id = channel_item["id"]
        channel_name = channel_item["snippet"].get("title", "")
        channel_thumbnail = (
            channel_item["snippet"]
            .get("thumbnails", {})
            .get("default", {})
            .get("url", "")
        )

        # Token expiry
        expiry_iso = (
            credentials.expiry.isoformat()
            if credentials.expiry
            else ""
        )

        # Upsert: zaten bağlıysa token'ları güncelle
        existing = db.query(YouTubeChannel).filter_by(channel_id=channel_id).first()
        if existing:
            existing.access_token = credentials.token or ""
            existing.refresh_token = credentials.refresh_token or existing.refresh_token
            existing.token_expiry = expiry_iso
            existing.channel_name = channel_name
            existing.channel_thumbnail = channel_thumbnail
            existing.is_active = True
            existing.updated_at = _utcnow()
            db.commit()
            log.info("YouTube kanalı yeniden bağlandı", channel_id=channel_id)
        else:
            # İlk kanal ise varsayılan yap
            is_first = db.query(YouTubeChannel).count() == 0
            new_channel = YouTubeChannel(
                channel_id=channel_id,
                channel_name=channel_name,
                channel_thumbnail=channel_thumbnail,
                access_token=credentials.token or "",
                refresh_token=credentials.refresh_token or "",
                token_expiry=expiry_iso,
                is_default=is_first,
                is_active=True,
            )
            db.add(new_channel)
            db.commit()
            log.info("Yeni YouTube kanalı bağlandı", channel_id=channel_id, is_default=is_first)

        return RedirectResponse(
            url=f"{frontend_base}/admin/channels?oauth_success=1",
            status_code=302,
        )

    except Exception as exc:
        log.error("OAuth callback işlenemedi", error=str(exc))
        return RedirectResponse(
            url=f"{frontend_base}/admin/channels?oauth_error=server_error",
            status_code=302,
        )


# ─── Kanal CRUD Endpoints ─────────────────────────────────────────────────────

@router.get(
    "/youtube/channels",
    response_model=list[ChannelResponse],
    summary="Bağlı kanalları listele",
    tags=["youtube"],
)
def list_channels(
    _pin: str = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> list[YouTubeChannel]:
    """Tüm bağlı kanalları döner (aktif + pasif)."""
    return db.query(YouTubeChannel).order_by(
        YouTubeChannel.is_default.desc(),
        YouTubeChannel.connected_at.asc(),
    ).all()


@router.post(
    "/youtube/channels/{channel_db_id}/default",
    response_model=ChannelResponse,
    summary="Varsayılan kanal seç",
    tags=["youtube"],
)
def set_default_channel(
    channel_db_id: int,
    _pin: str = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> YouTubeChannel:
    """
    Verilen kanalı varsayılan yapar, diğerlerini sıfırlar.
    Anında kayıt — save standard toggle pattern (BST-001 rollback burada uygulandı).
    """
    channel = db.query(YouTubeChannel).filter_by(id=channel_db_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail=f"Kanal bulunamadı: id={channel_db_id}")
    if not channel.is_active:
        raise HTTPException(status_code=400, detail="Pasif kanal varsayılan yapılamaz.")

    # Tüm kanalların is_default'unu sıfırla, sonra bu kanalı işaretle
    db.query(YouTubeChannel).update({"is_default": False})
    channel.is_default = True
    channel.updated_at = _utcnow()
    db.commit()
    db.refresh(channel)
    log.info("Varsayılan kanal güncellendi", channel_id=channel.channel_id)
    return channel


@router.patch(
    "/youtube/channels/{channel_db_id}/active",
    response_model=ChannelResponse,
    summary="Kanal aktif/pasif toggle",
    tags=["youtube"],
)
def toggle_channel_active(
    channel_db_id: int,
    _pin: str = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> YouTubeChannel:
    """
    Kanal aktif/pasif durumunu değiştirir.
    Pasife alınan varsayılan kanal, varsayılan statüsünü kaybeder.
    """
    channel = db.query(YouTubeChannel).filter_by(id=channel_db_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail=f"Kanal bulunamadı: id={channel_db_id}")

    channel.is_active = not channel.is_active
    if not channel.is_active and channel.is_default:
        channel.is_default = False
    channel.updated_at = _utcnow()
    db.commit()
    db.refresh(channel)
    log.info(
        "Kanal durumu değiştirildi",
        channel_id=channel.channel_id,
        is_active=channel.is_active,
    )
    return channel


@router.delete(
    "/youtube/channels/{channel_db_id}",
    status_code=200,
    summary="Kanal bağlantısını kes",
    tags=["youtube"],
)
def disconnect_channel(
    channel_db_id: int,
    _pin: str = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """
    Kanalı veritabanından siler (token'lar da silinir).
    Varsayılan kanal silindikten sonra başka kanal varsa ilki varsayılan olur.
    """
    channel = db.query(YouTubeChannel).filter_by(id=channel_db_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail=f"Kanal bulunamadı: id={channel_db_id}")

    was_default = channel.is_default
    channel_name = channel.channel_name
    db.delete(channel)
    db.commit()

    # Varsayılan silinmişse bir sonrakini varsayılan yap
    if was_default:
        next_channel = db.query(YouTubeChannel).filter_by(is_active=True).first()
        if next_channel:
            next_channel.is_default = True
            next_channel.updated_at = _utcnow()
            db.commit()

    log.info("Kanal bağlantısı kesildi", channel_name=channel_name)
    return {"ok": True, "deleted": channel_name}
