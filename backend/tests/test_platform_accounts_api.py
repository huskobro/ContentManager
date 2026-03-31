"""
Platform Accounts API Testleri — Faz 11.3

Kapsanan senaryolar:
  1.  GET /api/platform-accounts → boş liste döner
  2.  GET /api/platform-accounts → hesaplar listelenir
  3.  GET /api/platform-accounts?platform=youtube → platform filtresi çalışır
  4.  GET /api/platform-accounts/{id} → tek hesap döner
  5.  GET /api/platform-accounts/999 → 404
  6.  PATCH /{id}/active → toggle çalışır (aktif → pasif)
  7.  PATCH /{id}/active → pasif yapılınca is_default sıfırlanır
  8.  PATCH /{id}/active → Admin PIN olmadan 403
  9.  PATCH /{id}/active → yanlış PIN → 403
  10. PATCH /{id}/default → varsayılan yapılır
  11. PATCH /{id}/default → pasif hesap varsayılan yapılamaz → 409
  12. PATCH /{id}/default → aynı platformdaki önceki varsayılan temizlenir
  13. DELETE /{id} → hesap silinir (204)
  14. DELETE /{id} → Admin PIN olmadan 403
  15. credentials_json API yanıtında görünmez

Çalıştırma:
    python3 -m pytest backend/tests/test_platform_accounts_api.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models.platform_account import PlatformAccount


# ─── App + DB Fixture ─────────────────────────────────────────────────────────


@pytest.fixture()
def db_session():
    from backend.models import job, settings as _s
    from backend.models import category as _c, hook as _h
    from backend.models import news_source as _ns, category_style_mapping as _csm
    from backend.models import youtube_channel as _yc
    from backend.models import platform_account as _pa
    from backend.models import publish_target as _pt

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
def client(db_session):
    from backend.main import app

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Yardımcı ─────────────────────────────────────────────────────────────────


def _make_account(db, *, platform="youtube", name="Test", ext_id="UC_test",
                  is_active=True, is_default=False) -> PlatformAccount:
    acc = PlatformAccount(
        platform=platform,
        account_name=name,
        external_account_id=ext_id,
        credentials_json='{"access_token":"tok"}',
        is_active=is_active,
        is_default=is_default,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


ADMIN_PIN = "0000"  # settings tablosu boşken default


# ─── Testler ──────────────────────────────────────────────────────────────────


def test_list_empty(client):
    r = client.get("/api/platform-accounts")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["accounts"] == []


def test_list_with_accounts(client, db_session):
    _make_account(db_session, ext_id="UC_1", name="Kanal 1")
    _make_account(db_session, ext_id="UC_2", name="Kanal 2")

    r = client.get("/api/platform-accounts")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    names = {a["account_name"] for a in body["accounts"]}
    assert names == {"Kanal 1", "Kanal 2"}


def test_list_platform_filter(client, db_session):
    _make_account(db_session, platform="youtube", ext_id="UC_yt")
    _make_account(db_session, platform="tiktok", ext_id="TT_tk")

    r = client.get("/api/platform-accounts?platform=youtube")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["accounts"][0]["platform"] == "youtube"


def test_get_single_account(client, db_session):
    acc = _make_account(db_session, ext_id="UC_single")
    r = client.get(f"/api/platform-accounts/{acc.id}")
    assert r.status_code == 200
    assert r.json()["external_account_id"] == "UC_single"


def test_get_404(client):
    r = client.get("/api/platform-accounts/9999")
    assert r.status_code == 404


def test_credentials_json_not_in_response(client, db_session):
    acc = _make_account(db_session, ext_id="UC_sec")
    r = client.get(f"/api/platform-accounts/{acc.id}")
    assert "credentials_json" not in r.json()


def test_toggle_active_deactivates(client, db_session):
    acc = _make_account(db_session, ext_id="UC_tog", is_active=True)
    r = client.patch(
        f"/api/platform-accounts/{acc.id}/active",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_toggle_active_clears_default_when_deactivated(client, db_session):
    acc = _make_account(db_session, ext_id="UC_def_tog", is_active=True, is_default=True)
    r = client.patch(
        f"/api/platform-accounts/{acc.id}/active",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_active"] is False
    assert body["is_default"] is False


def test_toggle_active_no_pin_403(client, db_session):
    acc = _make_account(db_session, ext_id="UC_nopin")
    r = client.patch(f"/api/platform-accounts/{acc.id}/active")
    assert r.status_code == 403


def test_toggle_active_wrong_pin_403(client, db_session):
    acc = _make_account(db_session, ext_id="UC_badpin")
    r = client.patch(
        f"/api/platform-accounts/{acc.id}/active",
        headers={"X-Admin-Pin": "9999"},
    )
    assert r.status_code == 403


def test_set_default(client, db_session):
    acc = _make_account(db_session, ext_id="UC_dflt", is_active=True)
    r = client.patch(
        f"/api/platform-accounts/{acc.id}/default",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 200
    assert r.json()["is_default"] is True


def test_set_default_inactive_409(client, db_session):
    acc = _make_account(db_session, ext_id="UC_inact_def", is_active=False)
    r = client.patch(
        f"/api/platform-accounts/{acc.id}/default",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 409


def test_set_default_clears_previous_default(client, db_session):
    acc1 = _make_account(db_session, ext_id="UC_d1", is_active=True, is_default=True)
    acc2 = _make_account(db_session, ext_id="UC_d2", is_active=True, is_default=False)

    r = client.patch(
        f"/api/platform-accounts/{acc2.id}/default",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 200
    assert r.json()["is_default"] is True

    # acc1 artık varsayılan olmamalı
    db_session.refresh(acc1)
    assert acc1.is_default is False


def test_delete_account(client, db_session):
    acc = _make_account(db_session, ext_id="UC_del")
    r = client.delete(
        f"/api/platform-accounts/{acc.id}",
        headers={"X-Admin-Pin": ADMIN_PIN},
    )
    assert r.status_code == 204

    # Artık bulunamaz
    r2 = client.get(f"/api/platform-accounts/{acc.id}")
    assert r2.status_code == 404


def test_delete_no_pin_403(client, db_session):
    acc = _make_account(db_session, ext_id="UC_del_nopin")
    r = client.delete(f"/api/platform-accounts/{acc.id}")
    assert r.status_code == 403
