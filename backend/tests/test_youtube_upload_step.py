"""
YouTube Upload — Birim Testleri (Faz 11.2C güncellemesi)

[DEPRECATED STEP] step_youtube_upload Faz 11.2C'de pipeline'dan kaldırılmıştır.
Ana yayın adımı artık step_publish (Publishing Hub)'dır.

Kapsanan senaryolar:
  1.  publish_to_youtube=False → step SKIP döner (deprecated early return)
  2.  publish_to_youtube='false' (string) → da skip
  3-10. [DEPRECATED] Bu senaryolar artık step_youtube_upload'ın erken döndüğünü doğrular.
        Fonksiyon her durumda skipped={True, reason="deprecated_step_removed_in_11_2C"} döner.
  11. normalize_metadata: title > 100 char → kesilir
  12. normalize_metadata: boş title → job_title fallback
  13. normalize_metadata: tag toplamı > 500 char → fazlası atılır
  14. normalize_metadata: kategori Türkçe → doğru ID
  15. map_category_to_id: bilinmeyen kategori → '22'
  16. map_category_to_id: None → '22'
  17. map_category_to_id: sayısal string → passthrough
  18. validate_privacy: geçerli değerler normalize edilir
  19. validate_privacy: geçersiz → 'private'

Çalıştırma:
    python3 -m pytest backend/tests/test_youtube_upload_step.py -v
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models.job import Job
from backend.models.youtube_channel import YouTubeChannel
from backend.pipeline.cache import CacheManager
from backend.services.youtube_upload_service import (
    YtUploadError,
    YT_NO_DEFAULT_CHANNEL,
    YT_FILE_NOT_FOUND,
    YT_DUPLICATE_UPLOAD_BLOCKED,
    YT_TOKEN_REFRESH_FAILED,
    YT_QUOTA_EXCEEDED,
    normalize_metadata,
    map_category_to_id,
    validate_privacy,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def db():
    """Her test için temiz in-memory SQLite DB oturumu."""
    from backend.models import settings as _s  # noqa: F401
    from backend.models import youtube_channel as _yc  # noqa: F401
    from backend.models import category as _c, hook as _h  # noqa: F401
    from backend.models import news_source as _ns, category_style_mapping as _csm  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def job_id():
    return "test-job-0000-0000-0000-000000000001"


@pytest.fixture()
def base_config(db, job_id):
    """Temel config dict — DB ve job kaydı dahil."""
    job = Job(
        id=job_id,
        module_key="standard_video",
        title="Test Video",
        status="running",
        language="tr",
    )
    db.add(job)
    db.commit()
    return {
        "_db": db,
        "_job_title": "Test Video",
        "publish_to_youtube": True,
        "youtube_privacy": "private",
    }


@pytest.fixture()
def active_channel(db):
    """Aktif + varsayılan YouTube kanalı."""
    channel = YouTubeChannel(
        channel_id="UC_test_channel",
        channel_name="Test Kanal",
        is_active=True,
        is_default=True,
        access_token="valid_token",
        refresh_token="valid_refresh",
        token_expiry=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    )
    db.add(channel)
    db.commit()
    return channel


@pytest.fixture()
def mock_cache(tmp_path):
    """Geçici session dizini ile CacheManager."""
    session_dir = tmp_path / "sessions" / "test-job-0000-0000-0000-000000000001"
    session_dir.mkdir(parents=True)
    return CacheManager(
        job_id="test-job-0000-0000-0000-000000000001",
        session_dir=session_dir,
    )


@pytest.fixture()
def video_file(mock_cache):
    """Var olan sahte video dosyası (composition/final.mp4)."""
    path = mock_cache.get_output_path("composition", "final.mp4")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x00" * 100)
    return path


# ─── Yardımcı: async test çalıştırıcı ────────────────────────────────────────

def run(coro):
    """Async coroutine'i senkron test içinden çalıştırır."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── Test: publish_to_youtube=False → erken dönüş ─────────────────────────────


def test_skip_when_publish_disabled(db, job_id, mock_cache):
    """publish_to_youtube=False → upload yapılmaz, skipped sonuç döner."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    config: dict[str, Any] = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": False,
    }

    with patch("backend.pipeline.steps.youtube_upload._emit_upload_progress", new=AsyncMock()):
        result = run(step_youtube_upload(job_id, "youtube_upload", config, mock_cache))

    assert result["skipped"] is True
    assert result["cost_estimate_usd"] == 0.0


def test_skip_when_publish_disabled_string_false(db, job_id, mock_cache):
    """publish_to_youtube='false' (string) → da skip."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    config: dict[str, Any] = {
        "_db": db,
        "_job_title": "Test",
        "publish_to_youtube": "false",
    }

    with patch("backend.pipeline.steps.youtube_upload._emit_upload_progress", new=AsyncMock()):
        result = run(step_youtube_upload(job_id, "youtube_upload", config, mock_cache))

    assert result["skipped"] is True


