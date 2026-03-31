"""
Admin API — Admin yönetim endpoint'leri.

Endpoint'ler:
  GET    /api/admin/directories              → Verilen dizindeki alt klasörleri listele
  GET    /api/admin/costs                    → Job maliyet özeti
  GET    /api/admin/stats                    → Genel sistem istatistikleri

  Kategori CRUD (categories tablosu):
  GET    /api/admin/categories               → Tüm kategoriler (builtin + custom)
  POST   /api/admin/categories               → Yeni custom kategori oluştur
  PUT    /api/admin/categories/{key}         → Kategori güncelle (builtin + custom)
  DELETE /api/admin/categories/{key}         → Custom kategori sil (builtin → 403)

  Hook CRUD (hooks tablosu):
  GET    /api/admin/hooks/{lang}             → Tüm hook'lar (tr/en, disabled dahil)
  POST   /api/admin/hooks                    → Yeni custom hook oluştur
  PUT    /api/admin/hooks/{type}/{lang}      → Hook güncelle (builtin + custom)
  DELETE /api/admin/hooks/{type}/{lang}      → Custom hook sil (builtin → 403)

Yetkilendirme:
  • Tüm endpoint'ler Admin PIN gerektirir (X-Admin-Pin header).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.database import get_db
from backend.models.job import Job, JobStep
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Admin PIN doğrulama yardımcısı
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin(x_admin_pin: str | None = Header(default=None)) -> str:
    """Admin-only endpoint'ler için PIN doğrulaması."""
    if not x_admin_pin or x_admin_pin != app_settings.admin_pin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz veya eksik admin PIN'i. X-Admin-Pin header'ını kontrol edin.",
        )
    return x_admin_pin


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/admin/directories — Klasör listesi (klasör seçici için)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/admin/directories",
    summary="Dizin içeriğini listele",
    description=(
        "Verilen path'teki alt klasörleri listeler. "
        "Klasör seçici UI bileşeni tarafından kullanılır. "
        "Admin PIN gereklidir."
    ),
    response_model=dict[str, Any],
)
def list_directories(
    path: str = Query(
        default="",
        description="Listelenecek dizin yolu. Boş bırakılırsa proje kök dizini kullanılır.",
    ),
    _pin: str = Depends(_require_admin),
) -> dict[str, Any]:
    """
    Verilen dizindeki alt klasörleri listeler.

    - Gizli klasörler (. ile başlayan) hariç tutulur.
    - PermissionError güvenli şekilde yakalanır.
    - Hem alt klasörler hem de üst dizin (parent) bilgisi döner.
    """
    # Path belirleme: boşsa proje kökü
    if not path or not path.strip():
        base_path = Path.home()
    else:
        base_path = Path(path.strip())

    # Güvenlik: gerçek path al (symlink vs traversal)
    try:
        resolved = base_path.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail=f"Geçersiz yol: {path}")

    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"Dizin bulunamadı: {resolved}")

    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail=f"Belirtilen yol bir klasör değil: {resolved}")

    # Alt dizinleri listele
    subdirs: list[dict[str, str]] = []
    try:
        entries = sorted(resolved.iterdir(), key=lambda p: p.name.lower())
        for entry in entries:
            # Sadece dizinler, gizli olanlar hariç
            if entry.is_dir() and not entry.name.startswith("."):
                subdirs.append({
                    "name": entry.name,
                    "path": str(entry),
                })
    except PermissionError:
        log.warning("Dizin listeleme izni reddedildi", path=str(resolved))
        # İzin yoksa boş liste dön, hata fırlatma
        subdirs = []

    # Üst dizin bilgisi (root'ta parent = kendisi)
    parent_path = str(resolved.parent) if resolved != resolved.parent else str(resolved)

    return {
        "current_path": str(resolved),
        "parent_path": parent_path,
        "is_root": resolved == resolved.parent,
        "subdirectories": subdirs,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/admin/costs — Maliyet özeti
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/admin/costs",
    summary="Maliyet özeti",
    description=(
        "Job'lardan toplanan maliyet verilerini döndürür. "
        "Provider bazlı toplam harcama ve son 10 job'ın maliyeti listelenir."
    ),
    response_model=dict[str, Any],
)
def get_cost_summary(
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict[str, Any]:
    """
    Gerçek maliyet verilerini DB'den toplar.

    - job_steps tablosundan provider bazlı cost_estimate_usd SUM
    - Son 10 tamamlanmış job'ın maliyeti
    - Genel özet (toplam harcama, toplam job sayısı)
    """
    # Provider bazlı toplam maliyet (step bazında)
    provider_costs_raw = (
        db.query(
            JobStep.provider,
            func.sum(JobStep.cost_estimate_usd).label("total_cost"),
            func.count(JobStep.id).label("call_count"),
        )
        .filter(JobStep.provider.isnot(None))
        .filter(JobStep.cost_estimate_usd.isnot(None))
        .group_by(JobStep.provider)
        .all()
    )

    provider_costs = [
        {
            "provider": row.provider or "unknown",
            "total_cost_usd": round(float(row.total_cost or 0.0), 6),
            "call_count": int(row.call_count or 0),
        }
        for row in provider_costs_raw
    ]

    # Genel toplam
    total_cost = sum(p["total_cost_usd"] for p in provider_costs)
    total_calls = sum(p["call_count"] for p in provider_costs)

    # Son 10 tamamlanmış job (maliyet bilgisiyle)
    recent_jobs_raw = (
        db.query(Job)
        .filter(Job.status == "completed")
        .order_by(Job.completed_at.desc())
        .limit(10)
        .all()
    )

    recent_jobs = [
        {
            "job_id": job.id[:8],
            "title": job.title,
            "module_key": job.module_key,
            "cost_estimate_usd": round(float(job.cost_estimate_usd or 0.0), 6),
            "completed_at": job.completed_at,
        }
        for job in recent_jobs_raw
    ]

    return {
        "summary": {
            "total_cost_usd": round(total_cost, 6),
            "total_api_calls": total_calls,
            "providers_used": len(provider_costs),
        },
        "by_provider": provider_costs,
        "recent_jobs": recent_jobs,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/admin/stats — Sistem istatistikleri
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/admin/stats",
    summary="Sistem istatistikleri",
    description="Job sayıları, disk kullanımı ve sistem durumu özeti.",
    response_model=dict[str, Any],
)
def get_admin_stats(
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict[str, Any]:
    """
    Admin dashboard için genel sistem istatistiklerini döndürür.
    """
    # Job durum dağılımı
    status_rows = (
        db.query(Job.status, func.count(Job.id))
        .group_by(Job.status)
        .all()
    )

    job_stats: dict[str, int] = {
        "total": 0,
        "queued": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    for status, count in status_rows:
        job_stats[status] = count
        job_stats["total"] += count

    # Output dizini disk bilgisi
    output_dir_info: dict[str, Any] = {
        "path": str(app_settings.output_dir),
        "exists": app_settings.output_dir.exists(),
        "file_count": 0,
        "total_size_mb": 0.0,
    }
    try:
        if app_settings.output_dir.exists():
            mp4_files = list(app_settings.output_dir.glob("*.mp4"))
            output_dir_info["file_count"] = len(mp4_files)
            total_bytes = sum(f.stat().st_size for f in mp4_files if f.is_file())
            output_dir_info["total_size_mb"] = round(total_bytes / (1024 * 1024), 2)
    except Exception:
        pass

    return {
        "jobs": job_stats,
        "output_dir": output_dir_info,
        "max_concurrent_jobs": app_settings.max_concurrent_jobs,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Kategori Yönetimi — Tam CRUD
# ─────────────────────────────────────────────────────────────────────────────

class CategoryCreateRequest(BaseModel):
    key: str
    name_tr: str
    name_en: str
    tone: str = ""
    focus: str = ""
    style_instruction: str = ""
    enabled: bool = True
    sort_order: int = 0


class CategoryUpdateRequest(BaseModel):
    name_tr: str | None = None
    name_en: str | None = None
    tone: str | None = None
    focus: str | None = None
    style_instruction: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None


@router.get(
    "/admin/categories",
    summary="Kategori listesi",
    description="Tüm kategorileri DB'den döndürür (builtin + custom, sıralı).",
    response_model=list[dict],
)
def list_categories(
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[dict]:
    from backend.pipeline.steps.script import get_all_categories_detail
    return get_all_categories_detail(db=db)


@router.post(
    "/admin/categories",
    summary="Yeni kategori oluştur",
    description="Yeni custom kategori oluşturur. key benzersiz olmalıdır; builtin key çakışması 409 döner.",
    response_model=dict,
    status_code=201,
)
def create_category(
    body: CategoryCreateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category import Category
    from datetime import datetime, timezone

    # Key format kontrolü: sadece küçük harf, rakam, underscore
    import re
    if not re.match(r'^[a-z0-9_]{1,64}$', body.key):
        raise HTTPException(
            status_code=422,
            detail="key yalnızca küçük harf, rakam ve alt çizgi içerebilir (maks 64 karakter).",
        )

    existing = db.query(Category).filter(Category.key == body.key).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Bu key zaten mevcut: {body.key}. Düzenlemek için PUT /admin/categories/{body.key} kullanın.",
        )

    now = datetime.now(timezone.utc).isoformat()
    cat = Category(
        key=body.key,
        name_tr=body.name_tr,
        name_en=body.name_en,
        tone=body.tone,
        focus=body.focus,
        style_instruction=body.style_instruction,
        enabled=body.enabled,
        is_builtin=False,
        sort_order=body.sort_order,
        created_at=now,
        updated_at=now,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {**cat.to_dict(), "status": "created"}


@router.put(
    "/admin/categories/{category_key}",
    summary="Kategori güncelle",
    description="Belirtilen kategorinin alanlarını günceller. Hem builtin hem custom kategoriler güncellenebilir.",
    response_model=dict,
)
def update_category(
    category_key: str,
    body: CategoryUpdateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category import Category
    from datetime import datetime, timezone

    cat = db.query(Category).filter(Category.key == category_key).first()
    if not cat:
        raise HTTPException(status_code=404, detail=f"Kategori bulunamadı: {category_key}")

    now = datetime.now(timezone.utc).isoformat()
    if body.name_tr is not None:
        cat.name_tr = body.name_tr
    if body.name_en is not None:
        cat.name_en = body.name_en
    if body.tone is not None:
        cat.tone = body.tone
    if body.focus is not None:
        cat.focus = body.focus
    if body.style_instruction is not None:
        cat.style_instruction = body.style_instruction
    if body.enabled is not None:
        cat.enabled = body.enabled
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    cat.updated_at = now

    db.commit()
    db.refresh(cat)
    return {**cat.to_dict(), "status": "updated"}


@router.delete(
    "/admin/categories/{category_key}",
    summary="Kategori sil",
    description="Yalnızca custom kategoriler silinebilir (is_builtin=False). Builtin kategoriler için 403 döner.",
    response_model=dict,
)
def delete_category(
    category_key: str,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category import Category

    cat = db.query(Category).filter(Category.key == category_key).first()
    if not cat:
        raise HTTPException(status_code=404, detail=f"Kategori bulunamadı: {category_key}")
    if cat.is_builtin:
        raise HTTPException(
            status_code=403,
            detail=f"Builtin kategori silinemez: {category_key}. Devre dışı bırakmak için enabled=false ile PUT kullanın.",
        )
    db.delete(cat)
    db.commit()
    return {"status": "deleted", "key": category_key}


# ─────────────────────────────────────────────────────────────────────────────
# Hook Yönetimi — Tam CRUD
# ─────────────────────────────────────────────────────────────────────────────

class HookCreateRequest(BaseModel):
    type: str
    lang: str
    name: str
    template: str
    enabled: bool = True
    sort_order: int = 0


class HookUpdateRequest(BaseModel):
    name: str | None = None
    template: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None


@router.get(
    "/admin/hooks/{lang}",
    summary="Hook listesi",
    description="Belirtilen dildeki tüm hook'ları DB'den döndürür (disabled dahil).",
    response_model=list[dict],
)
def list_hooks(
    lang: str,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[dict]:
    if lang not in ("tr", "en"):
        raise HTTPException(status_code=400, detail="Geçerli dil: 'tr' veya 'en'")
    from backend.pipeline.steps.script import get_available_hooks
    return get_available_hooks(lang, db=db)


@router.post(
    "/admin/hooks",
    summary="Yeni hook oluştur",
    description="Yeni custom hook oluşturur. (type, lang) çifti benzersiz olmalıdır.",
    response_model=dict,
    status_code=201,
)
def create_hook(
    body: HookCreateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.hook import Hook
    from datetime import datetime, timezone
    import re

    if body.lang not in ("tr", "en"):
        raise HTTPException(status_code=400, detail="Geçerli dil: 'tr' veya 'en'")
    if not re.match(r'^[a-z0-9_]{1,64}$', body.type):
        raise HTTPException(status_code=422, detail="type yalnızca küçük harf, rakam ve alt çizgi içerebilir.")

    existing = db.query(Hook).filter(Hook.type == body.type, Hook.lang == body.lang).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Bu (type, lang) çifti zaten mevcut: {body.type}/{body.lang}. Güncellemek için PUT kullanın.",
        )

    now = datetime.now(timezone.utc).isoformat()
    hook = Hook(
        type=body.type,
        lang=body.lang,
        name=body.name,
        template=body.template,
        enabled=body.enabled,
        is_builtin=False,
        sort_order=body.sort_order,
        created_at=now,
        updated_at=now,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {**hook.to_dict(), "status": "created"}


@router.put(
    "/admin/hooks/{hook_type}/{lang}",
    summary="Hook güncelle",
    description="Belirtilen hook'un alanlarını günceller. Hem builtin hem custom hook'lar güncellenebilir.",
    response_model=dict,
)
def update_hook(
    hook_type: str,
    lang: str,
    body: HookUpdateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.hook import Hook
    from datetime import datetime, timezone

    if lang not in ("tr", "en"):
        raise HTTPException(status_code=400, detail="Geçerli dil: 'tr' veya 'en'")

    hook = db.query(Hook).filter(Hook.type == hook_type, Hook.lang == lang).first()
    if not hook:
        raise HTTPException(status_code=404, detail=f"Hook bulunamadı: {hook_type}/{lang}")

    now = datetime.now(timezone.utc).isoformat()
    if body.name is not None:
        hook.name = body.name
    if body.template is not None:
        hook.template = body.template
    if body.enabled is not None:
        hook.enabled = body.enabled
    if body.sort_order is not None:
        hook.sort_order = body.sort_order
    hook.updated_at = now

    db.commit()
    db.refresh(hook)
    return {**hook.to_dict(), "status": "updated"}


@router.delete(
    "/admin/hooks/{hook_type}/{lang}",
    summary="Hook sil",
    description="Yalnızca custom hook'lar silinebilir (is_builtin=False). Builtin hook'lar için 403 döner.",
    response_model=dict,
)
def delete_hook(
    hook_type: str,
    lang: str,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.hook import Hook

    if lang not in ("tr", "en"):
        raise HTTPException(status_code=400, detail="Geçerli dil: 'tr' veya 'en'")

    hook = db.query(Hook).filter(Hook.type == hook_type, Hook.lang == lang).first()
    if not hook:
        raise HTTPException(status_code=404, detail=f"Hook bulunamadı: {hook_type}/{lang}")
    if hook.is_builtin:
        raise HTTPException(
            status_code=403,
            detail=f"Builtin hook silinemez: {hook_type}/{lang}. Devre dışı bırakmak için enabled=false ile PUT kullanın.",
        )
    db.delete(hook)
    db.commit()
    return {"status": "deleted", "type": hook_type, "lang": lang}


# ─────────────────────────────────────────────────────────────────────────────
# Haber Kaynakları Yönetimi — Tam CRUD
# ─────────────────────────────────────────────────────────────────────────────

class NewsSourceCreateRequest(BaseModel):
    name: str
    url: str
    category_key: str = ""
    lang: str = "tr"
    enabled: bool = True
    sort_order: int = 0


class NewsSourceUpdateRequest(BaseModel):
    name: str | None = None
    url: str | None = None
    category_key: str | None = None
    lang: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None


@router.get(
    "/admin/news-sources",
    summary="Haber kaynakları listesi",
    description=(
        "Tüm haber/RSS kaynaklarını döndürür (aktif + pasif, sort_order sırasıyla). "
        "Admin PIN gereklidir."
    ),
    response_model=list[dict],
)
def list_news_sources(
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[dict]:
    from backend.models.news_source import NewsSource
    sources = db.query(NewsSource).order_by(NewsSource.sort_order, NewsSource.id).all()
    return [s.to_dict() for s in sources]


@router.post(
    "/admin/news-sources",
    summary="Yeni haber kaynağı ekle",
    description="Yeni haber/RSS kaynağı oluşturur. URL benzersiz olmalıdır; çakışma 409 döner.",
    response_model=dict,
    status_code=201,
)
def create_news_source(
    body: NewsSourceCreateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.news_source import NewsSource
    from datetime import datetime, timezone

    # URL format kontrolü
    if not body.url.strip().startswith(("http://", "https://")):
        raise HTTPException(
            status_code=422,
            detail="URL 'http://' veya 'https://' ile başlamalıdır.",
        )

    existing = db.query(NewsSource).filter(NewsSource.url == body.url.strip()).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Bu URL zaten kayıtlı: {body.url}. Güncellemek için PUT kullanın.",
        )

    now = datetime.now(timezone.utc).isoformat()
    source = NewsSource(
        name=body.name.strip(),
        url=body.url.strip(),
        category_key=body.category_key.strip(),
        lang=body.lang.strip() or "tr",
        enabled=body.enabled,
        sort_order=body.sort_order,
        created_at=now,
        updated_at=now,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return {**source.to_dict(), "status": "created"}


@router.put(
    "/admin/news-sources/{source_id}",
    summary="Haber kaynağı güncelle",
    description="Belirtilen kaynağın alanlarını günceller.",
    response_model=dict,
)
def update_news_source(
    source_id: int,
    body: NewsSourceUpdateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.news_source import NewsSource
    from datetime import datetime, timezone

    source = db.query(NewsSource).filter(NewsSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail=f"Kaynak bulunamadı: id={source_id}")

    now = datetime.now(timezone.utc).isoformat()
    if body.name is not None:
        source.name = body.name.strip()
    if body.url is not None:
        url = body.url.strip()
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="URL 'http://' veya 'https://' ile başlamalıdır.")
        # URL değişiyorsa çakışma kontrolü
        if url != source.url:
            existing = db.query(NewsSource).filter(NewsSource.url == url).first()
            if existing:
                raise HTTPException(status_code=409, detail=f"Bu URL zaten kayıtlı: {url}")
        source.url = url
    if body.category_key is not None:
        source.category_key = body.category_key.strip()
    if body.lang is not None:
        source.lang = body.lang.strip() or "tr"
    if body.enabled is not None:
        source.enabled = body.enabled
    if body.sort_order is not None:
        source.sort_order = body.sort_order
    source.updated_at = now

    db.commit()
    db.refresh(source)
    return {**source.to_dict(), "status": "updated"}


@router.delete(
    "/admin/news-sources/{source_id}",
    summary="Haber kaynağı sil",
    description="Belirtilen haber kaynağını siler.",
    response_model=dict,
)
def delete_news_source(
    source_id: int,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.news_source import NewsSource

    source = db.query(NewsSource).filter(NewsSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail=f"Kaynak bulunamadı: id={source_id}")
    db.delete(source)
    db.commit()
    return {"status": "deleted", "id": source_id}


# ─────────────────────────────────────────────────────────────────────────────
# Kategori→Stil Eşleşme Yönetimi — Tam CRUD
# ─────────────────────────────────────────────────────────────────────────────

class CategoryStyleMappingCreateRequest(BaseModel):
    category_key: str
    bulletin_style: str
    description: str = ""
    enabled: bool = True


class CategoryStyleMappingUpdateRequest(BaseModel):
    bulletin_style: str | None = None
    description: str | None = None
    enabled: bool | None = None


@router.get(
    "/admin/category-style-mappings",
    summary="Kategori→stil eşleşmeleri listesi",
    description=(
        "Tüm kategori→BulletinStyle eşleşmelerini döndürür. "
        "Admin PIN gereklidir."
    ),
    response_model=list[dict],
)
def list_category_style_mappings(
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> list[dict]:
    from backend.models.category_style_mapping import CategoryStyleMapping
    mappings = db.query(CategoryStyleMapping).order_by(CategoryStyleMapping.category_key).all()
    return [m.to_dict() for m in mappings]


@router.post(
    "/admin/category-style-mappings",
    summary="Yeni kategori→stil eşleşmesi ekle",
    description="Yeni kategori→BulletinStyle eşleşmesi oluşturur. category_key benzersiz olmalıdır.",
    response_model=dict,
    status_code=201,
)
def create_category_style_mapping(
    body: CategoryStyleMappingCreateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category_style_mapping import CategoryStyleMapping, VALID_BULLETIN_STYLES
    from datetime import datetime, timezone

    cat_key = body.category_key.strip().lower()
    if not cat_key:
        raise HTTPException(status_code=422, detail="category_key boş olamaz.")

    if body.bulletin_style not in VALID_BULLETIN_STYLES:
        raise HTTPException(
            status_code=422,
            detail=f"Geçersiz bulletin_style: {body.bulletin_style}. Geçerli değerler: {sorted(VALID_BULLETIN_STYLES)}",
        )

    existing = db.query(CategoryStyleMapping).filter(CategoryStyleMapping.category_key == cat_key).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Bu category_key zaten eşleştirilmiş: {cat_key}. Güncellemek için PUT kullanın.",
        )

    now = datetime.now(timezone.utc).isoformat()
    mapping = CategoryStyleMapping(
        category_key=cat_key,
        bulletin_style=body.bulletin_style,
        description=body.description.strip(),
        enabled=body.enabled,
        created_at=now,
        updated_at=now,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return {**mapping.to_dict(), "status": "created"}


@router.put(
    "/admin/category-style-mappings/{mapping_id}",
    summary="Kategori→stil eşleşmesi güncelle",
    description="Belirtilen eşleşmenin alanlarını günceller.",
    response_model=dict,
)
def update_category_style_mapping(
    mapping_id: int,
    body: CategoryStyleMappingUpdateRequest,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category_style_mapping import CategoryStyleMapping, VALID_BULLETIN_STYLES
    from datetime import datetime, timezone

    mapping = db.query(CategoryStyleMapping).filter(CategoryStyleMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail=f"Eşleşme bulunamadı: id={mapping_id}")

    now = datetime.now(timezone.utc).isoformat()
    if body.bulletin_style is not None:
        if body.bulletin_style not in VALID_BULLETIN_STYLES:
            raise HTTPException(
                status_code=422,
                detail=f"Geçersiz bulletin_style: {body.bulletin_style}",
            )
        mapping.bulletin_style = body.bulletin_style
    if body.description is not None:
        mapping.description = body.description.strip()
    if body.enabled is not None:
        mapping.enabled = body.enabled
    mapping.updated_at = now

    db.commit()
    db.refresh(mapping)
    return {**mapping.to_dict(), "status": "updated"}


@router.delete(
    "/admin/category-style-mappings/{mapping_id}",
    summary="Kategori→stil eşleşmesi sil",
    description="Belirtilen eşleşmeyi siler.",
    response_model=dict,
)
def delete_category_style_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    _pin: str = Depends(_require_admin),
) -> dict:
    from backend.models.category_style_mapping import CategoryStyleMapping

    mapping = db.query(CategoryStyleMapping).filter(CategoryStyleMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail=f"Eşleşme bulunamadı: id={mapping_id}")
    db.delete(mapping)
    db.commit()
    return {"status": "deleted", "id": mapping_id}
