"""
Setting ORM modeli — 5 katmanlı ayar hiyerarşisinin veritabanı tablosu.

Hiyerarşi (düşük → yüksek öncelik):
  1. global     — config.py'deki hardcoded defaults (DB'de saklanmaz; kod-içi)
  2. admin      — Admin panelinden girilen sistem geneli varsayımlar
  3. module     — Modüle özgü varsayımlar (ör. news_bulletin için farklı TTS)
  4. provider   — Provider'a özgü varsayımlar (ör. elevenlabs ses ayarları)
  5. user       — Kullanıcı override'ları (en yüksek öncelik)

Tek tablo tasarımı:
  Her ayar satırı (scope, scope_id, key) üçlüsüyle benzersiz tanımlanır.
  value sütunu JSON-text olarak saklanır (string, int, bool, list, dict).
  locked=True olan satırlar kullanıcı tarafından override edilemez.

Örnekler:
  scope="admin",    scope_id="",               key="tts_provider",     value='"elevenlabs"'
  scope="module",   scope_id="news_bulletin",  key="tts_provider",     value='"edge_tts"'
  scope="provider", scope_id="elevenlabs",     key="voice_id",         value='"XrExE9yKIg1OjostLsQR"'
  scope="user",     scope_id="",               key="tts_provider",     value='"openai_tts"'
  scope="admin",    scope_id="",               key="language",         value='"tr"',  locked=True
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Index, String, Text, Boolean, Integer

from backend.database import Base


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Setting(Base):
    """
    Tek bir ayar kaydı.

    (scope, scope_id, key) üçlüsü benzersizdir.
    settings_resolver.py bu tablodan ilgili satırları çekip
    hiyerarşiyi uygulayarak nihai değeri döndürür.
    """

    __tablename__ = "settings"

    # ── Kimlik ──────────────────────────────────────────────────────────────
    id: int = Column(Integer, primary_key=True, autoincrement=True)

    # ── Kapsam ──────────────────────────────────────────────────────────────
    scope: str = Column(
        String(16),
        nullable=False,
        comment="Ayar katmanı: admin | module | provider | user",
    )
    scope_id: str = Column(
        String(128),
        nullable=False,
        default="",
        comment=(
            "Kapsam tanımlayıcısı — scope'a göre değişir:\n"
            "  admin    → '' (boş)\n"
            "  module   → modül adı (ör. 'news_bulletin')\n"
            "  provider → provider adı (ör. 'elevenlabs')\n"
            "  user     → '' (boş; ileride user_id eklenebilir)"
        ),
    )

    # ── Anahtar / Değer ─────────────────────────────────────────────────────
    key: str = Column(
        String(128),
        nullable=False,
        comment="Ayar anahtarı (ör. 'tts_provider', 'voice_id', 'language')",
    )
    value: str = Column(
        Text,
        nullable=False,
        comment="JSON-encoded değer (ör. '\"edge_tts\"', '30', 'true', '[\"a\",\"b\"]')",
    )

    # ── Yönetim ─────────────────────────────────────────────────────────────
    locked: bool = Column(
        Boolean,
        nullable=False,
        default=False,
        comment="True ise kullanıcı bu ayarı override edemez (admin tarafından kilitlenir)",
    )
    description: str = Column(
        Text,
        nullable=True,
        comment="Ayar açıklaması — admin panelinde görüntülenir",
    )

    # ── Zaman ───────────────────────────────────────────────────────────────
    created_at: str = Column(
        String(32),
        nullable=False,
        default=_utcnow_iso,
    )
    updated_at: str = Column(
        String(32),
        nullable=False,
        default=_utcnow_iso,
        onupdate=_utcnow_iso,
    )

    # ── Benzersizlik ve İndeksler ───────────────────────────────────────────
    __table_args__ = (
        # scope + scope_id + key üçlüsü benzersiz olmalı
        Index(
            "uq_settings_scope_key",
            "scope", "scope_id", "key",
            unique=True,
        ),
        # Bir scope içindeki tüm anahtarları hızlı çekmek için
        Index("ix_settings_scope", "scope", "scope_id"),
    )

    def __repr__(self) -> str:
        scope_label = f"{self.scope}:{self.scope_id}" if self.scope_id else self.scope
        locked_flag = " 🔒" if self.locked else ""
        return f"<Setting {scope_label}.{self.key}={self.value[:30]}{locked_flag}>"
