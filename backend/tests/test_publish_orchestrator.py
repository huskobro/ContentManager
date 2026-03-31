"""
PublishOrchestrator Testleri.

Kapsanan senaryolar:
  1.  Başarılı publish → PublishAttempt.status=success, target.status=published
  2.  Başarılı publish → target.external_object_id ve external_url güncellenir
  3.  Başarılı YouTube publish → Job.youtube_* compat alanları güncellenir
  4.  PublishError → target.status=failed, attempt.status=failed
  5.  PublishError → Job.youtube_upload_status=failed + error_code
  6.  Adapter yoksa (platform kayıtlı değil) → attempt.status=failed, target.status=failed
  7.  Her publish_job çağrısı yeni PublishAttempt kaydı oluşturur
  8.  _build_external_url: youtube → doğru URL formatı

Çalıştırma:
    python3 -m pytest backend/tests/test_publish_orchestrator.py -v
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models.job import Job
from backend.models.platform_account import PlatformAccount
from backend.models.publish_target import JobPublishTarget, PublishAttempt
from backend.publishing.adapters.base import PublishError
from backend.publishing.orchestrator import PublishOrchestrator, _build_external_url


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def db():
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
def job_id():
    return "orch-test-job-0000-0000-000000000001"


@pytest.fixture()
def job(db, job_id):
    j = Job(
        id=job_id,
        module_key="standard_video",
        title="Orchestrator Test",
        status="completed",
        language="tr",
    )
    db.add(j)
    db.commit()
    return j


@pytest.fixture()
def account(db):
    acc = PlatformAccount(
        platform="youtube",
        account_name="Test Kanal",
        external_account_id="UC_orch",
        credentials_json=json.dumps({
            "access_token": "tok",
            "refresh_token": "ref",
            "token_expiry": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        }),
        is_active=True,
        is_default=True,
    )
    db.add(acc)
    db.commit()
    return acc


@pytest.fixture()
def pending_target(db, job, account):
    t = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
        privacy_status="private",
    )
    db.add(t)
    db.flush()
    return t


def _noop_progress(phase, percent=None):
    return AsyncMock()()


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_orchestrator_success_updates_target(db, job_id, job, account, pending_target):
    """Başarılı publish → target.status=published, external_object_id set."""
    orch = PublishOrchestrator(db)
    mock_video_id = "abcXYZ123"

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        new=AsyncMock(return_value=mock_video_id),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            run(orch.publish_job(
                job_id=job_id,
                target=pending_target,
                video_path="/fake/video.mp4",
                metadata={"title": "Test", "tags": [], "description": "", "category_id": "22"},
                progress_callback=AsyncMock(),
            ))

    db.expire_all()
    t = db.query(JobPublishTarget).filter_by(id=pending_target.id).first()
    assert t.status == "published"
    assert t.external_object_id == mock_video_id
    assert t.external_url == f"https://www.youtube.com/watch?v={mock_video_id}"


def test_orchestrator_success_creates_attempt(db, job_id, job, account, pending_target):
    """Başarılı publish → PublishAttempt.status=success kaydı oluşur."""
    orch = PublishOrchestrator(db)

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        new=AsyncMock(return_value="vid1"),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            attempt = run(orch.publish_job(
                job_id=job_id,
                target=pending_target,
                video_path="/fake/video.mp4",
                metadata={"title": "T", "tags": [], "description": "", "category_id": "22"},
                progress_callback=AsyncMock(),
            ))

    assert attempt.status == "success"
    assert attempt.finished_at is not None


def test_orchestrator_mirrors_youtube_compat_fields(db, job_id, job, account, pending_target):
    """YouTube publish → Job.youtube_* compat alanları güncellenir."""
    orch = PublishOrchestrator(db)
    mock_id = "compatVid999"

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        new=AsyncMock(return_value=mock_id),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            run(orch.publish_job(
                job_id=job_id,
                target=pending_target,
                video_path="/fake/video.mp4",
                metadata={"title": "T", "tags": [], "description": "", "category_id": "22"},
                progress_callback=AsyncMock(),
            ))

    db.expire_all()
    j = db.query(Job).filter_by(id=job_id).first()
    assert j.youtube_video_id == mock_id
    assert j.youtube_upload_status == "completed"
    assert j.youtube_video_url == f"https://www.youtube.com/watch?v={mock_id}"
    assert j.youtube_channel_id == "UC_orch"


def test_orchestrator_failure_updates_target(db, job_id, job, account, pending_target):
    """PublishError → target.status=failed, error_message güncellenir."""
    orch = PublishOrchestrator(db)

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        side_effect=PublishError("YT_QUOTA_EXCEEDED", "Quota exceeded"),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            with pytest.raises(PublishError):
                run(orch.publish_job(
                    job_id=job_id,
                    target=pending_target,
                    video_path="/fake/video.mp4",
                    metadata={},
                    progress_callback=AsyncMock(),
                ))

    db.expire_all()
    t = db.query(JobPublishTarget).filter_by(id=pending_target.id).first()
    assert t.status == "failed"
    assert "YT_QUOTA_EXCEEDED" in (t.error_message or "")


def test_orchestrator_failure_mirrors_youtube_compat_failed(db, job_id, job, account, pending_target):
    """PublishError → Job.youtube_upload_status=failed + error_code."""
    orch = PublishOrchestrator(db)

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        side_effect=PublishError("YT_QUOTA_EXCEEDED", "Quota"),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            with pytest.raises(PublishError):
                run(orch.publish_job(
                    job_id=job_id,
                    target=pending_target,
                    video_path="/fake/video.mp4",
                    metadata={},
                    progress_callback=AsyncMock(),
                ))

    db.expire_all()
    j = db.query(Job).filter_by(id=job_id).first()
    assert j.youtube_upload_status == "failed"
    assert j.youtube_error_code == "YT_QUOTA_EXCEEDED"


def test_orchestrator_unknown_platform_handled(db, job_id, job, account):
    """Kayıtlı olmayan platform → attempt.status=failed, hata fırlatılmaz."""
    unknown_target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="snapchat",   # kayıtlı adapter yok
        privacy_status="private",
    )
    db.add(unknown_target)
    db.flush()

    orch = PublishOrchestrator(db)
    attempt = run(orch.publish_job(
        job_id=job_id,
        target=unknown_target,
        video_path="/fake/video.mp4",
        metadata={},
        progress_callback=AsyncMock(),
    ))

    assert attempt.status == "failed"
    assert "snapchat" in (attempt.error_message or "").lower()


def test_build_external_url_youtube():
    """_build_external_url YouTube için doğru URL döner."""
    url = _build_external_url("youtube", "dQw4w9WgXcQ")
    assert url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_build_external_url_unknown_platform():
    """Bilinmeyen platform için external_id'yi olduğu gibi döner."""
    result = _build_external_url("snapchat", "snap123")
    assert result == "snap123"
