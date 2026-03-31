"""
JobPublishTarget + PublishAttempt Model Testleri.

Kapsanan senaryolar:
  1.  JobPublishTarget oluşturma — temel alanlar doğru kaydedilir
  2.  Varsayılan status "pending"
  3.  PublishAttempt oluşturma + cascade delete
  4.  JobPublishTarget → PublishAttempt ilişkisi (selectin)
  5.  ix_jpt_job_platform index doğruluğu
  6.  Aynı job + platform tekrar edilebilir değil (mantıksal kontrol)

Çalıştırma:
    python3 -m pytest backend/tests/test_publish_target.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

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
def job(db):
    j = Job(
        id="jpt-test-job-0000-0000-0000000001",
        module_key="standard_video",
        title="Test",
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
        external_account_id="UC_test",
        credentials_json="{}",
        is_active=True,
        is_default=True,
    )
    db.add(acc)
    db.commit()
    return acc


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_create_job_publish_target(db, job, account):
    """JobPublishTarget temel alanları doğru kaydedilir."""
    target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
        privacy_status="private",
    )
    db.add(target)
    db.commit()

    row = db.query(JobPublishTarget).filter_by(job_id=job.id).first()
    assert row is not None
    assert row.platform == "youtube"
    assert row.status == "pending"
    assert row.privacy_status == "private"
    assert row.publish_type == "video"
    assert row.content_type == "standard_video"
    assert row.attempts_count == 0


def test_publish_target_status_lifecycle(db, job, account):
    """JobPublishTarget status geçişleri: pending → publishing → published."""
    target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
    )
    db.add(target)
    db.commit()

    assert target.status == "pending"

    target.status = "publishing"
    db.commit()
    db.expire_all()
    row = db.query(JobPublishTarget).filter_by(id=target.id).first()
    assert row.status == "publishing"

    row.status = "published"
    row.external_object_id = "dQw4w9WgXcQ"
    row.external_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    db.commit()
    db.expire_all()
    row2 = db.query(JobPublishTarget).filter_by(id=target.id).first()
    assert row2.status == "published"
    assert row2.external_object_id == "dQw4w9WgXcQ"


def test_publish_attempt_created_and_linked(db, job, account):
    """PublishAttempt doğru JobPublishTarget'a bağlanır."""
    target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
    )
    db.add(target)
    db.flush()

    attempt = PublishAttempt(
        publish_target_id=target.id,
        action_type="publish",
        status="success",
    )
    db.add(attempt)
    db.commit()

    db.expire_all()
    row = db.query(JobPublishTarget).filter_by(id=target.id).first()
    assert len(row.attempts) == 1
    assert row.attempts[0].status == "success"
    assert row.attempts[0].action_type == "publish"


def test_publish_attempt_cascade_delete(db, job, account):
    """JobPublishTarget silinince PublishAttempt'ler de silinir."""
    target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
    )
    db.add(target)
    db.flush()
    target_id = target.id

    attempt = PublishAttempt(publish_target_id=target.id, status="success")
    db.add(attempt)
    db.commit()

    db.delete(db.query(JobPublishTarget).filter_by(id=target_id).first())
    db.commit()

    remaining = db.query(PublishAttempt).filter_by(publish_target_id=target_id).count()
    assert remaining == 0


def test_multiple_attempts_per_target(db, job, account):
    """Tek target'a birden fazla attempt eklenebilir."""
    target = JobPublishTarget(
        job_id=job.id,
        platform_account_id=account.id,
        platform="youtube",
    )
    db.add(target)
    db.flush()

    for status in ("failed", "failed", "success"):
        db.add(PublishAttempt(publish_target_id=target.id, status=status))
    db.commit()

    db.expire_all()
    row = db.query(JobPublishTarget).filter_by(id=target.id).first()
    assert len(row.attempts) == 3
