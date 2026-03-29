"""
Edge TTS Provider — Microsoft Edge'in ücretsiz TTS servisi.

API key gerektirmez. edge-tts Python paketi üzerinden async olarak
ses sentezi yapar. Word-level timing bilgisi de döndürür.

Desteklenen sesler (Türkçe):
    tr-TR-AhmetNeural, tr-TR-EmelNeural

Maliyet: $0.00 (ücretsiz servis)

Kütüphane: edge-tts (v7+)
    • Communicate sınıfı ile async streaming
    • WordBoundary event'leri ile kelime-seviye zamanlama
    • MP3 formatında ses çıktısı
"""

from __future__ import annotations

import io
import struct
from typing import Any

import edge_tts

from backend.providers.base import BaseProvider, ProviderCategory, ProviderResult
from backend.utils.logger import get_logger

log = get_logger(__name__)


class EdgeTTSProvider(BaseProvider):
    """
    Microsoft Edge TTS üzerinden ücretsiz ses sentezi.

    Desteklenen input_data alanları:
        text (str): Sentezlenecek metin — zorunlu.
        voice (str): Ses kimliği (ör. "tr-TR-AhmetNeural").
        rate (str): Hız ayarı (ör. "+0%", "+20%", "-10%").
        volume (str): Ses seviyesi (ör. "+0%", "+10%").
        pitch (str): Perde ayarı (ör. "+0Hz", "+10Hz").

    Config'den okunan anahtarlar:
        tts_voice: Varsayılan ses kimliği.
        tts_speed: Hız çarpanı (1.0 = normal).

    Returns:
        ProviderResult.data = {
            "audio_bytes": bytes,     # MP3 ses verisi
            "word_timings": list,     # Kelime-seviye zamanlama
            "duration_ms": int,       # Tahmini toplam süre
        }
    """

    name = "edge_tts"
    category = ProviderCategory.TTS

    async def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        Edge TTS ile ses sentezi yapar.

        Args:
            input_data: {"text": str, "voice"?: str, "rate"?: str}
            config: Çözümlenmiş ayarlar.

        Returns:
            ProviderResult — data alanında audio_bytes ve word_timings.
        """
        text = input_data.get("text", "").strip()
        if not text:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="Metin boş — TTS sentezi için metin gerekli.",
            )

        # Ses ve hız ayarları
        voice = input_data.get("voice") or config.get("tts_voice", "tr-TR-AhmetNeural")
        speed_multiplier = float(config.get("tts_speed", 1.0))
        rate = input_data.get("rate")
        if not rate:
            if speed_multiplier != 1.0:
                pct = int((speed_multiplier - 1.0) * 100)
                rate = f"+{pct}%" if pct >= 0 else f"{pct}%"
            else:
                rate = "+0%"

        volume = input_data.get("volume", "+0%")
        pitch = input_data.get("pitch", "+0Hz")

        try:
            # Communicate nesnesi — WordBoundary event'leri için boundary parametresi
            communicate = edge_tts.Communicate(
                text=text,
                voice=voice,
                rate=rate,
                volume=volume,
                pitch=pitch,
                boundary="WordBoundary",
            )

            # Streaming: ses verisi ve zamanlama bilgilerini topla
            audio_chunks: list[bytes] = []
            word_timings: list[dict[str, Any]] = []
            last_offset_ms = 0

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    offset_us = chunk["offset"]   # mikrosaniye
                    duration_us = chunk["duration"]  # mikrosaniye
                    word_text = chunk["text"]

                    offset_ms = offset_us / 10_000  # 100-nanosecond units → ms
                    duration_ms = duration_us / 10_000

                    word_timings.append({
                        "word": word_text,
                        "start_ms": round(offset_ms, 1),
                        "end_ms": round(offset_ms + duration_ms, 1),
                        "duration_ms": round(duration_ms, 1),
                    })

                    last_offset_ms = max(last_offset_ms, offset_ms + duration_ms)

            # Ses verisini birleştir
            audio_bytes = b"".join(audio_chunks)

            if not audio_bytes:
                return ProviderResult(
                    success=False,
                    provider_name=self.name,
                    error=f"Edge TTS ses verisi üretemedi (voice={voice}, text_len={len(text)})",
                )

            # Tahmini süre (MP3 header'dan veya son word timing'den)
            estimated_duration_ms = int(last_offset_ms) if last_offset_ms > 0 else _estimate_mp3_duration_ms(audio_bytes)

            log.info(
                "Edge TTS sentez tamamlandı",
                voice=voice,
                text_length=len(text),
                audio_size_bytes=len(audio_bytes),
                word_count=len(word_timings),
                duration_ms=estimated_duration_ms,
            )

            return ProviderResult(
                success=True,
                provider_name=self.name,
                data={
                    "audio_bytes": audio_bytes,
                    "word_timings": word_timings,
                    "duration_ms": estimated_duration_ms,
                    "format": "mp3",
                },
                cost_estimate_usd=0.0,  # Ücretsiz
                metadata={
                    "voice": voice,
                    "rate": rate,
                    "text_length": len(text),
                    "audio_size_bytes": len(audio_bytes),
                    "word_count": len(word_timings),
                },
            )

        except Exception as exc:
            error_msg = str(exc)[:500]
            log.error(
                "Edge TTS hatası",
                error=error_msg,
                voice=voice,
            )
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"Edge TTS hatası: {error_msg}",
            )

    async def health_check(self, config: dict[str, Any]) -> bool:
        """
        Edge TTS'in erişilebilir olup olmadığını test eder.

        Kısa bir metin sentezleyerek kontrol yapar.
        """
        try:
            comm = edge_tts.Communicate(text="test", voice="en-US-AriaNeural")
            audio_data = b""
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
                    if len(audio_data) > 100:
                        return True
            return len(audio_data) > 0
        except Exception:
            return False


def _estimate_mp3_duration_ms(audio_bytes: bytes) -> int:
    """
    MP3 verisinden tahmini süre hesaplar.

    Basit yaklaşım: dosya boyutu / ortalama bitrate.
    Edge TTS genellikle ~48 kbps MP3 üretir.
    """
    if not audio_bytes:
        return 0
    # Ortalama bitrate: 48 kbps → 6 KB/s
    bytes_per_ms = 6.0
    return int(len(audio_bytes) / bytes_per_ms)
