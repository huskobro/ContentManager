"""
Google Gemini LLM Provider — Metin üretimi sağlayıcısı.

Google'ın Gemini API'sini kullanarak senaryo, metadata ve diğer
metin tabanlı içerik üretimi yapar.

API Key:
    config["gemini_api_key"] veya config["kieai_api_key"] üzerinden okunur.

Kullanılan kütüphane:
    google-generativeai (v0.8+)
    Async metot: model.generate_content_async()

Maliyet tahmini:
    Gemini Flash: ~$0.075/1M input token, ~$0.30/1M output token
    Ortalama senaryo: ~500 input + ~2000 output token ≈ $0.0006

Not:
    google.generativeai paketi deprecation uyarısı veriyor;
    ileride google.genai'ye geçiş planlanabilir.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import google.generativeai as genai

from backend.providers.base import BaseProvider, ProviderCategory, ProviderResult
from backend.utils.logger import get_logger

log = get_logger(__name__)

# Deprecation uyarısını bastır (google-generativeai → google-genai geçişi bekliyor)
import warnings
warnings.filterwarnings("ignore", message=".*google.generativeai.*deprecated.*")


class GeminiProvider(BaseProvider):
    """
    Google Gemini API üzerinden metin üretimi.

    Desteklenen input_data alanları:
        prompt (str): Ana prompt — zorunlu.
        system_instruction (str): Sistem talimatı — opsiyonel.
        model (str): Model adı — varsayılan config'den gelir.
        temperature (float): Yaratıcılık seviyesi (0.0–2.0).
        max_output_tokens (int): Maksimum çıktı token sayısı.
        response_format (str): "json" ise JSON çıktı beklenir.

    Config'den okunan anahtarlar:
        gemini_api_key: Google API anahtarı.
        kieai_api_key: kie.ai proxy üzerinden Gemini erişimi.
        llm_model: Kullanılacak model (varsayılan: "gemini-2.0-flash").
        script_temperature: Temperature değeri (varsayılan: 0.8).
        script_max_tokens: Max output token (varsayılan: 8192).
    """

    name = "gemini"
    category = ProviderCategory.LLM

    async def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        Gemini API'yi çağırarak metin üretir.

        Args:
            input_data: {"prompt": str, "system_instruction"?: str, ...}
            config: Çözümlenmiş ayarlar.

        Returns:
            ProviderResult — data alanında üretilen metin.
        """
        prompt = input_data.get("prompt")
        if not prompt:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="Prompt boş — metin üretimi için prompt gerekli.",
            )

        # API key seçimi: gemini_api_key > kieai_api_key
        api_key = config.get("gemini_api_key") or config.get("kieai_api_key", "")
        if not api_key:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="Gemini API key bulunamadı. Admin panelinden 'gemini_api_key' ayarlayın.",
            )

        # Model ve parametreler
        model_name = input_data.get("model") or config.get("llm_model", "gemini-2.0-flash")
        temperature = input_data.get("temperature") or config.get("script_temperature", 0.8)
        max_tokens = input_data.get("max_output_tokens") or config.get("script_max_tokens", 8192)
        system_instruction = input_data.get("system_instruction")

        try:
            # API'yi yapılandır
            genai.configure(api_key=api_key)

            # Generation config
            generation_config = genai.GenerationConfig(
                temperature=float(temperature),
                max_output_tokens=int(max_tokens),
            )

            # JSON çıktı isteniyorsa MIME type ayarla
            response_format = input_data.get("response_format")
            if response_format == "json":
                generation_config.response_mime_type = "application/json"

            # Model oluştur
            model = genai.GenerativeModel(
                model_name=model_name,
                generation_config=generation_config,
                system_instruction=system_instruction,
            )

            # Async çağrı
            response = await model.generate_content_async(prompt)

            # Sonuç metni
            text = response.text

            # Token sayısı (varsa)
            usage = {}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                um = response.usage_metadata
                usage = {
                    "prompt_tokens": getattr(um, "prompt_token_count", 0),
                    "completion_tokens": getattr(um, "candidates_token_count", 0),
                    "total_tokens": getattr(um, "total_token_count", 0),
                }

            # Maliyet tahmini (Gemini 2.0 Flash fiyatları)
            prompt_tokens = usage.get("prompt_tokens", 500)
            completion_tokens = usage.get("completion_tokens", 2000)
            cost = (prompt_tokens * 0.075 / 1_000_000) + (completion_tokens * 0.30 / 1_000_000)

            # JSON parse denemesi (response_format="json" ise)
            parsed_data = text
            if response_format == "json":
                try:
                    parsed_data = json.loads(text)
                except json.JSONDecodeError:
                    # JSON parse edilemezse ham metin döndür
                    pass

            log.info(
                "Gemini yanıt alındı",
                model_name=model_name,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                response_length=len(text),
            )

            return ProviderResult(
                success=True,
                provider_name=self.name,
                data=parsed_data,
                cost_estimate_usd=round(cost, 6),
                metadata={
                    "model": model_name,
                    "usage": usage,
                    "response_length": len(text),
                },
            )

        except Exception as exc:
            error_msg = str(exc)[:500]
            log.error(
                "Gemini API hatası",
                error=error_msg,
                model_name=model_name,
            )
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"Gemini API hatası: {error_msg}",
            )

    async def health_check(self, config: dict[str, Any]) -> bool:
        """
        Gemini API'nin erişilebilir olup olmadığını test eder.

        Küçük bir "ping" prompt'u gönderir ve yanıt gelip gelmediğini kontrol eder.
        """
        api_key = config.get("gemini_api_key") or config.get("kieai_api_key", "")
        if not api_key:
            return False

        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await model.generate_content_async("Say OK")
            return bool(response.text)
        except Exception:
            return False
