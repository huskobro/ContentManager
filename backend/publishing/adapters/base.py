"""
BasePublishAdapter — Platform-agnostik yayın adapter'ı soyut arayüzü.

Her platform (YouTube, TikTok, Instagram, Facebook...) bu sınıftan türeyen
somut bir adapter sınıfı sağlar.

Adapter'lar durumsuz (stateless) tasarlanmıştır:
  - Tüm durum JobPublishTarget ve PlatformAccount üzerinden taşınır
  - DB oturumu orchestrator tarafından yönetilir, adapter tarafından değil
  - Adapter instance'ları paylaşılabilir / yeniden kullanılabilir

Bağımlılık yönü:
  publishing/orchestrator.py → publishing/adapters/base.py
  publishing/adapters/youtube_adapter.py → publishing/adapters/base.py
  pipeline/steps/publish.py → publishing/orchestrator.py
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class PublishError(Exception):
    """
    Platform-agnostik yayın hatası.

    Makine tarafından okunabilir hata kodu + insan okunabilir mesaj içerir.
    Orchestrator ve pipeline step bu hatayı yakalar ve loglara yazar.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"

    def __repr__(self) -> str:
        return f"PublishError(code={self.code!r}, message={self.message!r})"


class BasePublishAdapter(ABC):
    """
    Tüm platform publish adapter'larının soyut temel sınıfı.

    Alt sınıflar en az `publish()` ve `get_status()` metodlarını implement etmelidir.
    `health_check()` opsiyoneldir — varsayılan olarak True döner.

    Adapter Sözleşmesi:
      • publish()    — videoyu platforma yükle, harici ID döndür
      • get_status() — platforma göre işleme durumunu sorgula
      • health_check() — API erişilebilirlik testi (monitoring için)

    Hata Yönetimi:
      • Platform-spesifik hatalar (HttpError, APIException vb.) PublishError'a dönüştürülür
      • PublishError.code alanı makine tarafından okunabilir olmalıdır
        (ör. "YT_QUOTA_EXCEEDED", "TT_AUTH_FAILED")
    """

    # Alt sınıflar bu alanı PlatformAccount.platform değeriyle eşleşecek şekilde ayarlar
    platform: str = ""

    @abstractmethod
    async def publish(
        self,
        target: Any,                # JobPublishTarget ORM instance
        account: Any,               # PlatformAccount ORM instance
        video_path: str,
        metadata: dict[str, Any],
        privacy: str,
        progress_callback: Any,     # async callable(phase: str, percent: int | None)
    ) -> str:
        """
        Videoyu platforma yükle/yayınla.

        Args:
            target:            JobPublishTarget ORM satırı (hedef metadata).
            account:           PlatformAccount ORM satırı (kimlik bilgileri).
            video_path:        Son video dosyasının mutlak yolu.
            metadata:          normalize_metadata() çıktısı (title, description, tags, category_id).
            privacy:           "private" | "unlisted" | "public"
            progress_callback: async çağrılabilir (phase: str, percent: int | None).

        Returns:
            external_object_id — Platform tarafından atanan içerik ID'si
            (ör. YouTube video_id "dQw4w9WgXcQ").

        Raises:
            PublishError: Herhangi bir platform hatasında.
        """
        ...

    @abstractmethod
    async def get_status(
        self,
        target: Any,    # JobPublishTarget ORM instance
        account: Any,   # PlatformAccount ORM instance
    ) -> str:
        """
        Platform'dan anlık işleme durumunu sorgula.

        Returns:
            "processing" | "published" | "failed" | "unknown"

        Raises:
            PublishError: Durum sorgusu başarısız olursa.
        """
        ...

    def health_check(self) -> bool:
        """
        Platform API'sine erişilebilirliği test eder.

        Returns:
            True sağlıklıysa, False erişilemiyor ise.
            Hata fırlatmaz — yalnızca izleme (monitoring) amacıyla kullanılır.
        """
        return True
