"""
TTS Provider Capability Model — Sağlayıcı yetenek tanımları.

Her TTS sağlayıcısının word timing, hız kontrolü ve altyazı
entegrasyonu yeteneklerini tanımlar.

Bu model sayesinde:
  - Subtitle step hangi zamanlama stratejisini kullanacağını bilir
  - apply_speed() sadece gerektiğinde çağrılır (pre-synthesis hız
    desteği olmayan sağlayıcılarda)
  - Yeni sağlayıcı eklendiğinde capability tanımı yeterli olur,
    subtitle zinciri değişmez

Kullanım:
    from backend.providers.tts.capabilities import get_tts_capabilities
    caps = get_tts_capabilities("edge_tts")
    if caps.supports_word_timing:
        # TTS word timing kullan
    elif caps.requires_alignment_fallback:
        # Whisper veya greedy alignment kullan
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class TTSCapability:
    """Bir TTS sağlayıcısının yetenek tanımı."""

    # --- Word timing ---
    supports_word_timing: bool
    """Doğal kelime-seviye zamanlama desteği (ör. Edge TTS WordBoundary)."""

    word_timing_format: Literal["word_boundary_ms", "whisper_json", "none"]
    """Word timing formatı: word_boundary_ms (Edge), whisper_json (Whisper API uyumlu), none."""

    supports_sentence_timing: bool
    """Cümle-seviye zamanlama desteği."""

    # --- Hız ---
    supports_pre_synthesis_speed: bool
    """TTS API'si üzerinden hız parametresi desteği (ör. Edge TTS rate)."""

    requires_post_synthesis_speed: bool
    """Post-synthesis ffmpeg atempo gerekiyor mu (pre-synthesis yoksa)."""

    # --- Altyazı stratejisi ---
    requires_alignment_fallback: bool
    """Word timing yoksa Whisper/greedy alignment fallback gerekiyor mu."""

    recommended_subtitle_strategy: Literal[
        "tts_word_timing",
        "whisper_api",
        "whisper_greedy",
        "equal_distribution",
    ]
    """Bu sağlayıcı için önerilen altyazı zamanlama stratejisi."""

    # --- Bilgi ---
    timing_quality: Literal["excellent", "good", "none"]
    """Word timing kalitesi."""

    notes: str = ""
    """Ek açıklamalar."""


# ─── Provider Capability Tanımları ──────────────────────────────────────────

_TTS_CAPABILITIES: dict[str, TTSCapability] = {
    "edge_tts": TTSCapability(
        supports_word_timing=True,
        word_timing_format="word_boundary_ms",
        supports_sentence_timing=True,
        supports_pre_synthesis_speed=True,
        requires_post_synthesis_speed=False,
        requires_alignment_fallback=False,
        recommended_subtitle_strategy="tts_word_timing",
        timing_quality="excellent",
        notes="WordBoundary event'leri ms cinsinde kelime zamanlama verir. "
              "Hız parametresi rate olarak pre-synthesis uygulanır.",
    ),
    "elevenlabs": TTSCapability(
        supports_word_timing=False,
        word_timing_format="none",
        supports_sentence_timing=False,
        supports_pre_synthesis_speed=True,
        requires_post_synthesis_speed=False,
        requires_alignment_fallback=True,
        recommended_subtitle_strategy="whisper_api",
        timing_quality="none",
        notes="ElevenLabs word timing vermez. Whisper API ile post-hoc "
              "alignment önerilir. Hız stability_similarity_boost ile kontrol edilir.",
    ),
    "openai_tts": TTSCapability(
        supports_word_timing=False,
        word_timing_format="none",
        supports_sentence_timing=False,
        supports_pre_synthesis_speed=True,
        requires_post_synthesis_speed=False,
        requires_alignment_fallback=True,
        recommended_subtitle_strategy="whisper_api",
        timing_quality="none",
        notes="OpenAI TTS word timing vermez. Aynı API key ile Whisper "
              "kullanılabilir. speed parametresi 0.25-4.0 arası desteklenir.",
    ),
}

# Bilinmeyen sağlayıcılar için güvenli fallback
_DEFAULT_CAPABILITY = TTSCapability(
    supports_word_timing=False,
    word_timing_format="none",
    supports_sentence_timing=False,
    supports_pre_synthesis_speed=False,
    requires_post_synthesis_speed=True,
    requires_alignment_fallback=True,
    recommended_subtitle_strategy="equal_distribution",
    timing_quality="none",
    notes="Bilinmeyen sağlayıcı — en güvenli fallback stratejisi kullanılır.",
)


def get_tts_capabilities(provider_name: str) -> TTSCapability:
    """
    Belirtilen TTS sağlayıcısının yetenek bilgisini döndürür.

    Bilinmeyen sağlayıcılar için güvenli bir varsayılan döner.

    Args:
        provider_name: TTS sağlayıcı adı ("edge_tts", "elevenlabs", "openai_tts").

    Returns:
        TTSCapability dataclass instance.
    """
    return _TTS_CAPABILITIES.get(provider_name, _DEFAULT_CAPABILITY)


def get_all_capabilities() -> dict[str, TTSCapability]:
    """Tüm bilinen TTS sağlayıcılarının yetenek bilgilerini döndürür."""
    return dict(_TTS_CAPABILITIES)
