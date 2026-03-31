"""
Platform Accounts API — Faz 11.3

Endpoint'ler:
  GET  /api/platform-accounts              → Tüm hesapları listele (platform filtresi opsiyonel)
  GET  /api/platform-accounts/{id}         → Tek hesap detayı
  PATCH /api/platform-accounts/{id}/active  → Aktif/pasif toggling
  PATCH /api/platform-accounts/{id}/default → Varsayılan yap (platform başına tek)
  DELETE /api/platform-accounts/{id}        → Hesabı sil (Admin PIN gerekli)

Tasarım:
  - credentials_json asla API yanıtında dönmez (güvenlik)
  - Tüm mutasyon endpoint'leri X-Admin-Pin header'ı gerektirir
  - Platform başına sadece bir varsayılan hesap olabilir (set_default otomatik temizler)
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.platform_account import PlatformAccount
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/platform-accounts", tags=["platform-accounts"])

# Admin PIN (settings tablosundan okunur — main.py'de set edilir)
_ADMIN_PIN_KEY = "admin_pin"


# ─── Şemalar ──────────────────────────────────────────────────────────────────


class PlatformAccountResponse(BaseModel):
    """Tek hesabın API yanıtı — credentials_json asla dahil edilmez."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    platform: str
    account_name: str
    external_account_id: str
    is_active: bool
    is_default: bool
    created_at: str
    updated_at: str
    # credentials_json kasıtlı olarak hariç tutulmuştur


class PlatformAccountListResponse(BaseModel):
    accounts: list[PlatformAccountResponse]
    total: int


# ─── Yardımcılar ──────────────────────────────────────────────────────────────


def _require_admin(x_admin_pin: str | None, db: Session) -> None:
    """Admin PIN'i doğrular. Geçersizse 403 fırlatır."""
    if x_admin_pin is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="X-Admin-Pin header gerekli",
        )
    from backend.models.settings import Setting
    row = db.query(Setting).filter_by(scope="admin", scope_id="", key="admin_pin").first()
    if row is None:
        # Admin PIN ayarlanmamışsa default "0000"
        expected = "0000"
    else:
        import json as _json
        try:
            expected = str(_json.loads(row.value))
        except Exception:
            expected = str(row.value)
    if x_admin_pin != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Geçersiz Admin PIN",
        )


def _get_account_or_404(account_id: int, db: Session) -> PlatformAccount:
    acc = db.query(PlatformAccount).filter_by(id=account_id).first()
    if acc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Platform hesabı bulunamadı: {account_id}",
        )
    return acc


# ─── Endpoint'ler ─────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=PlatformAccountListResponse,
    summary="Platform hesaplarını listele",
)
def list_platform_accounts(
    platform: str | None = None,
    db: Session = Depends(get_db),
) -> PlatformAccountListResponse:
    """
    Tüm platform hesaplarını döndürür.
    `platform` query param ile filtrelenebilir: ?platform=youtube
    """
    q = db.query(PlatformAccount)
    if platform:
        q = q.filter_by(platform=platform)
    accounts = q.order_by(PlatformAccount.platform, PlatformAccount.created_at).all()
    return PlatformAccountListResponse(
        accounts=[PlatformAccountResponse.model_validate(a) for a in accounts],
        total=len(accounts),
    )


@router.get(
    "/{account_id}",
    response_model=PlatformAccountResponse,
    summary="Tek hesap detayı",
)
def get_platform_account(
    account_id: int,
    db: Session = Depends(get_db),
) -> PlatformAccountResponse:
    acc = _get_account_or_404(account_id, db)
    return PlatformAccountResponse.model_validate(acc)


@router.patch(
    "/{account_id}/active",
    response_model=PlatformAccountResponse,
    summary="Aktif/pasif toggling",
)
def toggle_active(
    account_id: int,
    db: Session = Depends(get_db),
    x_admin_pin: str | None = Header(default=None),
) -> PlatformAccountResponse:
    _require_admin(x_admin_pin, db)
    acc = _get_account_or_404(account_id, db)

    acc.is_active = not acc.is_active

    # Pasif yapılırsa varsayılan sıfırla
    if not acc.is_active and acc.is_default:
        acc.is_default = False
        log.info(
            "PlatformAccount pasif yapıldı, varsayılan sıfırlandı",
            id=account_id,
            platform=acc.platform,
        )

    db.commit()
    db.refresh(acc)
    log.info(
        "PlatformAccount aktiflik durumu değişti",
        id=account_id,
        platform=acc.platform,
        is_active=acc.is_active,
    )
    return PlatformAccountResponse.model_validate(acc)


@router.patch(
    "/{account_id}/default",
    response_model=PlatformAccountResponse,
    summary="Varsayılan hesap yap",
)
def set_default(
    account_id: int,
    db: Session = Depends(get_db),
    x_admin_pin: str | None = Header(default=None),
) -> PlatformAccountResponse:
    _require_admin(x_admin_pin, db)
    acc = _get_account_or_404(account_id, db)

    if not acc.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pasif hesap varsayılan yapılamaz. Önce aktif edin.",
        )

    # Aynı platformdaki diğer varsayılanları temizle
    db.query(PlatformAccount).filter(
        PlatformAccount.platform == acc.platform,
        PlatformAccount.id != account_id,
    ).update({"is_default": False})

    acc.is_default = True
    db.commit()
    db.refresh(acc)
    log.info(
        "PlatformAccount varsayılan yapıldı",
        id=account_id,
        platform=acc.platform,
        external_id=acc.external_account_id,
    )
    return PlatformAccountResponse.model_validate(acc)


@router.delete(
    "/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Hesabı sil",
)
def delete_platform_account(
    account_id: int,
    db: Session = Depends(get_db),
    x_admin_pin: str | None = Header(default=None),
) -> None:
    _require_admin(x_admin_pin, db)
    acc = _get_account_or_404(account_id, db)
    db.delete(acc)
    db.commit()
    log.info(
        "PlatformAccount silindi",
        id=account_id,
        platform=acc.platform,
        external_id=acc.external_account_id,
    )
