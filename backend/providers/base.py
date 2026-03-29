"""
Provider Temel Sınıfı ve Dönüş Modeli.

Tüm harici servis sağlayıcıları (LLM, TTS, Visuals, Composition) bu
dosyadaki BaseProvider ABC sınıfından türer.

Tasarım kararları:
    • Her provider async execute() ile çağrılır — I/O-bound işlemler doğası gereği async
    • ProviderResult Pydantic modeli — başarı/hata/çıktı/maliyet bilgisini standartlaştırır
    • health_check() opsiyonel — API erişilebilirliğini test eder
    • ProviderCategory enum — registry'de kategorize etmek için
    • Config dict olarak gelir — provider kendi ihtiyacı olan anahtarları okur

Kullanım:
    class GeminiProvider(BaseProvider):
        name = "gemini"
        category = ProviderCategory.LLM

        async def execute(self, input_data, config) -> ProviderResult:
            ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProviderCategory(str, Enum):
    """Sağlayıcı kategorileri."""

    LLM = "llm"
    TTS = "tts"
    VISUALS = "visuals"
    COMPOSITION = "composition"
    SUBTITLES = "subtitles"


class ProviderResult(BaseModel):
    """
    Bir provider çağrısının standart dönüş modeli.

    Tüm provider execute() metodları bu modeli döndürür.
    Pipeline runner bu modelden success, data ve cost bilgisini okur.

    Attributes:
        success: İşlem başarılı mı?
        provider_name: Kullanılan provider adı.
        data: İşlem çıktısı (dict, list, string vb. — provider'a göre değişir).
        error: Hata mesajı (success=False ise).
        cost_estimate_usd: Tahmini API maliyeti (USD).
        metadata: Provider'a özgü ek bilgiler (model, token sayısı, vb.).
    """

    success: bool = Field(description="İşlem başarılı mı?")
    provider_name: str = Field(description="Kullanılan provider adı")
    data: Any = Field(default=None, description="İşlem çıktısı")
    error: str | None = Field(default=None, description="Hata mesajı")
    cost_estimate_usd: float = Field(default=0.0, description="Tahmini API maliyeti")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider'a özgü ek bilgiler",
    )


class BaseProvider(ABC):
    """
    Tüm sağlayıcıların temel sınıfı.

    Alt sınıflar:
      • name: Benzersiz provider adı (ör. "gemini", "edge_tts", "pexels")
      • category: ProviderCategory enum değeri
      • execute(): Asıl işi yapan async metot
      • health_check(): API erişilebilirlik testi (opsiyonel)
    """

    name: str = ""
    category: ProviderCategory = ProviderCategory.LLM

    @abstractmethod
    async def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        Provider'ın ana iş mantığını çalıştırır.

        Args:
            input_data: İşlem girdisi — step'e göre değişir.
                LLM:     {"prompt": str, "system_instruction": str, ...}
                TTS:     {"text": str, "voice": str, ...}
                Visuals: {"query": str, "count": int, ...}
            config: Çözümlenmiş ayarlar (API key dahil).

        Returns:
            ProviderResult — başarı durumu, çıktı verisi, maliyet.

        Raises:
            Herhangi bir hata ProviderResult(success=False) ile döndürülmeli,
            ancak ağ hataları vb. exception olarak da fırlatılabilir —
            fallback mekanizması yakalar.
        """
        ...

    async def health_check(self, config: dict[str, Any]) -> bool:
        """
        Provider'ın erişilebilir olup olmadığını test eder.

        Varsayılan implementasyon her zaman True döner.
        Alt sınıflar gerçek API ping'i yapabilir.

        Args:
            config: API key vb. ayarları içeren dict.

        Returns:
            True ise provider erişilebilir.
        """
        return True

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} name={self.name} category={self.category.value}>"
