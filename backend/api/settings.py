"""
Settings API — Ayar yönetimi endpoint'leri.

Endpoint'ler:
  GET    /api/settings/resolved  → Çözümlenmiş ayarları getir (5 katman uygulanmış)
  GET    /api/settings           → Belirli scope'un ham ayarlarını listele
  POST   /api/settings           → Yeni ayar oluştur
  POST   /api/settings/bulk      → Toplu ayar oluştur/güncelle
  PUT    /api/settings/{id}      → Mevcut ayarı güncelle
  DELETE /api/settings/{id}      → Ayar sil

Yetkilendirme:
  • GET /api/settings/resolved: Herkes (user + admin)
  • Diğer tüm endpoint'ler: Admin PIN gerekli (X-Admin-Pin header)
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.database import get_db
from backend.models.schemas import (
    ResolvedSettingsResponse,
    SettingBulkCreate,
    SettingCreate,
    SettingResponse,
    SettingUpdate,
)
from backend.models.settings import Setting
from backend.services.settings_resolver import SettingsResolver
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Admin PIN doğrulama yardımcısı
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin(x_admin_pin: str | None = Header(default=None)) -> str:
    """
    Admin-only endpoint'ler için PIN doğrulaması.
    X-Admin-Pin header'ı zorunludur ve config'deki admin_pin ile eşleşmelidir.

    Raises:
        HTTPException 401: PIN eksik veya hatalı.
    """
    if not x_admin_pin or x_admin_pin != app_settings.admin_pin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz veya eksik admin PIN'i. X-Admin-Pin header'ını kontrol edin.",
        )
    return x_admin_pin


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/settings/resolved — Çözümlenmiş ayarlar (user + admin erişebilir)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/settings/resolved",
    response_model=ResolvedSettingsResponse,
    summary="Çözümlenmiş ayarları getir",
    description=(
        "5 katmanlı hiyerarşi uygulandıktan sonraki nihai ayar setini döndürür. "
        "Frontend bu endpoint'i kullanarak geçerli ayarları görüntüler."
    ),
)
def get_resolved_settings(
    module_key: str | None = Query(
        default=None,
        description="Modül adı (ör. 'standard_video') — katman 3 filtresi",
    ),
    provider_key: str | None = Query(
        default=None,
        description="Provider adı (ör. 'elevenlabs') — katman 4 filtresi",
    ),
    db: Session = Depends(get_db),
) -> ResolvedSettingsResponse:
    """
    5 katmanı uygulayarak nihai ayar setini döndürür.

    Katmanlar (düşük → yüksek):
    1. Global (config.py)
    2. Admin (SQLite)
    3. Module (SQLite, module_key verilirse)
    4. Provider (SQLite, provider_key verilirse)
    5. User (SQLite)
    """
    resolver = SettingsResolver(db)
    result = resolver.resolve(
        module_key=module_key,
        provider_key=provider_key,
    )

    return ResolvedSettingsResponse(**result.to_response_dict())


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/settings — Belirli scope'un ham ayarları (admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/settings",
    response_model=list[SettingResponse],
    summary="Belirli scope'un ayarlarını listele",
    description="Admin paneli için belirli bir (scope, scope_id) çiftindeki tüm ayarları döndürür.",
)
def list_settings(
    scope: str = Query(
        description="Ayar katmanı: admin, module, provider, user",
    ),
    scope_id: str = Query(
        default="",
        description="Kapsam tanımlayıcısı (modül adı, provider adı veya boş)",
    ),
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[SettingResponse]:
    """
    Belirli bir scope'un tüm ham ayarlarını döndürür.
    Admin panelinde scope bazlı ayar yönetimi için kullanılır.
    """
    resolver = SettingsResolver(db)
    rows = resolver.list_scope(scope=scope, scope_id=scope_id)

    return [SettingResponse.model_validate(row) for row in rows]


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/settings — Yeni ayar oluştur (admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/settings",
    response_model=SettingResponse,
    status_code=201,
    summary="Yeni ayar oluştur veya güncelle",
    description=(
        "Belirtilen (scope, scope_id, key) için yeni bir ayar kaydı oluşturur. "
        "Aynı üçlü zaten varsa değeri günceller (upsert)."
    ),
)
def create_setting(
    payload: SettingCreate,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> SettingResponse:
    """
    Yeni ayar oluşturur veya mevcudu günceller (upsert mantığı).
    Admin PIN gereklidir.
    """
    resolver = SettingsResolver(db)
    setting = resolver.upsert(
        scope=payload.scope,
        scope_id=payload.scope_id,
        key=payload.key,
        value=payload.value,
        locked=payload.locked,
        description=payload.description,
    )
    db.commit()
    db.refresh(setting)

    return SettingResponse.model_validate(setting)


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/settings/bulk — Toplu ayar oluştur/güncelle (admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/settings/bulk",
    response_model=list[SettingResponse],
    status_code=201,
    summary="Toplu ayar oluştur/güncelle",
    description="Birden fazla ayarı tek seferde oluşturur veya günceller.",
)
def bulk_create_settings(
    payload: SettingBulkCreate,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[SettingResponse]:
    """
    Toplu ayar oluşturma/güncelleme.
    Admin panelindeki "Tümünü Kaydet" işlevi bu endpoint'i kullanır.
    """
    resolver = SettingsResolver(db)
    items = [
        {
            "scope": s.scope,
            "scope_id": s.scope_id,
            "key": s.key,
            "value": s.value,
            "locked": s.locked,
            "description": s.description,
        }
        for s in payload.settings
    ]
    results = resolver.bulk_upsert(items)
    db.commit()

    # Refresh all to get updated timestamps
    for setting in results:
        db.refresh(setting)

    return [SettingResponse.model_validate(s) for s in results]


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/settings/{setting_id} — Ayar güncelle (admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.put(
    "/settings/{setting_id}",
    response_model=SettingResponse,
    summary="Mevcut ayarı güncelle",
    description="ID ile belirtilen ayar kaydının değerini, kilit durumunu ve açıklamasını günceller.",
)
def update_setting(
    setting_id: int,
    payload: SettingUpdate,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> SettingResponse:
    """
    Mevcut ayar kaydını ID ile günceller.

    404 döner: Ayar bulunamazsa.
    """
    setting = db.query(Setting).filter(Setting.id == setting_id).first()
    if not setting:
        raise HTTPException(
            status_code=404,
            detail=f"Ayar bulunamadı: id={setting_id}",
        )

    # Değer güncelleme (JSON encode)
    setting.value = json.dumps(payload.value, ensure_ascii=False)

    if payload.locked is not None:
        setting.locked = payload.locked
    if payload.description is not None:
        setting.description = payload.description

    db.commit()
    db.refresh(setting)

    log.info(
        "Ayar güncellendi",
        setting_id=setting_id,
        scope=setting.scope,
        key=setting.key,
    )

    return SettingResponse.model_validate(setting)


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/settings/{setting_id} — Ayar sil (admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/settings/{setting_id}",
    status_code=204,
    summary="Ayar sil",
    description="ID ile belirtilen ayar kaydını kalıcı olarak siler.",
)
def delete_setting(
    setting_id: int,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> None:
    """
    Ayar kaydını siler.

    404 döner: Ayar bulunamazsa.
    """
    setting = db.query(Setting).filter(Setting.id == setting_id).first()
    if not setting:
        raise HTTPException(
            status_code=404,
            detail=f"Ayar bulunamadı: id={setting_id}",
        )

    scope_info = f"{setting.scope}:{setting.scope_id}" if setting.scope_id else setting.scope
    key = setting.key

    db.delete(setting)
    db.commit()

    log.info(
        "Ayar silindi",
        setting_id=setting_id,
        scope=scope_info,
        key=key,
    )
