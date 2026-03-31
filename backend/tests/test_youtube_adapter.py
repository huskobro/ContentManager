"""
YouTubeAdapter + _ChannelProxy Testleri.

Kapsanan senaryolar:
  1.  _ChannelProxy PlatformAccount'tan credentials_json okur
  2.  _ChannelProxy setter credentials_json'a yazar (persist)
  3.  _build_channel_proxy: native YouTubeChannel → proxy ATLANIR
  4.  _build_channel_proxy: PlatformAccount → _ChannelProxy döner
  5.  YouTubeAdapter.publish başarılı → video_id döner
  6.  YouTubeAdapter.publish YtUploadError → PublishError dönüştürülür
  7.  YouTubeAdapter.publish account=None → PublishError(YT_NO_ACCOUNT)
  8.  YouTubeAdapter.get_status → "unknown" döner

Çalıştırma:
    python3 -m pytest backend/tests/test_youtube_adapter.py -v
"""

from __future__ import annotations

import asyncio
import json
import sys
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
from backend.models.platform_account import PlatformAccount
from backend.publishing.adapters.base import PublishError
from backend.publishing.adapters.youtube_adapter import (
    YouTubeAdapter,
    _ChannelProxy,
    _build_channel_proxy,
)
from backend.services.youtube_upload_service import YtUploadError, YT_QUOTA_EXCEEDED


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
def platform_account(db):
    creds = {
        "access_token": "ya29.test",
        "refresh_token": "1//refresh",
        "token_expiry": "2099-01-01T00:00:00+00:00",
    }
    acc = PlatformAccount(
        platform="youtube",
        account_name="Test Kanal",
        external_account_id="UC_adapter_test",
        credentials_json=json.dumps(creds),
        is_active=True,
        is_default=True,
    )
    db.add(acc)
    db.commit()
    return acc


# ─── _ChannelProxy Testleri ───────────────────────────────────────────────────


def test_channel_proxy_reads_credentials_json(platform_account):
    """_ChannelProxy credentials_json'daki tokenleri okur."""
    proxy = _ChannelProxy(platform_account)
    assert proxy.access_token == "ya29.test"
    assert proxy.refresh_token == "1//refresh"
    assert proxy.token_expiry == "2099-01-01T00:00:00+00:00"
    assert proxy.channel_id == "UC_adapter_test"


def test_channel_proxy_writes_back_to_account(platform_account):
    """_ChannelProxy setter'ları credentials_json'a yazar."""
    proxy = _ChannelProxy(platform_account)
    proxy.access_token = "new_token"
    proxy.refresh_token = "new_refresh"

    updated_creds = json.loads(platform_account.credentials_json)
    assert updated_creds["access_token"] == "new_token"
    assert updated_creds["refresh_token"] == "new_refresh"


def test_channel_proxy_handles_empty_credentials_json():
    """Boş credentials_json crash olmaz."""
    from types import SimpleNamespace
    acc = SimpleNamespace(
        credentials_json="{}",
        external_account_id="UC_empty",
        updated_at="",
    )
    proxy = _ChannelProxy(acc)
    assert proxy.access_token == ""
    proxy.access_token = "tok"
    assert json.loads(acc.credentials_json)["access_token"] == "tok"


def test_build_channel_proxy_passthrough_for_youtube_channel():
    """YouTubeChannel nesnesi (credentials_json yok) → proxy atlanır, nesne direkt döner."""
    from backend.models.youtube_channel import YouTubeChannel
    channel = YouTubeChannel(
        channel_id="UC_native",
        access_token="nat_tok",
        refresh_token="nat_ref",
        token_expiry="2099-01-01T00:00:00+00:00",
    )
    result = _build_channel_proxy(channel)
    assert result is channel  # proxy wrap edilmemiş


def test_build_channel_proxy_wraps_platform_account(platform_account):
    """PlatformAccount → _ChannelProxy döner."""
    result = _build_channel_proxy(platform_account)
    assert isinstance(result, _ChannelProxy)


# ─── YouTubeAdapter Testleri ──────────────────────────────────────────────────


def test_youtube_adapter_publish_success(platform_account, db):
    """Başarılı publish → video_id döner."""
    adapter = YouTubeAdapter()

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        new=AsyncMock(return_value="dQw4w9WgXcQ"),
    ) as _mock_up:
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            video_id = run(
                adapter.publish(
                    target=None,
                    account=platform_account,
                    video_path="/fake/video.mp4",
                    metadata={"title": "Test", "description": "", "tags": [], "category_id": "22"},
                    privacy="private",
                    progress_callback=AsyncMock(),
                    db=db,
                )
            )

    assert video_id == "dQw4w9WgXcQ"


def test_youtube_adapter_publish_maps_yt_upload_error(platform_account, db):
    """YtUploadError → PublishError dönüştürülür (kod korunur)."""
    adapter = YouTubeAdapter()

    with patch(
        "backend.services.youtube_upload_service.upload_video_async",
        side_effect=YtUploadError(YT_QUOTA_EXCEEDED, "Quota"),
    ):
        with patch("backend.services.youtube_upload_service.refresh_channel_token"):
            with pytest.raises(PublishError) as exc_info:
                run(
                    adapter.publish(
                        target=None,
                        account=platform_account,
                        video_path="/fake/video.mp4",
                        metadata={},
                        privacy="private",
                        progress_callback=AsyncMock(),
                        db=db,
                    )
                )

    assert exc_info.value.code == YT_QUOTA_EXCEEDED


def test_youtube_adapter_no_account_raises():
    """account=None → PublishError(YT_NO_ACCOUNT)."""
    adapter = YouTubeAdapter()
    with pytest.raises(PublishError) as exc_info:
        run(
            adapter.publish(
                target=None,
                account=None,
                video_path="/fake.mp4",
                metadata={},
                privacy="private",
                progress_callback=AsyncMock(),
            )
        )
    assert exc_info.value.code == "YT_NO_ACCOUNT"


def test_youtube_adapter_get_status_returns_unknown(platform_account):
    """get_status → 'unknown' döner (gelecek implementasyon için)."""
    adapter = YouTubeAdapter()
    result = run(adapter.get_status(target=None, account=platform_account))
    assert result == "unknown"
