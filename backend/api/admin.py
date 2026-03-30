"""
Admin API — Admin yönetim endpoint'leri.

Endpoint'ler:
  GET  /api/admin/directories   → Verilen dizindeki alt klasörleri listele (klasör seçici için)
  GET  /api/admin/costs         → Job maliyet özeti (provider bazlı toplam + son job'lar)
  GET  /api/admin/stats         → Genel sistem istatistikleri

Yetkilendirme:
  • Tüm endpoint'ler Admin PIN gerektirir (X-Admin-Pin header).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
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
