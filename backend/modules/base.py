"""
İçerik Modülü Temel Sınıfı ve Capability Tanımları.

Her içerik tipi (standard_video, news_bulletin, product_review) bir ContentModule
alt sınıfıdır. Modül, capability'leri ve pipeline adımlarını tanımlar.

Capability: Bir modülün desteklediği işlem türü (script üretimi, TTS, vb.).
PipelineStepDef: Pipeline runner'a verilen adım tanımı — key, label, sıra ve
                 çalıştırılacak async fonksiyon.

Tasarım kararları:
    • ABC kullanılıyor — her modül get_pipeline_steps() implement etmek zorunda
    • Capability enum string-based — JSON/SQLite serialization kolay
    • PipelineStepDef dataclass — runtime'da tip kontrolü ve okunabilirlik
    • Modüller kendi config'lerini get_default_config() ile sağlar
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine


class Capability(str, Enum):
    """
    Bir içerik modülünün destekleyebileceği işlem türleri.

    Her capability bir pipeline adımına karşılık gelir.
    Admin panelinden capability bazında aktif/pasif toggle yapılabilir.
    """

    SCRIPT_GENERATION = "script_generation"
    METADATA_GENERATION = "metadata_generation"
    TTS = "tts"
    VISUALS = "visuals"
    SUBTITLES = "subtitles"
    COMPOSITION = "composition"
    THUMBNAIL = "thumbnail"
    PUBLISH = "publish"


# Pipeline adım çalıştırma fonksiyonu tip tanımı:
# async def execute(job_id, step_key, config, cache) -> dict
StepExecutor = Callable[..., Coroutine[Any, Any, dict[str, Any]]]


@dataclass
class PipelineStepDef:
    """
    Bir pipeline adımının tanımı.

    Pipeline runner bu tanımları sırasıyla alır ve çalıştırır.
    Her adım bağımsız bir async fonksiyon tarafından yürütülür.

    Attributes:
        key: Benzersiz adım anahtarı (ör. "script", "tts").
        label: UI'da görüntülenen okunabilir ad.
        order: Sıralama indeksi (0-tabanlı).
        capability: Bu adımın ilişkili olduğu capability.
        execute: Adımı çalıştıran async fonksiyon.
        is_fatal: True ise bu adım başarısız olduğunda job fail olur.
                  False ise adım atlanır (skipped) ve pipeline devam eder.
        default_provider: Bu adım için varsayılan provider adı (opsiyonel).
    """

    key: str
    label: str
    order: int
    capability: Capability
    execute: StepExecutor
    is_fatal: bool = True
    default_provider: str | None = None


class ContentModule(ABC):
    """
    Tüm içerik modüllerinin temel sınıfı.

    Her modül şunları tanımlar:
      • name: Benzersiz modül adı (ör. "standard_video")
      • display_name: UI'da görüntülenen ad
      • description: Modül açıklaması
      • capabilities: Desteklenen capability listesi
      • get_pipeline_steps(): Pipeline adım tanımları
      • get_default_config(): Modüle özgü varsayılan ayarlar

    Alt sınıflar backend/modules/<modul_adi>/ altında yaşar ve
    registry'ye explicit import ile kayıt edilir.
    """

    # ── Alt sınıfların override etmesi gereken class-level alanlar ──────────

    name: str = ""
    display_name: str = ""
    description: str = ""
    capabilities: list[Capability] = []

    # ── Abstract metotlar ───────────────────────────────────────────────────

    @abstractmethod
    def get_pipeline_steps(self) -> list[PipelineStepDef]:
        """
        Bu modülün pipeline adımlarını sıralı liste olarak döndürür.

        Her PipelineStepDef bir async execute fonksiyonu içerir.
        Pipeline runner bu listeyi alıp sırasıyla çalıştırır.

        Returns:
            Sıralı PipelineStepDef listesi.
        """
        ...

    @abstractmethod
    def get_default_config(self) -> dict[str, Any]:
        """
        Modüle özgü varsayılan ayarları döndürür.

        Bu değerler 5 katmanlı hiyerarşinin "module" katmanında
        bootstrap olarak kullanılır.

        Returns:
            key → value sözlüğü.
        """
        ...

    # ── Yardımcı metotlar ───────────────────────────────────────────────────

    def has_capability(self, cap: Capability) -> bool:
        """Bu modül belirtilen capability'ye sahip mi?"""
        return cap in self.capabilities

    def get_step_keys(self) -> list[str]:
        """Pipeline adım anahtarlarını sıralı liste olarak döndürür."""
        return [step.key for step in self.get_pipeline_steps()]

    def get_step_definitions_for_db(self) -> list[dict[str, str | int]]:
        """
        JobManager'ın job_steps tablosuna yazacağı formatta
        adım tanımlarını döndürür.

        Returns:
            [{"key": "script", "label": "Senaryo Üretimi", "order": 0}, ...]
        """
        return [
            {"key": step.key, "label": step.label, "order": step.order}
            for step in self.get_pipeline_steps()
        ]

    def __repr__(self) -> str:
        caps = ", ".join(c.value for c in self.capabilities)
        return f"<{self.__class__.__name__} name={self.name} caps=[{caps}]>"
