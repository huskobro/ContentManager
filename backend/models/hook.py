"""
Hook ORM Modeli — hooks tablosu.

Her hook bir acilis talimat tipidir (shocking_fact, question, vb.).
Dil bazli ayri kayitlar saklanir (tr ve en farkli template'lere sahip olabilir).

Tasarim:
  - is_builtin=True: Hardcoded seed, silinemez, icerik degistirilebilir
  - is_builtin=False: Admin olusturdu, tamamen silinebilir
  - (type, lang) cifti benzersizdir
  - enabled=False: Pipeline hook havuzundan cikarilir
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text, UniqueConstraint

from backend.database import Base


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Hook(Base):
    __tablename__ = "hooks"
    __table_args__ = (
        UniqueConstraint("type", "lang", name="uq_hooks_type_lang"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    type: str = Column(String(64), nullable=False, index=True)
    lang: str = Column(String(8), nullable=False, index=True)
    name: str = Column(String(128), nullable=False)
    template: str = Column(Text, nullable=False)
    enabled: bool = Column(Boolean, nullable=False, default=True)
    is_builtin: bool = Column(Boolean, nullable=False, default=False)
    sort_order: int = Column(Integer, nullable=False, default=0)
    created_at: str = Column(String(32), nullable=False, default=_utcnow)
    updated_at: str = Column(String(32), nullable=False, default=_utcnow, onupdate=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "lang": self.lang,
            "name": self.name,
            "template": self.template,
            "enabled": self.enabled,
            "is_builtin": self.is_builtin,
            "sort_order": self.sort_order,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
