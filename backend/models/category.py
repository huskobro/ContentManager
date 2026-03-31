"""
Category ORM Modeli — categories tablosu.

Her kategori bir icerik tipidir (genel, bilim, tarih, vb.).
Builtin (hardcoded'dan seed edilmis) ve custom (admin tarafindan olusturulmus)
kategoriler bu tabloda saklanir.

Tasarim:
  - is_builtin=True: Hardcoded seed, silinemez, enabled/icerik degistirilebilir
  - is_builtin=False: Admin olusturdu, tamamen silinebilir
  - key: URL-safe benzersiz kimlik (ornegin "science", "my_custom_cat")
  - enabled=False: Pipeline'da bu kategorinin enhancement blogu eklenmez
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text, UniqueConstraint

from backend.database import Base


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("key", name="uq_categories_key"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    key: str = Column(String(64), nullable=False, unique=True, index=True)
    name_tr: str = Column(String(128), nullable=False)
    name_en: str = Column(String(128), nullable=False)
    tone: str = Column(Text, nullable=False, default="")
    focus: str = Column(Text, nullable=False, default="")
    style_instruction: str = Column(Text, nullable=False, default="")
    enabled: bool = Column(Boolean, nullable=False, default=True)
    is_builtin: bool = Column(Boolean, nullable=False, default=False)
    sort_order: int = Column(Integer, nullable=False, default=0)
    created_at: str = Column(String(32), nullable=False, default=_utcnow)
    updated_at: str = Column(String(32), nullable=False, default=_utcnow, onupdate=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "key": self.key,
            "name_tr": self.name_tr,
            "name_en": self.name_en,
            "tone": self.tone,
            "focus": self.focus,
            "style_instruction": self.style_instruction,
            "enabled": self.enabled,
            "is_builtin": self.is_builtin,
            "sort_order": self.sort_order,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
