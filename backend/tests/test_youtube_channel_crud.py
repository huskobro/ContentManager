"""
YouTube Kanal CRUD endpoint testleri.

Kapsanan senaryolar:
  GET  /youtube/channels          → boş liste döner
  GET  /youtube/channels          → 401 geçersiz PIN
  PATCH /youtube/channels/{id}/active  → 200 toggle
  PATCH /youtube/channels/{id}/active  → 404 bulunamadı
  PATCH /youtube/channels/{id}/active  → pasif kanal is_default'u kaybeder
  POST  /youtube/channels/{id}/default → 200 varsayılan seç
  POST  /youtube/channels/{id}/default → 404 bulunamadı
  POST  /youtube/channels/{id}/default → 400 pasif kanal varsayılan yapılamaz
  DELETE /youtube/channels/{id}        → 200 silindi
  DELETE /youtube/channels/{id}        → 404 bulunamadı
  DELETE /youtube/channels/{id}        → varsayılan silinince sonraki kanal promoted

Çalıştırma:
    python3 -m pytest backend/tests/test_youtube_channel_crud.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app

_ADMIN_PIN = "0000"


# ─── Fixture ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def client():
    """Her test için temiz in-memory DB + TestClient döndürür."""
    from backend.models import job, settings as _s  # noqa: F401
    from backend.models import category as _c, hook as _h  # noqa: F401
    from backend.models import news_source as _ns, category_style_mapping as _csm  # noqa: F401
    from backend.models import youtube_channel as _yc  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)

    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _headers() -> dict:
    return {"x-admin-pin": _ADMIN_PIN}


def _bad_headers() -> dict:
    return {"x-admin-pin": "9999"}


# ─── Yardımcı: DB'ye doğrudan kanal ekle ─────────────────────────────────────


def _insert_channel(
    client: TestClient,
    *,
    channel_id: str = "UC_test_001",
    channel_name: str = "Test Kanal",
    is_default: bool = False,
    is_active: bool = True,
) -> dict:
    """
    OAuth callback'i mock etmeden doğrudan DB'ye kanal insert eder.
    TestClient'ın dependency override'ı sayesinde aynı in-memory DB kullanılır.
    """
    from backend.models.youtube_channel import YouTubeChannel
    from backend.database import get_db as _orig_get_db

    # Bağımlılık override'ından session al
    override = app.dependency_overrides.get(_orig_get_db)
    assert override is not None, "get_db override eksik"
    gen = override()
    db = next(gen)
    try:
        ch = YouTubeChannel(
            channel_id=channel_id,
            channel_name=channel_name,
            channel_thumbnail="https://example.com/thumb.jpg",
            access_token="at_test",
            refresh_token="rt_test",
            token_expiry="",
            is_default=is_default,
            is_active=is_active,
        )
        db.add(ch)
        db.commit()
        db.refresh(ch)
        return {
            "id": ch.id,
            "channel_id": ch.channel_id,
            "channel_name": ch.channel_name,
            "is_default": ch.is_default,
            "is_active": ch.is_active,
        }
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


# ─── GET /youtube/channels ───────────────────────────────────────────────────


def test_list_channels_empty(client):
    """Hiç kanal yokken boş liste döner."""
    r = client.get("/api/youtube/channels", headers=_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_channels_unauthorized(client):
    """Geçersiz PIN → 401."""
    r = client.get("/api/youtube/channels", headers=_bad_headers())
    assert r.status_code == 401


def test_list_channels_returns_inserted(client):
    """Insert edilen kanal listede görünür."""
    _insert_channel(client, channel_id="UC_001", channel_name="Kanal 1")
    r = client.get("/api/youtube/channels", headers=_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["channel_id"] == "UC_001"
    assert data[0]["channel_name"] == "Kanal 1"


# ─── PATCH /youtube/channels/{id}/active ─────────────────────────────────────


def test_toggle_active_true_to_false(client):
    """Aktif kanal → pasife alınır."""
    ch = _insert_channel(client, is_active=True)
    r = client.patch(f"/api/youtube/channels/{ch['id']}/active", headers=_headers())
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_toggle_active_false_to_true(client):
    """Pasif kanal → aktife alınır."""
    ch = _insert_channel(client, is_active=False)
    r = client.patch(f"/api/youtube/channels/{ch['id']}/active", headers=_headers())
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_toggle_active_not_found(client):
    """Olmayan kanal → 404."""
    r = client.patch("/api/youtube/channels/9999/active", headers=_headers())
    assert r.status_code == 404


def test_toggle_active_clears_default(client):
    """Varsayılan kanal pasife alınınca is_default=False olur."""
    ch = _insert_channel(client, is_active=True, is_default=True)
    r = client.patch(f"/api/youtube/channels/{ch['id']}/active", headers=_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["is_active"] is False
    assert body["is_default"] is False


# ─── POST /youtube/channels/{id}/default ─────────────────────────────────────


def test_set_default_success(client):
    """Aktif kanal varsayılan yapılır."""
    ch = _insert_channel(client, is_active=True, is_default=False)
    r = client.post(f"/api/youtube/channels/{ch['id']}/default", headers=_headers())
    assert r.status_code == 200
    assert r.json()["is_default"] is True


def test_set_default_not_found(client):
    """Olmayan kanal → 404."""
    r = client.post("/api/youtube/channels/9999/default", headers=_headers())
    assert r.status_code == 404


def test_set_default_inactive_rejected(client):
    """Pasif kanal varsayılan yapılamaz → 400."""
    ch = _insert_channel(client, is_active=False)
    r = client.post(f"/api/youtube/channels/{ch['id']}/default", headers=_headers())
    assert r.status_code == 400


def test_set_default_clears_previous(client):
    """Yeni varsayılan seçilince eski varsayılan is_default=False olur."""
    ch1 = _insert_channel(client, channel_id="UC_001", is_active=True, is_default=True)
    ch2 = _insert_channel(client, channel_id="UC_002", is_active=True, is_default=False)

    r = client.post(f"/api/youtube/channels/{ch2['id']}/default", headers=_headers())
    assert r.status_code == 200
    assert r.json()["is_default"] is True

    # Eski varsayılan artık False
    channels = client.get("/api/youtube/channels", headers=_headers()).json()
    old = next(c for c in channels if c["id"] == ch1["id"])
    assert old["is_default"] is False


# ─── DELETE /youtube/channels/{id} ───────────────────────────────────────────


def test_disconnect_channel_success(client):
    """Kanal silinir, listede bir daha görünmez."""
    ch = _insert_channel(client)
    r = client.delete(f"/api/youtube/channels/{ch['id']}", headers=_headers())
    assert r.status_code == 200
    assert r.json()["ok"] is True

    channels = client.get("/api/youtube/channels", headers=_headers()).json()
    assert all(c["id"] != ch["id"] for c in channels)


def test_disconnect_channel_not_found(client):
    """Olmayan kanal → 404."""
    r = client.delete("/api/youtube/channels/9999", headers=_headers())
    assert r.status_code == 404


def test_disconnect_default_promotes_next(client):
    """
    Varsayılan kanal silinince aktif olan bir sonraki kanal varsayılan olur.
    """
    ch1 = _insert_channel(client, channel_id="UC_001", is_active=True, is_default=True)
    ch2 = _insert_channel(client, channel_id="UC_002", is_active=True, is_default=False)

    r = client.delete(f"/api/youtube/channels/{ch1['id']}", headers=_headers())
    assert r.status_code == 200

    channels = client.get("/api/youtube/channels", headers=_headers()).json()
    assert len(channels) == 1
    assert channels[0]["id"] == ch2["id"]
    assert channels[0]["is_default"] is True


def test_disconnect_default_no_promotion_when_inactive(client):
    """
    Varsayılan silinince pasif kanal varsa promote edilmez.
    Pasif kanallar varsayılan olamaz.
    """
    ch1 = _insert_channel(client, channel_id="UC_001", is_active=True, is_default=True)
    _insert_channel(client, channel_id="UC_002", is_active=False, is_default=False)

    r = client.delete(f"/api/youtube/channels/{ch1['id']}", headers=_headers())
    assert r.status_code == 200

    channels = client.get("/api/youtube/channels", headers=_headers()).json()
    # Pasif kanal hâlâ orada ama is_default değil
    assert len(channels) == 1
    assert channels[0]["is_default"] is False
