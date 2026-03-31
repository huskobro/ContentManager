"""
CategoryStyleMapping ORM Modeli — Kategori → BulletinStyle eşleşmesi.

Admin panelden yönetilebilir kategori→stil eşleşmesi.

Çalışma mantığı:
  - Pipeline, scene.category değerini alır
  - Bu tabloda eşleşen bir kategori varsa bulletin_style override edilir
  - Eşleşme yoksa global default bulletin_style kullanılır
  - Eşleşme sistemi kapatılırsa (category_style_mapping_enabled=False) hiçbiri uygulanmaz

category_key:
  - Category tablosundaki key ile soft FK
  - Örn: "spor" → "sport", "teknoloji" → "tech"
  - Ayrıca serbest string de olabilir (LLM ürettiği category değerleri için)

bulletin_style:
  - NewsBulletin composition'da kabul edilen stil enum değeri
  - breaking | tech | corporate | sport | finance | weather | science | entertainment | dark

Öncelik zinciri (composition.py'de uygulanır):
  1. User job-level override (config.bulletin_style varsa)
  2. CategoryStyleMapping (category_style_mapping_enabled=True ve eşleşme varsa)
  3. Global default (config.get("bulletin_style", "corporate"))
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, Integer, String

from backend.database import Base

# Geçerli BulletinStyle değerleri (remotion/src/types.ts ile senkron)
VALID_BULLETIN_STYLES = frozenset({
    "breaking", "tech", "corporate", "sport",
    "finance", "weather", "science", "entertainment", "dark",
})


class CategoryStyleMapping(Base):
    __tablename__ = "category_style_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Eşleşme anahtarı — hem Category.key hem de LLM ürettiği serbest string
    # Karşılaştırma lowercase yapılır
    category_key = Column(String(64), nullable=False, unique=True)

    # Hedef BulletinStyle
    bulletin_style = Column(String(32), nullable=False, default="corporate")

    # Açıklama (admin için)
    description = Column(String(256), nullable=True, default="")

    # Aktif/pasif — pasif eşleşmeler uygulanmaz
    enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(String(32), nullable=False, default="")
    updated_at = Column(String(32), nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category_key": self.category_key,
            "bulletin_style": self.bulletin_style,
            "description": self.description or "",
            "enabled": self.enabled,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
