"""
PlatformAccount Model + YouTubeChannel Bridge Testleri.

Kapsanan senaryolar:
  1.  PlatformAccount oluşturma — temel alanlar doğru kaydedilir
  2.  credentials_json JSON roundtrip
  3.  UniqueConstraint: aynı platform + external_account_id → ikinci insert reddedilir
  4.  is_default + is_active varsayılan değerleri
  5.  _youtube_channel_bridge: aktif + varsayılan YouTubeChannel varken PlatformAccount oluşturur
  6.  _youtube_channel_bridge: zaten var olan PlatformAccount → yeni satır oluşturulmaz (idempotent)
  7.  _youtube_channel_bridge: varsayılan aktif kanal yoksa None döner
  8.  _youtube_channel_bridge: PlatformAccount oluşturulunca credentials_json tokenleri içerir

Çalıştırma:
    python3 -m pytest backend/tests/test_platform_account.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models.platform_account import PlatformAccount
from backend.models.youtube_channel import YouTubeChannel


# ─── Fixture ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def db():
    """Her test için temiz in-memory SQLite oturumu."""
    from backend.models import job, settings as _s  # noqa: F401
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


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_create_platform_account_basic(db):
    """PlatformAccount temel alanları doğru kaydedilir."""
    acc = PlatformAccount(
        platform="youtube",
        account_name="Test Kanal",
        external_account_id="UC_test",
        credentials_json='{"access_token":"tok"}',
    )
    db.add(acc)
    db.commit()

    row = db.query(PlatformAccount).filter_by(external_account_id="UC_test").first()
    assert row is not None
    assert row.platform == "youtube"
    assert row.account_name == "Test Kanal"
    assert row.is_active is True
    assert row.is_default is False


def test_credentials_json_roundtrip(db):
    """credentials_json JSON olarak doğru encode/decode edilir."""
    creds = {
        "access_token": "ya29.token",
        "refresh_token": "1//refresh",
        "token_expiry": "2026-04-01T12:00:00+00:00",
    }
    acc = PlatformAccount(
        platform="youtube",
        external_account_id="UC_json",
        credentials_json=json.dumps(creds),
    )
    db.add(acc)
    db.commit()

    row = db.query(PlatformAccount).filter_by(external_account_id="UC_json").first()
    loaded = json.loads(row.credentials_json)
    assert loaded["access_token"] == "ya29.token"
    assert loaded["refresh_token"] == "1//refresh"
    assert loaded["token_expiry"] == "2026-04-01T12:00:00+00:00"


def test_unique_constraint_platform_external_id(db):
    """Aynı platform + external_account_id → IntegrityError fırlatılır."""
    acc1 = PlatformAccount(platform="youtube", external_account_id="UC_dup")
    acc2 = PlatformAccount(platform="youtube", external_account_id="UC_dup")
    db.add(acc1)
    db.commit()
    db.add(acc2)
    with pytest.raises(IntegrityError):
        db.commit()


def test_different_platforms_same_external_id_allowed(db):
    """Farklı platformlarda aynı external_account_id izin verilir."""
    acc1 = PlatformAccount(platform="youtube", external_account_id="same_id")
    acc2 = PlatformAccount(platform="tiktok", external_account_id="same_id")
    db.add_all([acc1, acc2])
    db.commit()
    assert db.query(PlatformAccount).count() == 2


def test_bridge_creates_platform_account_from_youtube_channel(db):
    """YouTubeChannel varken bridge PlatformAccount oluşturur."""
    from backend.pipeline.steps.publish import _youtube_channel_bridge

    channel = YouTubeChannel(
        channel_id="UC_bridge",
        channel_name="Bridge Kanal",
        is_active=True,
        is_default=True,
        access_token="at",
        refresh_token="rt",
        token_expiry="2026-12-31T00:00:00+00:00",
    )
    db.add(channel)
    db.commit()

    account = _youtube_channel_bridge(db)
    assert account is not None
    assert account.platform == "youtube"
    assert account.external_account_id == "UC_bridge"
    assert account.account_name == "Bridge Kanal"

    creds = json.loads(account.credentials_json)
    assert creds["access_token"] == "at"
    assert creds["refresh_token"] == "rt"


def test_bridge_is_idempotent(db):
    """Bridge iki kez çağrılınca yeni PlatformAccount oluşturulmaz."""
    from backend.pipeline.steps.publish import _youtube_channel_bridge

    channel = YouTubeChannel(
        channel_id="UC_idem",
        is_active=True,
        is_default=True,
    )
    db.add(channel)
    db.commit()

    _youtube_channel_bridge(db)
    _youtube_channel_bridge(db)

    count = db.query(PlatformAccount).filter_by(external_account_id="UC_idem").count()
    assert count == 1


def test_bridge_returns_none_when_no_active_default_channel(db):
    """Varsayılan aktif kanal yoksa bridge None döner."""
    from backend.pipeline.steps.publish import _youtube_channel_bridge

    # Pasif kanal
    channel = YouTubeChannel(
        channel_id="UC_inactive",
        is_active=False,
        is_default=True,
    )
    db.add(channel)
    db.commit()

    result = _youtube_channel_bridge(db)
    assert result is None
