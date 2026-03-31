"""
YouTube Publish Adapter — Faz 11.1A

Mevcut youtube_upload_service.py mantığını Publishing Hub'a entegre eden ince sarmalayıcı.
Hiçbir upload/token mantığını KOPYALAMAZ — mevcut servisi delege eder.

_ChannelProxy:
  youtube_upload_service.py fonksiyonları (refresh_channel_token, upload_video_async,
  _build_credentials) YouTubeChannel ORM arayüzünü bekler. PlatformAccount bunun yerine
  geçtiğinde _ChannelProxy, credentials_json üzerinde şeffaf okuma/yazma sağlar.
  Böylece youtube_upload_service.py'de tek satır değişiklik yapılmadan
  PlatformAccount ile çalışılabilir.

Geriye dönük uyumluluk:
  YouTubeAdapter hem PlatformAccount hem de (legacy) YouTubeChannel nesnelerini
  kabul eder. account.credentials_json özelliği varsa PlatformAccount olarak,
  yoksa native YouTubeChannel olarak işlenir.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from backend.publishing.adapters.base import BasePublishAdapter, PublishError
from backend.utils.logger import get_logger

log = get_logger(__name__)


class YouTubeAdapter(BasePublishAdapter):
    """
    YouTube için publish adapter.

    Mevcut youtube_upload_service.py fonksiyonlarını delege eder:
      - refresh_channel_token() → token yenileme
      - upload_video_async()    → asenkron yükleme
      - normalize_metadata()    → metadata normalizer (platform-agnostic)

    Yeni platform eklemek isteyenler bu adapter'ı örnek alabilir.
    """

    platform = "youtube"

    async def publish(
        self,
        target: Any,
        account: Any,
        video_path: str,
        metadata: dict[str, Any],
        privacy: str,
        progress_callback: Any,
        db: Any = None,
    ) -> str:
        """
        YouTube Data API v3 ile video yükler.

        Args:
            target:            JobPublishTarget ORM instance (metadata referansı için).
            account:           PlatformAccount ORM instance (kimlik bilgileri için).
            video_path:        Son video dosyasının mutlak yolu.
            metadata:          normalize_metadata() çıktısı.
            privacy:           "private" | "unlisted" | "public"
            progress_callback: async callable(phase: str, percent: int | None).
            db:                SQLAlchemy Session (token refresh için opsiyonel).

        Returns:
            YouTube video_id (ör. "dQw4w9WgXcQ").

        Raises:
            PublishError: Herhangi bir yükleme hatasında.
        """
        from backend.services.youtube_upload_service import (
            YtUploadError,
            refresh_channel_token,
            upload_video_async,
        )

        if account is None:
            raise PublishError(
                "YT_NO_ACCOUNT",
                "YouTube yayını için PlatformAccount sağlanmadı.",
            )

        # Account'u duck-typed channel proxy'ye çevir
        channel_proxy = _build_channel_proxy(account)

        # Token gerekiyorsa yenile
        if db is not None:
            try:
                refresh_channel_token(channel_proxy, db)
            except YtUploadError as exc:
                raise PublishError(exc.code, exc.message) from exc

        try:
            video_id = await upload_video_async(
                channel=channel_proxy,
                video_path=video_path,
                metadata=metadata,
                privacy=privacy,
                progress_callback=progress_callback,
            )
            return video_id

        except YtUploadError as exc:
            raise PublishError(exc.code, exc.message) from exc

    async def get_status(self, target: Any, account: Any) -> str:
        """
        YouTube işleme durumunu sorgular.

        Şu an YouTube, yükleme sonrası basit bir status poll endpoint'i sunmuyor.
        Gelecekte videos.list(id=target.external_object_id) çağrısı eklenebilir.
        """
        return "unknown"

    def health_check(self) -> bool:
        """Google Client ID konfigüre edilmişse True döner."""
        try:
            from backend.services.youtube_upload_service import _get_client_id
            client_id = _get_client_id()
            return bool(client_id and client_id.strip())
        except Exception:
            return False


# ─── Channel Proxy ────────────────────────────────────────────────────────────


def _build_channel_proxy(account: Any) -> Any:
    """
    PlatformAccount veya YouTubeChannel nesnesini alır ve
    youtube_upload_service.py'nin beklediği arayüzü sunar.

    youtube_upload_service.py şu özelliklere erişir:
      channel.channel_id       (str, read)
      channel.access_token     (str, read/write)
      channel.refresh_token    (str, read/write)
      channel.token_expiry     (str, read/write)
      channel.updated_at       (str, read/write)

    PlatformAccount'ta access_token ayrı sütunda değil, credentials_json içindedir.
    _ChannelProxy bu dönüşümü şeffaf biçimde yapar.

    Eğer gelen nesne zaten doğal sütunlara sahipse (YouTubeChannel) proxy atlanır.
    """
    # YouTubeChannel kontrolü: access_token doğrudan sütun mu?
    if hasattr(account, "access_token") and not hasattr(account, "credentials_json"):
        return account  # Legacy YouTubeChannel — proxy gereksiz

    return _ChannelProxy(account)


class _ChannelProxy:
    """
    PlatformAccount → YouTubeChannel duck-type proxy.

    credentials_json içindeki token'ları YouTubeChannel sütun arayüzü ile sunar.
    Yazma işlemleri anında credentials_json'a yansıtılır; DB commit'ten sonra kalıcı olur.
    """

    def __init__(self, account: Any) -> None:
        self._account = account
        raw = getattr(account, "credentials_json", None) or "{}"
        try:
            self._creds: dict[str, str] = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            self._creds = {}

    def _persist(self) -> None:
        """Değişiklikleri account.credentials_json'a yazar."""
        self._account.credentials_json = json.dumps(self._creds, ensure_ascii=False)

    # ── YouTube Upload Service'in beklediği özellikler ────────────────────────

    @property
    def channel_id(self) -> str:
        return getattr(self._account, "external_account_id", "") or ""

    @property
    def access_token(self) -> str:
        return self._creds.get("access_token", "")

    @access_token.setter
    def access_token(self, value: str) -> None:
        self._creds["access_token"] = value or ""
        self._persist()

    @property
    def refresh_token(self) -> str:
        return self._creds.get("refresh_token", "")

    @refresh_token.setter
    def refresh_token(self, value: str) -> None:
        self._creds["refresh_token"] = value or ""
        self._persist()

    @property
    def token_expiry(self) -> str:
        return self._creds.get("token_expiry", "")

    @token_expiry.setter
    def token_expiry(self, value: str) -> None:
        self._creds["token_expiry"] = value or ""
        self._persist()

    @property
    def updated_at(self) -> str:
        return getattr(self._account, "updated_at", "") or ""

    @updated_at.setter
    def updated_at(self, value: str) -> None:
        if hasattr(self._account, "updated_at"):
            self._account.updated_at = value
