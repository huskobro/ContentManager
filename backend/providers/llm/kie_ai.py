"""
kie.ai LLM Provider — OpenAI-uyumlu Gemini 2.5 Flash proxy.

kie.ai, Google Gemini modellerine OpenAI-uyumlu REST API üzerinden
erişim sağlayan bir proxy servisidir. Maliyet avantajı ve basit
entegrasyon sunar.

API Base: https://api.kie.ai
Endpoint: POST /gemini-2.5-flash/v1/chat/completions
Auth: Bearer token (Authorization header)

Config'den okunan anahtarlar:
    kieai_api_key: kie.ai API anahtarı.
    llm_model: Kullanılacak model (override edilebilir, default: gemini-2.5-flash).
    script_temperature: Temperature değeri (varsayılan: 0.8).
    script_max_tokens: Max output token (varsayılan: 8192).

Maliyet tahmini:
    kie.ai fiyatlandırması Gemini'den ucuz olabilir (proxy avantajı).
    Ortalama senaryo: ~500 input + ~2000 output token ≈ $0.0005
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from backend.providers.base import BaseProvider, ProviderCategory, ProviderResult
from backend.utils.logger import get_logger

log = get_logger(__name__)

# kie.ai API sabit değerleri
KIEAI_BASE_URL = "https://api.kie.ai"
KIEAI_ENDPOINT = "/gemini-2.5-flash/v1/chat/completions"
KIEAI_TIMEOUT = 120.0  # Uzun senaryo üretimi için yeterli süre


class KieAIProvider(BaseProvider):
    """
    kie.ai üzerinden Gemini 2.5 Flash'a OpenAI-uyumlu erişim.

    Desteklenen input_data alanları:
        prompt (str): Ana prompt — zorunlu.
        system_instruction (str): Sistem talimatı — opsiyonel.
        temperature (float): Yaratıcılık seviyesi (0.0–2.0).
        max_output_tokens (int): Maksimum çıktı token sayısı.
        response_format (str): "json" ise JSON çıktı beklenir.

    Avantajlar:
        • OpenAI-uyumlu API — standart, basit
        • Gemini 2.5 Flash (en güncel model)
        • Stream desteği (şu an non-stream kullanılıyor)
    """

    name = "kieai"
    category = ProviderCategory.LLM

    async def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> ProviderResult:
        """
        kie.ai API'yi çağırarak Gemini 2.5 Flash ile metin üretir.

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

        # API key
        api_key = config.get("kieai_api_key", "")
        if not api_key:
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error="kie.ai API key bulunamadı. Admin panelinden 'kieai_api_key' ayarlayın veya .env'de KIEAI_API_KEY tanımlayın.",
            )

        # Parametreler
        temperature = input_data.get("temperature") or config.get("script_temperature", 0.8)
        max_tokens = input_data.get("max_output_tokens") or config.get("script_max_tokens", 8192)
        system_instruction = input_data.get("system_instruction")

        # Mesaj listesi oluştur (OpenAI format)
        messages: list[dict[str, Any]] = []

        if system_instruction:
            messages.append({
                "role": "system",
                "content": system_instruction,
            })

        messages.append({
            "role": "user",
            "content": prompt,
        })

        # İstek gövdesi
        request_body: dict[str, Any] = {
            "messages": messages,
            "stream": False,
            "include_thoughts": False,
            "temperature": float(temperature),
            "max_tokens": int(max_tokens),
        }

        # JSON çıktı isteniyorsa response_format ekle
        response_format = input_data.get("response_format")
        if response_format == "json":
            request_body["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=KIEAI_TIMEOUT) as client:
                response = await client.post(
                    f"{KIEAI_BASE_URL}{KIEAI_ENDPOINT}",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=request_body,
                )

            # HTTP hata kontrolü
            if response.status_code != 200:
                error_detail = response.text[:500]
                log.error(
                    "kie.ai API HTTP hatası",
                    status_code=response.status_code,
                    detail=error_detail,
                )
                return ProviderResult(
                    success=False,
                    provider_name=self.name,
                    error=f"kie.ai API hatası (HTTP {response.status_code}): {error_detail}",
                )

            # Yanıtı parse et (OpenAI format)
            data = response.json()
            choices = data.get("choices", [])

            if not choices:
                return ProviderResult(
                    success=False,
                    provider_name=self.name,
                    error="kie.ai yanıtında choices boş döndü.",
                )

            text = choices[0].get("message", {}).get("content", "")
            if not text:
                return ProviderResult(
                    success=False,
                    provider_name=self.name,
                    error="kie.ai yanıtında content boş döndü.",
                )

            # Token kullanımı
            usage = data.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", 500)
            completion_tokens = usage.get("completion_tokens", 2000)
            total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

            # Maliyet tahmini (Gemini 2.5 Flash yaklaşık fiyatları)
            cost = (prompt_tokens * 0.075 / 1_000_000) + (completion_tokens * 0.30 / 1_000_000)

            # JSON parse denemesi
            parsed_data = text
            if response_format == "json":
                try:
                    parsed_data = json.loads(text)
                except json.JSONDecodeError:
                    pass

            log.info(
                "kie.ai yanıt alındı",
                model="gemini-2.5-flash",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                response_length=len(text),
            )

            return ProviderResult(
                success=True,
                provider_name=self.name,
                data=parsed_data,
                cost_estimate_usd=round(cost, 6),
                metadata={
                    "model": "gemini-2.5-flash",
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens,
                    },
                    "response_length": len(text),
                },
            )

        except httpx.TimeoutException:
            log.error("kie.ai API zaman aşımı", timeout=KIEAI_TIMEOUT)
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"kie.ai API zaman aşımı ({KIEAI_TIMEOUT}s). Daha kısa bir prompt deneyin.",
            )

        except Exception as exc:
            error_msg = str(exc)[:500]
            log.error("kie.ai API hatası", error=error_msg)
            return ProviderResult(
                success=False,
                provider_name=self.name,
                error=f"kie.ai API hatası: {error_msg}",
            )

    async def health_check(self, config: dict[str, Any]) -> bool:
        """
        kie.ai API'nin erişilebilir olup olmadığını test eder.
        Kısa bir ping prompt'u gönderir.
        """
        api_key = config.get("kieai_api_key", "")
        if not api_key:
            return False

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{KIEAI_BASE_URL}{KIEAI_ENDPOINT}",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "messages": [{"role": "user", "content": "Say OK"}],
                        "stream": False,
                        "include_thoughts": False,
                        "max_tokens": 10,
                    },
                )
            return response.status_code == 200
        except Exception:
            return False
