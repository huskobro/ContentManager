"""
Modül Registry — Tüm içerik modüllerinin merkezi kayıt defteri.

Explicit import pattern: Her modül burada import edilir ve registry'ye eklenir.
Otomatik keşfetme (auto-discovery) yapılmaz — basitlik ve okunabilirlik için
her yeni modül bu dosyaya bir satır import + register ekler.

Kullanım:
    from backend.modules.registry import module_registry, get_module

    # Tüm kayıtlı modüller
    all_modules = module_registry.list_modules()

    # Tek modül al
    std_video = get_module("standard_video")
    steps = std_video.get_pipeline_steps()
"""

from __future__ import annotations

from backend.modules.base import ContentModule
from backend.utils.logger import get_logger

log = get_logger(__name__)


class ModuleRegistry:
    """
    İçerik modüllerinin merkezi kayıt defteri.

    Her modül register() ile eklenir, get() ile sorgulanır.
    Aynı isimle tekrar kayıt yapılırsa uyarı loglanır ve üzerine yazılır.
    """

    def __init__(self) -> None:
        self._modules: dict[str, ContentModule] = {}

    def register(self, module: ContentModule) -> None:
        """
        Bir modülü registry'ye kayıt eder.

        Args:
            module: ContentModule alt sınıfı instance'ı.

        Raises:
            ValueError: Modül name boş ise.
        """
        if not module.name:
            raise ValueError(
                f"Modül name boş olamaz: {module.__class__.__name__}"
            )

        if module.name in self._modules:
            log.warning(
                "Modül zaten kayıtlı, üzerine yazılıyor",
                module_name=module.name,
            )

        self._modules[module.name] = module
        log.info(
            "Modül kayıt edildi",
            module_name=module.name,
            display_name=module.display_name,
            capabilities=len(module.capabilities),
            steps=len(module.get_pipeline_steps()),
        )

    def get(self, name: str) -> ContentModule | None:
        """
        İsme göre modül döndürür.

        Returns:
            ContentModule instance'ı, veya bulunamazsa None.
        """
        return self._modules.get(name)

    def list_modules(self) -> list[ContentModule]:
        """Kayıtlı tüm modülleri liste olarak döndürür."""
        return list(self._modules.values())

    def list_names(self) -> list[str]:
        """Kayıtlı tüm modül adlarını döndürür."""
        return list(self._modules.keys())

    def is_registered(self, name: str) -> bool:
        """Belirtilen modül kayıtlı mı?"""
        return name in self._modules

    def __len__(self) -> int:
        return len(self._modules)

    def __repr__(self) -> str:
        names = ", ".join(self._modules.keys())
        return f"<ModuleRegistry modules=[{names}]>"


# ─────────────────────────────────────────────────────────────────────────────
# Tekil registry instance
# ─────────────────────────────────────────────────────────────────────────────

module_registry = ModuleRegistry()


def get_module(name: str) -> ContentModule | None:
    """Registry'den modül almak için kısayol fonksiyon."""
    return module_registry.get(name)


# ─────────────────────────────────────────────────────────────────────────────
# Modül kayıtları — Her yeni modül buraya import + register eklenir
# ─────────────────────────────────────────────────────────────────────────────

def _register_all_modules() -> None:
    """
    Tüm mevcut modülleri import edip registry'ye kayıt eder.

    Bu fonksiyon modül düzeyinde çağrılır (import-time).
    Yeni modül eklerken:
      1. backend/modules/yeni_modul/ klasörü oluştur
      2. __init__.py'de modül instance'ını export et
      3. Buraya import + register satırı ekle
    """
    # Standard Video modülü
    from backend.modules.standard_video import standard_video_module
    module_registry.register(standard_video_module)

    # News Bulletin modülü
    from backend.modules.news_bulletin import news_bulletin_module
    module_registry.register(news_bulletin_module)

    # Product Review modülü
    from backend.modules.product_review import product_review_module
    module_registry.register(product_review_module)


# Import-time kayıt
_register_all_modules()
