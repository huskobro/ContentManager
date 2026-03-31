"""
Publishing Hub API Testleri — /api/jobs/{id}/publish-targets ve ilgili endpoint'ler.

Kapsanan senaryolar:
  1.  GET /api/jobs/{id}/publish-targets → boş liste (hedef yok)
  2.  GET /api/jobs/{id}/publish-targets → hedefler döner
  3.  GET /api/publish-targets/{id}/history → girişim geçmişi döner
  4.  GET /api/publish-targets/{id}/history → 404 (hedef yok)
  5.  POST /api/publish-targets/{id}/retry → 404 (hedef yok)
  6.  POST /api/publish-targets/{id}/retry → 409 (zaten published, force=False)
  7.  POST /api/publish-targets/{id}/retry → 409 (şu an publishing)
  8.  POST /api/publish-targets/{id}/retry → 202 (failed → retry başlatıldı)
  9.  POST /api/publish-targets/{id}/retry → 202 force=True (published → force retry)
  10. GET /api/jobs/{id}/publish-targets → birden fazla platform hedefi

Çalıştırma:
    python3 -m pytest backend/tests/test_publish_targets_api.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models.job import Job
from backend.models.publish_target import JobPublishTarget, PublishAttempt


# ─── Test DB + Client kurulumu ────────────────────────────────────────────────


@pytest.fixture()
def db():
    """In-memory SQLite test DB — tüm tablolar oluşturulur."""
    from backend.models import settings as _s  # noqa: F401
    from backend.models import category as _c, hook as _h  # noqa: F401
    from backend.models import news_source as _ns, category_style_mapping as _csm  # noqa: F401
    from backend.models import youtube_channel as _yc  # noqa: F401
    from backend.models import platform_account as _pa  # noqa: F401
    from backend.models import publish_target as _pt  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    """FastAPI test client — DB override edilmiş."""
    from backend.main import app

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def job(db):
    """Test job'u."""
    j = Job(
        id="apitest-job-0000-0000-000000000001",
        module_key="standard_video",
        title="API Test Job",
        status="completed",
        language="tr",
    )
    db.add(j)
    db.commit()
    return j


@pytest.fixture()
def target(db, job):
    """Test yayın hedefi."""
    t = JobPublishTarget(
        job_id=job.id,
        platform="youtube",
        status="failed",
        privacy_status="private",
        error_message="YT_QUOTA_EXCEEDED",
        attempts_count=1,
    )
    db.add(t)
    db.commit()
    return t


@pytest.fixture()
def published_target(db, job):
    """Zaten yayınlanmış test hedefi."""
    t = JobPublishTarget(
        job_id=job.id,
        platform="youtube",
        status="published",
        privacy_status="public",
        external_object_id="abc123",
        external_url="https://www.youtube.com/watch?v=abc123",
        attempts_count=1,
    )
    db.add(t)
    db.commit()
    return t