# ─── Test: DEPRECATED — Faz 11.2C erken dönüş doğrulama ────────────────────────
#
# step_youtube_upload Faz 11.2C'de pipeline'dan kaldırıldı.
# Fonksiyon artık her durumda erken döner (deprecated skip).
# Aşağıdaki testler bu davranışı doğrular.


def test_deprecated_returns_skip_with_publish_enabled(db, job_id, base_config, mock_cache):
    """publish_to_youtube=True bile olsa deprecated step erken döner."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"
    assert result["cost_estimate_usd"] == 0.0


def test_deprecated_returns_skip_even_with_duplicate_guard_data(db, job_id, base_config, mock_cache):
    """youtube_video_id dolu olsa bile deprecated step erken döner (raise etmez)."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    job = db.query(Job).filter_by(id=job_id).first()
    job.youtube_video_id = "existing_video_id"
    db.commit()

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"


def test_deprecated_returns_skip_even_without_channel(db, job_id, base_config, mock_cache):
    """Kanal yok olsa bile deprecated step erken döner (raise etmez)."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"


def test_deprecated_returns_skip_even_with_inactive_channel(db, job_id, base_config, mock_cache):
    """Pasif kanal var olsa bile deprecated step erken döner."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    channel = YouTubeChannel(
        channel_id="UC_inactive",
        channel_name="Pasif Kanal",
        is_active=False,
        is_default=True,
    )
    db.add(channel)
    db.commit()

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"


def test_deprecated_returns_skip_without_video_file(db, job_id, base_config, mock_cache, active_channel):
    """Video dosyası yok olsa bile deprecated step erken döner (raise etmez)."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"


def test_deprecated_returns_skip_with_expired_token(db, job_id, base_config, mock_cache, active_channel, video_file):
    """Token süresi geçmiş olsa bile deprecated step erken döner."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    active_channel.token_expiry = "2000-01-01T00:00:00+00:00"
    db.commit()

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    assert result["reason"] == "deprecated_step_removed_in_11_2C"


def test_deprecated_does_not_call_upload(db, job_id, base_config, mock_cache, active_channel, video_file):
    """Deprecated step upload_video_async'ı hiç çağırmamalı."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    with patch(
        "backend.pipeline.steps.youtube_upload.upload_video_async",
        new=AsyncMock(side_effect=Exception("Should not be called")),
    ) as mock_upload:
        result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    mock_upload.assert_not_called()
    assert result["skipped"] is True


def test_deprecated_does_not_modify_job_youtube_fields(db, job_id, base_config, mock_cache):
    """Deprecated step Job.youtube_* alanlarını değiştirmemeli."""
    from backend.pipeline.steps.youtube_upload import step_youtube_upload

    result = run(step_youtube_upload(job_id, "youtube_upload", base_config, mock_cache))

    assert result["skipped"] is True
    db.expire_all()
    job = db.query(Job).filter_by(id=job_id).first()
    # Deprecated step hiçbir alanı güncellememiş olmalı
    assert job.youtube_video_id is None
    assert job.youtube_upload_status is None


# ─── normalize_metadata testleri ──────────────────────────────────────────────


def test_normalize_metadata_title_truncated():
    """100 karakterden uzun başlık kesilir."""
    long_title = "A" * 150
    result = normalize_metadata({"youtube_title": long_title})
    assert len(result["title"]) == 100


def test_normalize_metadata_fallback_to_job_title():
    """youtube_title boşsa job_title kullanılır."""
    result = normalize_metadata({}, job_title="Fallback Başlık")
    assert result["title"] == "Fallback Başlık"


def test_normalize_metadata_tags_total_limit():
    """Tag toplamı 500 karakteri aşınca fazlası atılır."""
    tags = ["X" * 50] * 20  # 50*20=1000 char
    result = normalize_metadata({"tags": tags})
    total = sum(len(t) for t in result["tags"])
    assert total <= 500


def test_normalize_metadata_category_mapped():
    """Türkçe kategori adı doğru categoryId'ye çevrilir."""
    result = normalize_metadata({"category": "eğitim"})
    assert result["category_id"] == "27"


# ─── map_category_to_id testleri ──────────────────────────────────────────────


def test_map_category_unknown_returns_22():
    assert map_category_to_id("completely_unknown_xyz") == "22"


def test_map_category_none_returns_22():
    assert map_category_to_id(None) == "22"


def test_map_category_integer_string_passthrough():
    assert map_category_to_id("27") == "27"


# ─── validate_privacy testleri ────────────────────────────────────────────────


def test_validate_privacy_valid_values():
    assert validate_privacy("public") == "public"
    assert validate_privacy("PRIVATE") == "private"
    assert validate_privacy("Unlisted") == "unlisted"


def test_validate_privacy_invalid_falls_back():
    assert validate_privacy("banana") == "private"
    assert validate_privacy(None) == "private"
    assert validate_privacy(123) == "private"
