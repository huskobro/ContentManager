"""
Provider Registry — Sağlayıcıların merkezi kayıt defteri ve fallback zinciri.

Her provider register() ile kaydedilir. Pipeline step'leri execute_with_fallback()
ile çağırır — birincil provider başarısız olursa sıradaki denenir.

Fallback sırası:
  1. Admin panelinden ayarlanan sıralama (settings tablosu)
  2. Kayıt sırası (varsayılan)

Kullanım:
    from backend.providers.registry import provider_registry

    result = await provider_registry.execute_with_fallback(
        category="tts",
        input_data={"text": "Merhaba dünya", "voice": "tr-TR-AhmetNeural"},
        config=resolved_settings,
    )
"""

from __future__ import annotations

from typing import Any

from backend.providers.base import BaseProvider, ProviderCategory, ProviderResult
from backend.utils.logger import get_logger

log = get_logger(__name__)


class ProviderRegistry:
    """
    Tüm provider'ların merkezi kayıt defteri.

    Kategori bazlı depolama + fallback zinciriyle sıralı çalıştırma sağlar.
    """

    def __init__(self) -> None:
        # category_str → {provider_name: provider_instance}
        self._providers: dict[str, dict[str, BaseProvider]] = {}

    def register(self, provider: BaseProvider) -> None:
        """
        Bir provider'ı registry'ye kayıt eder.

        Args:
            provider: BaseProvider alt sınıfı instance'ı.

        Raises:
            ValueError: Provider name veya category boş ise.
        """
        if not provider.name:
            raise ValueError(f"Provider name boş: {provider.__class__.__name__}")

        cat = provider.category.value

        if cat not in self._providers:
            self._providers[cat] = {}

        if provider.name in self._providers[cat]:
            log.warning(
                "Provider zaten kayıtlı, üzerine yazılıyor",
                provider_name=provider.name,
                category=cat,
            )

        self._providers[cat][provider.name] = provider
        log.info(
            "Provider kayıt edildi",
            provider_name=provider.name,
            category=cat,
        )

    def get(self, category: str, name: str) -> BaseProvider | None:
        """İsim ve kategoriye göre tek bir provider döndürür."""
        return self._providers.get(category, {}).get(name)

    def list_category(self, category: str) -> list[BaseProvider]:
        """Bir kategorideki tüm provider'ları liste olarak döndürür."""
        return list(self._providers.get(category, {}).values())

    def list_all(self) -> dict[str, list[str]]:
        """Tüm kategorileri ve provider adlarını döndürür."""
        return {
            cat: list(providers.keys())
            for cat, providers in self._providers.items()
        }

    def get_ordered_providers(
        self,
        category: str,
        config: dict[str, Any],
    ) -> list[BaseProvider]:
        """
        Fallback sırasına göre sıralı provider listesi döndürür.

        Sıralama mantığı:
          1. config'de "{category}_fallback_order" varsa → o sıralama
          2. config'de "{category}_provider" varsa → onu öne al
          3. Yoksa → kayıt sırası

        Args:
            category: Provider kategorisi (ör. "tts", "llm", "visuals").
            config: Çözümlenmiş ayarlar.

        Returns:
            Sıralı BaseProvider listesi.
        """
        available = self._providers.get(category, {})
        if not available:
            return []

        # Yol 1: Explicit fallback sırası (admin panelden ayarlanmış)
        fallback_key = f"{category}_fallback_order"
        fallback_order = config.get(fallback_key)

        if fallback_order:
            # Virgülle ayrılmış string veya liste
            if isinstance(fallback_order, str):
                order_names = [n.strip() for n in fallback_order.split(",") if n.strip()]
            elif isinstance(fallback_order, list):
                order_names = fallback_order
            else:
                order_names = []

            ordered: list[BaseProvider] = []
            for name in order_names:
                provider = available.get(name)
                if provider:
                    ordered.append(provider)

            # Sırada olmayanları da ekle (fallback'in fallback'i)
            for name, provider in available.items():
                if provider not in ordered:
                    ordered.append(provider)

            return ordered

        # Yol 2: Config'deki varsayılan provider'ı öne al
        default_key = f"{category}_provider"
        default_name = config.get(default_key)

        # Genel "tts_provider", "llm_provider", "visuals_provider" anahtarları
        if not default_name:
            default_name = config.get(f"default_{category}_provider")

        if default_name and default_name in available:
            primary = available[default_name]
            others = [p for n, p in available.items() if n != default_name]
            return [primary] + others

        # Yol 3: Kayıt sırası
        return list(available.values())

    async def execute_with_fallback(
        self,
        category: str,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        Fallback zinciriyle provider çalıştırır.

        Birincil provider başarısız olursa sıradakini dener.
        Tüm provider'lar başarısız olursa son hatayı içeren
        ProviderResult(success=False) döner.

        Args:
            category: Provider kategorisi (ör. "tts").
            input_data: İşlem girdisi.
            config: Çözümlenmiş ayarlar.

        Returns:
            İlk başarılı provider'ın sonucu, veya tüm hatalar.
        """
        providers = self.get_ordered_providers(category, config)

        if not providers:
            return ProviderResult(
                success=False,
                provider_name="none",
                error=f"'{category}' kategorisinde kayıtlı provider yok.",
            )

        last_error = ""
        attempted: list[str] = []

        for provider in providers:
            attempted.append(provider.name)

            try:
                log.info(
                    "Provider çalıştırılıyor",
                    provider_name=provider.name,
                    category=category,
                )

                result = await provider.execute(input_data, config)

                if result.success:
                    if len(attempted) > 1:
                        log.info(
                            "Fallback başarılı",
                            provider_name=provider.name,
                            attempted=attempted,
                        )
                    return result

                # Provider result success=False döndürdü
                last_error = result.error or f"{provider.name} başarısız (reason unknown)"
                log.warning(
                    "Provider başarısız, fallback deneniyor",
                    provider_name=provider.name,
                    error=last_error[:200],
                    remaining=len(providers) - len(attempted),
                )

            except Exception as exc:
                last_error = f"{provider.name}: {str(exc)[:300]}"
                log.warning(
                    "Provider exception, fallback deneniyor",
                    provider_name=provider.name,
                    error=str(exc)[:200],
                    remaining=len(providers) - len(attempted),
                )

        # Tüm provider'lar başarısız
        return ProviderResult(
            success=False,
            provider_name=attempted[-1] if attempted else "none",
            error=(
                f"Tüm {category} provider'ları başarısız oldu. "
                f"Denenenler: {', '.join(attempted)}. "
                f"Son hata: {last_error}"
            ),
        )

    async def health_check_all(
        self,
        config: dict[str, Any],
    ) -> dict[str, dict[str, bool]]:
        """
        Tüm kayıtlı provider'ların sağlık kontrolünü yapar.

        Returns:
            {category: {provider_name: is_healthy}}
        """
        results: dict[str, dict[str, bool]] = {}

        for cat, providers in self._providers.items():
            results[cat] = {}
            for name, provider in providers.items():
                try:
                    healthy = await provider.health_check(config)
                    results[cat][name] = healthy
                except Exception:
                    results[cat][name] = False

        return results

    def __len__(self) -> int:
        return sum(len(providers) for providers in self._providers.values())

    def __repr__(self) -> str:
        cats = ", ".join(
            f"{cat}={len(ps)}" for cat, ps in self._providers.items()
        )
        return f"<ProviderRegistry {cats}>"


# ─────────────────────────────────────────────────────────────────────────────
# Tekil registry instance
# ─────────────────────────────────────────────────────────────────────────────

provider_registry = ProviderRegistry()


# ─────────────────────────────────────────────────────────────────────────────
# Provider kayıtları — Her yeni provider buraya eklenir
# ─────────────────────────────────────────────────────────────────────────────

def _register_all_providers() -> None:
    """
    Tüm mevcut provider'ları import edip registry'ye kayıt eder.

    Import-time çalışır. Yeni provider eklerken:
      1. providers/<kategori>/yeni_provider.py oluştur
      2. BaseProvider'dan türet
      3. Buraya import + register satırı ekle
    """
    # ── LLM Providers ───────────────────────────────────────────────────────
    # kie.ai birincil (önce kayıt = öncelikli fallback)
    from backend.providers.llm.kie_ai import KieAIProvider
    provider_registry.register(KieAIProvider())

    # ── TTS Providers ───────────────────────────────────────────────────────
    from backend.providers.tts.edge_tts_provider import EdgeTTSProvider
    provider_registry.register(EdgeTTSProvider())

    # ── Visuals Providers ───────────────────────────────────────────────────
    from backend.providers.visuals.pexels import PexelsProvider
    provider_registry.register(PexelsProvider())


_register_all_providers()