@pytest.fixture()
def publishing_target(db, job):
    """Şu an yayınlanıyor durumundaki hedef."""
    t = JobPublishTarget(
        job_id=job.id,
        platform="youtube",
        status="publishing",
        privacy_status="private",
        attempts_count=1,
    )
    db.add(t)
    db.commit()
    return t


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_list_targets_empty(client, job):
    """Hedef yoksa boş liste döner."""
    resp = client.get(f"/api/jobs/{job.id}/publish-targets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == job.id
    assert data["targets"] == []
    assert data["total"] == 0


def test_list_targets_with_target(client, job, target):
    """Hedef varsa listede görünür."""
    resp = client.get(f"/api/jobs/{job.id}/publish-targets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    t = data["targets"][0]
    assert t["platform"] == "youtube"
    assert t["status"] == "failed"
    assert t["error_message"] == "YT_QUOTA_EXCEEDED"


def test_list_targets_includes_attempts(client, job, target, db):
    """Hedef kendi girişim geçmişini içerir."""
    attempt = PublishAttempt(
        publish_target_id=target.id,
        status="failed",
        action_type="publish",
        error_message="quota exceeded",
    )
    db.add(attempt)
    db.commit()

    resp = client.get(f"/api/jobs/{job.id}/publish-targets")
    assert resp.status_code == 200
    t = resp.json()["targets"][0]
    assert len(t["attempts"]) == 1
    assert t["attempts"][0]["status"] == "failed"


def test_get_history_returns_attempts(client, target, db):
    """Girişim geçmişi endpoint'i kronolojik sırayla döner."""
    for i in range(3):
        attempt = PublishAttempt(
            publish_target_id=target.id,
            status="failed" if i < 2 else "success",
            action_type="retry" if i > 0 else "publish",
        )
        db.add(attempt)
    db.commit()

    resp = client.get(f"/api/publish-targets/{target.id}/history")
    assert resp.status_code == 200
    attempts = resp.json()
    assert len(attempts) == 3
    assert attempts[2]["status"] == "success"


def test_get_history_404_unknown_target(client):
    """Bilinmeyen hedef ID'si → 404."""
    resp = client.get("/api/publish-targets/nonexistent-id-xxxxx/history")
    assert resp.status_code == 404


def test_retry_404_unknown_target(client):
    """Bilinmeyen hedef → 404."""
    resp = client.post("/api/publish-targets/nonexistent-id/retry", json={})
    assert resp.status_code == 404


def test_retry_409_already_published_no_force(client, published_target):
    """Published + force=False → 409 Conflict."""
    resp = client.post(
        f"/api/publish-targets/{published_target.id}/retry",
        json={"force": False},
    )
    assert resp.status_code == 409
    assert "force" in resp.json()["detail"].lower()


def test_retry_409_currently_publishing(client, publishing_target):
    """Status=publishing → 409 Conflict."""
    resp = client.post(
        f"/api/publish-targets/{publishing_target.id}/retry",
        json={},
    )
    assert resp.status_code == 409
    assert "yayınlanıyor" in resp.json()["detail"].lower()


def test_retry_422_video_not_found(client, target):
    """Video dosyası yoksa 422."""
    resp = client.post(
        f"/api/publish-targets/{target.id}/retry",
        json={},
    )
    assert resp.status_code == 422
    assert "video" in resp.json()["detail"].lower()


def test_retry_202_success(client, target, db, tmp_path):
    """Video dosyası varsa 202 Accepted — status pending'e döner."""
    # Job.session_dir oluştur ve video dosyası koy
    session_dir = tmp_path / "apitest-job-0000-0000-000000000001"
    comp_dir = session_dir / "composition"
    comp_dir.mkdir(parents=True)
    video = comp_dir / "final.mp4"
    video.write_bytes(b"\x00" * 100)

    from backend.models.job import Job as _Job
    job_row = db.query(_Job).filter_by(id=target.job_id).first()
    job_row.session_dir = str(session_dir)
    db.commit()

    with patch(
        "backend.api.publish_targets._run_retry",
        new=AsyncMock(),
    ):
        resp = client.post(
            f"/api/publish-targets/{target.id}/retry",
            json={},
        )

    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"


def test_retry_202_force_published(client, published_target, db, tmp_path):
    """force=True ile published target → 202 Accepted."""
    session_dir = tmp_path / "apitest-job-0000-0000-000000000001"
    comp_dir = session_dir / "composition"
    comp_dir.mkdir(parents=True)
    video = comp_dir / "final.mp4"
    video.write_bytes(b"\x00" * 100)

    from backend.models.job import Job as _Job
    job_row = db.query(_Job).filter_by(id=published_target.job_id).first()
    job_row.session_dir = str(session_dir)
    db.commit()

    with patch(
        "backend.api.publish_targets._run_retry",
        new=AsyncMock(),
    ):
        resp = client.post(
            f"/api/publish-targets/{published_target.id}/retry",
            json={"force": True},
        )

    assert resp.status_code == 202


def test_list_targets_multiple_platforms(client, job, db):
    """Farklı platformlar için birden fazla hedef döner."""
    for platform in ("youtube", "tiktok", "instagram"):
        t = JobPublishTarget(
            job_id=job.id,
            platform=platform,
            status="pending",
            privacy_status="private",
        )
        db.add(t)
    db.commit()

    resp = client.get(f"/api/jobs/{job.id}/publish-targets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    platforms = {t["platform"] for t in data["targets"]}
    assert platforms == {"youtube", "tiktok", "instagram"}
