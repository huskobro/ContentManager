"""
NewsSource ORM Modeli — Haber/RSS kaynakları.

Admin panelden yönetilebilir haber kaynakları. Her kaynak:
  - Bir URL (RSS feed veya haber sitesi)
  - Bir kategori (sistemdeki Category.key ile ilişkili, soft ref)
  - Aktif/pasif durumu
  - Dil bilgisi
  - Öncelik sırası (düşük sayı = yüksek öncelik)

Pipeline entegrasyonu:
  - news_bulletin modülü, _news_urls config boşsa aktif DB kaynaklarını kullanır
  - Kaynak kategorisi, haber scene category boşsa fallback olarak kullanılabilir

category_key:
  - Category tablosundaki key ile soft FK — JOIN yapılmaz, sadece string eşleştirme
  - Kategori silinirse kaynak etkilenmez (kaynak category_key taşır, sadece gösterim değişir)
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, Integer, String

from backend.database import Base


class NewsSource(Base):
    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Zorunlu alanlar
    name = Column(String(128), nullable=False)
    url = Column(String(1024), nullable=False, unique=True)

    # Kategori — Category.key ile soft FK
    # Boş bırakılabilir; pipeline'da fallback için kullanılır
    category_key = Column(String(64), nullable=True, default="")

    # Dil kodu (tr, en, de, ...)
    lang = Column(String(8), nullable=True, default="tr")

    # Aktif/pasif — pasif kaynaklar pipeline'a dahil edilmez
    enabled = Column(Boolean, nullable=False, default=True)

    # Öncelik sırası (ASC: düşük sayı = yüksek öncelik)
    sort_order = Column(Integer, nullable=False, default=0)

    # Metadata
    created_at = Column(String(32), nullable=False, default="")
    updated_at = Column(String(32), nullable=False, default="")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "category_key": self.category_key or "",
            "lang": self.lang or "tr",
            "enabled": self.enabled,
            "sort_order": self.sort_order,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
