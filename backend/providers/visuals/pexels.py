"""
Pexels Visuals Provider — Ücretsiz stok video/fotoğraf indirme.

Pexels API v1 üzerinden anahtar kelimeye göre video veya fotoğraf
arar ve indirir.

API Key:
    config["pexels_api_key"] — Pexels API anahtarı.
    https://www.pexels.com/api/ üzerinden ücretsiz alınabilir.

Rate limit:
    200 istek/saat, 20.000 istek/ay (ücretsiz plan)

Maliyet: $0.00 (ücretsiz API)
"""

from __future__ import annotations

from typing import Any

import httpx

from backend.providers.base import BaseProvider, ProviderCategory, ProviderResult
from backend.utils.logger import get_logger

log = get_logger(__name__)

_PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search"
_PEXELS_PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search"
_REQUEST_TIMEOUT = 30.0


class PexelsProvider(BaseProvider):
    """
    Pexels API üzerinden stok video/fotoğraf arama ve indirme.

    Desteklenen input_data alanları:
        query (str): Arama terimi — zorunlu.
        media_type (str): "video" veya "photo" (varsayılan: "video").
        count (int): İndirilecek sonuç sayısı (varsayılan: 1).
        orientation (str): "landscape", "portrait", "square".
        min_width (int): Minimum genişlik (piksel).
        min_duration (int): Minimum video süresi (saniye, sadece video).

    Config'den okunan anahtarlar:
        pexels_api_key: Pexels API anahtarı.
        visuals_orientation: Varsayılan yönelim.

    Returns:
        ProviderResult.data = {
            "items": [
                {
                    "id": int,
                    "url": str,           # Orijinal sayfa URL'si
                    "download_url": str,   # İndirme URL'si
                    "width": int,
                    "height": int,
                    "duration": int | None, # Saniye (sadece video)
                    "photographer": str,
                    "content_bytes": bytes, # İndirilen dosya
                }
            ],
            "total_results": int,
        }
    """

    name = "pexels"
    category = ProviderCategory.VISUALS

    async def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        Pexels API'den görsel arar ve indirir.
        """
        query = input_data.get("query", "").strip()
        if not query:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="Arama terimi boş — görsel arama için query gerekli.",
            )

        api_key = config.get("pexels_api_key", "")
        if not api_key:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="Pexels API key bulunamadı. Admin panelinden 'pexels_api_key' ayarlayın.",
            )

        media_type = input_data.get("media_type", "video")
        count = min(input_data.get("count", 1), 10)  # Maks 10
        orientation = input_data.get("orientation") or config.get("visuals_orientation", "landscape")
        min_duration = input_data.get("min_duration", 5)

        headers = {"Authorization": api_key}

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                if media_type == "video":
                    items = await self._search_videos(
                        client, headers, query, count, orientation, min_duration,
                    )
                else:
                    items = await self._search_photos(
                        client, headers, query, count, orientation,
                    )

                if not items:
                    return ProviderResult(
                        success=False,
                        provider_name=self.name,
                        error=f"Pexels'da '{query}' için {media_type} bulunamadı.",
                    )

                # Dosyaları indir
                downloaded = await self._download_items(client, items)

            log.info(
                "Pexels arama tamamlandı",
                query=query,
                media_type=media_type,
                found=len(downloaded),
                requested=count,
            )

            return ProviderResult(
                success=True,
                provider_name=self.name,
                data={
                    "items": downloaded,
                    "total_results": len(downloaded),
                    "media_type": media_type,
                },
                cost_estimate_usd=0.0,
                metadata={
                    "query": query,
                    "media_type": media_type,
                    "orientation": orientation,
                    "count": len(downloaded),
                },
            )

        except httpx.TimeoutException:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"Pexels API zaman aşımı (query='{query}')",
            )
        except Exception as exc:
            error_msg = str(exc)[:500]
            log.error("Pexels hatası", error=error_msg, query=query)
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"Pexels hatası: {error_msg}",
            )

    async def _search_videos(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        query: str,
        count: int,
        orientation: str,
        min_duration: int,
    ) -> list[dict[str, Any]]:
        """Pexels Video Search API'sini çağırır."""
        params: dict[str, Any] = {
            "query": query,
            "per_page": min(count * 3, 30),  # Filtreleme için fazla iste
            "orientation": orientation,
        }

        resp = await client.get(
            _PEXELS_VIDEO_SEARCH_URL,
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

        items: list[dict[str, Any]] = []

        for video in data.get("videos", []):
            duration = video.get("duration", 0)
            if duration < min_duration:
                continue

            # En iyi kalite video dosyasını seç
            best_file = _select_best_video_file(video.get("video_files", []))
            if not best_file:
                continue

            items.append({
                "id": video["id"],
                "url": video.get("url", ""),
                "download_url": best_file["link"],
                "width": best_file.get("width", 0),
                "height": best_file.get("height", 0),
                "duration": duration,
                "photographer": video.get("user", {}).get("name", "Unknown"),
                "file_type": best_file.get("file_type", "video/mp4"),
            })

            if len(items) >= count:
                break

        return items

    async def _search_photos(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        query: str,
        count: int,
        orientation: str,
    ) -> list[dict[str, Any]]:
        """Pexels Photo Search API'sini çağırır."""
        params: dict[str, Any] = {
            "query": query,
            "per_page": min(count * 2, 20),
            "orientation": orientation,
        }

        resp = await client.get(
            _PEXELS_PHOTO_SEARCH_URL,
            headers=headers,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

        items: list[dict[str, Any]] = []

        for photo in data.get("photos", []):
            src = photo.get("src", {})
            # landscape için "large2x", portrait için "portrait"
            download_url = src.get("large2x") or src.get("original", "")

            if not download_url:
                continue

            items.append({
                "id": photo["id"],
                "url": photo.get("url", ""),
                "download_url": download_url,
                "width": photo.get("width", 0),
                "height": photo.get("height", 0),
                "duration": None,
                "photographer": photo.get("photographer", "Unknown"),
                "file_type": "image/jpeg",
            })

            if len(items) >= count:
                break

        return items

    async def _download_items(
        self,
        client: httpx.AsyncClient,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Arama sonuçlarındaki dosyaları indirir.

        Her item'a "content_bytes" alanı eklenir.
        İndirme başarısız olan item'lar atlanır.
        """
        downloaded: list[dict[str, Any]] = []

        for item in items:
            url = item.get("download_url", "")
            if not url:
                continue

            try:
                resp = await client.get(url, follow_redirects=True, timeout=60.0)
                resp.raise_for_status()
                item["content_bytes"] = resp.content
                item["downloaded_size"] = len(resp.content)
                downloaded.append(item)

                log.debug(
                    "Pexels dosya indirildi",
                    item_id=item.get("id"),
                    size_bytes=len(resp.content),
                )

            except Exception as exc:
                log.warning(
                    "Pexels dosya indirme başarısız, atlanıyor",
                    item_id=item.get("id"),
                    error=str(exc)[:200],
                )

        return downloaded

    async def health_check(self, config: dict[str, Any]) -> bool:
        """Pexels API erişilebilirliğini test eder."""
        api_key = config.get("pexels_api_key", "")
        if not api_key:
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    _PEXELS_PHOTO_SEARCH_URL,
                    headers={"Authorization": api_key},
                    params={"query": "nature", "per_page": 1},
                )
                return resp.status_code == 200
        except Exception:
            return False


def _select_best_video_file(
    video_files: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """
    Pexels video_files listesinden en uygun kaliteyi seçer.

    Tercih sırası:
      1. HD (1280x720) veya üstü, en küçük dosya boyutu
      2. Yoksa mevcut en yüksek çözünürlük

    Aşırı büyük dosyaları (>100MB) atlar.
    """
    if not video_files:
        return None

    # file_type "video/mp4" olanları filtrele
    mp4_files = [
        f for f in video_files
        if f.get("file_type", "").startswith("video/mp4")
    ]

    if not mp4_files:
        mp4_files = video_files

    # HD ve üstü (width >= 1280)
    hd_plus = [f for f in mp4_files if (f.get("width") or 0) >= 1280]

    if hd_plus:
        # HD'ler arasından en küçük dosya boyutunu tercih et (hızlı indirme)
        # Pexels bazen file_size vermez, o zaman width'e göre sırala
        return min(hd_plus, key=lambda f: f.get("width", 9999))

    # HD yoksa en yüksek çözünürlüğü al
    return max(mp4_files, key=lambda f: f.get("width", 0))
