"""
Generic Publish Pipeline Adımı (publish.py) Testleri.

Kapsanan senaryolar:
  1.  Tüm publish_to_* False → boş sonuç, any_enabled=False
  2.  publish_to_youtube=True, PlatformAccount yok, YouTubeChannel bridge de yok → skipped
  3.  Başarılı YouTube publish → any_published=True, platform sonucu içerir
  4.  publish_to_youtube=True, video dosyası yok → skipped + PUBLISH_FILE_NOT_FOUND
  5.  Hedef zaten published → atlanır, duplicate upload olmaz
  6.  Publish başarısız olursa step Exception FIRLATMAZ (is_fatal=False)
  7.  _parse_bool: çeşitli input türleri doğru çevirilir
  8.  _resolve_privacy: platform-özel anahtar önceliklidir

Çalıştırma:
    python3 -m pytest backend/tests/test_publish_step.py -v
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

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
from backend.models.publish_target import JobPublishTarget
from backend.pipeline.steps.publish import _parse_bool, _resolve_privacy


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
    return "pstep-test-job-0000-0000-00000000001"


@pytest.fixture()
def base_job(db, job_id):
    j = Job(
        id=job_id,
        module_key="standard_video",
        title="Publish Step Test",
        status="running",
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
        external_account_id="UC_pstep",
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
def mock_cache(tmp_path):
    from backend.pipeline.cache import CacheManager
    session_dir = tmp_path / "pstep-test-job-0000-0000-00000000001"
    session_dir.mkdir(parents=True)
    return CacheManager(
        job_id="pstep-test-job-0000-0000-00000000001",
        session_dir=session_dir,
    )


@pytest.fixture()
def video_file(mock_cache):
    path = mock_cache.get_output_path("composition", "final.mp4")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x00" * 100)
    return path


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_all_platforms_disabled_returns_empty(db, job_id, base_job, mock_cache):
    """Tüm publish_to_* False → any_enabled=False, platforms={}."""
    from backend.pipeline.steps.publish import step_publish

    config = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": False,
    }

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        result = run(step_publish(job_id, "publish", config, mock_cache))

    assert result["any_enabled"] is False
    assert result["any_published"] is False
    assert result["platforms"] == {}
    assert result["cost_estimate_usd"] == 0.0


def test_publish_youtube_no_account_skipped(db, job_id, base_job, mock_cache, video_file):
    """PlatformAccount ve YouTubeChannel yok → youtube skipped."""
    from backend.pipeline.steps.publish import step_publish

    config = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": True,
        "youtube_privacy": "private",
    }

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        result = run(step_publish(job_id, "publish", config, mock_cache))

    assert result["any_enabled"] is True
    assert result["any_published"] is False
    yt = result["platforms"].get("youtube", {})
    assert yt.get("skipped") is True
    assert yt.get("reason") == "no_default_account"


def test_publish_video_not_found_skipped(db, job_id, base_job, mock_cache, account):
    """Video dosyası yok → PUBLISH_FILE_NOT_FOUND ile skipped."""
    from backend.pipeline.steps.publish import step_publish

    config = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": True,
    }

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        result = run(step_publish(job_id, "publish", config, mock_cache))

    yt = result["platforms"].get("youtube", {})
    assert yt.get("skipped") is True
    assert yt.get("reason") == "video_file_not_found"


def test_publish_youtube_success(db, job_id, base_job, mock_cache, account, video_file):
    """Başarılı publish → any_published=True, external_id döner."""
    from backend.pipeline.steps.publish import step_publish

    config = {
        "_db": db,
        "_job_title": "Test",
        "_module_key": "standard_video",
        "publish_to_youtube": True,
        "youtube_privacy": "private",
    }

    mock_video_id = "success123"

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        with patch(
            "backend.services.youtube_upload_service.upload_video_async",
            new=AsyncMock(return_value=mock_video_id),
        ):
            with patch("backend.services.youtube_upload_service.refresh_channel_token"):
                result = run(step_publish(job_id, "publish", config, mock_cache))

    assert result["any_published"] is True
    yt = result["platforms"]["youtube"]
    assert yt["published"] is True
    assert yt["external_id"] == mock_video_id


def test_publish_already_published_skipped(db, job_id, base_job, mock_cache, account, video_file):
    """Hedef zaten published → skipped, duplicate upload olmaz."""
    from backend.pipeline.steps.publish import step_publish

    # Zaten published target oluştur
    target = JobPublishTarget(
        job_id=job_id,
        platform_account_id=account.id,
        platform="youtube",
        status="published",
        external_object_id="existing_vid",
        external_url="https://www.youtube.com/watch?v=existing_vid",
    )
    db.add(target)
    db.commit()

    config = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": True,
    }

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        with patch(
            "backend.services.youtube_upload_service.upload_video_async",
            new=AsyncMock(),
        ) as mock_upload:
            result = run(step_publish(job_id, "publish", config, mock_cache))

    # Upload çağrılmadı
    mock_upload.assert_not_called()
    yt = result["platforms"]["youtube"]
    assert yt.get("skipped") is True
    assert yt.get("reason") == "already_published"


def test_publish_failure_does_not_raise(db, job_id, base_job, mock_cache, account, video_file):
    """Publish hatası step Exception FIRLATMAZ — is_fatal=False."""
    from backend.pipeline.steps.publish import step_publish
    from backend.publishing.adapters.base import PublishError

    config = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": True,
    }

    with patch("backend.pipeline.steps.publish._emit_publish_progress", new=AsyncMock()):
        with patch(
            "backend.services.youtube_upload_service.upload_video_async",
            side_effect=PublishError("YT_QUOTA_EXCEEDED", "Quota"),
        ):
            with patch("backend.services.youtube_upload_service.refresh_channel_token"):
                result = run(step_publish(job_id, "publish", config, mock_cache))

    yt = result["platforms"]["youtube"]
    assert yt["published"] is False
    assert yt["error_code"] == "YT_QUOTA_EXCEEDED"


# ─── _parse_bool Testleri ─────────────────────────────────────────────────────


def test_parse_bool_true_values():
    assert _parse_bool(True) is True
    assert _parse_bool("true") is True
    assert _parse_bool("True") is True
    assert _parse_bool("1") is True
    assert _parse_bool("yes") is True


def test_parse_bool_false_values():
    assert _parse_bool(False) is False
    assert _parse_bool("false") is False
    assert _parse_bool("0") is False
    assert _parse_bool(None) is False
    assert _parse_bool("") is False


# ─── _resolve_privacy Testleri ────────────────────────────────────────────────


def test_resolve_privacy_platform_specific_key_wins():
    """Platform-özel anahtar (youtube_privacy) genel anahtara göre önceliklidir."""
    config = {"youtube_privacy": "public", "privacy": "private"}
    result = _resolve_privacy("youtube", config)
    assert result == "public"


def test_resolve_privacy_falls_back_to_general():
    """Platform-özel anahtar yoksa genel privacy kullanılır."""
    config = {"privacy": "unlisted"}
    result = _resolve_privacy("tiktok", config)
    assert result == "unlisted"


def test_resolve_privacy_invalid_falls_back():
    """Geçersiz privacy değeri → 'private' fallback."""
    config = {"youtube_privacy": "banana"}
    result = _resolve_privacy("youtube", config)
    assert result == "private"
