"""
Pydantic v2 şemaları — API request/response doğrulama ve serileştirme.

Tasarım kuralları:
  • Her ORM modeli için ayrı Create, Update ve Response şeması
  • Response şemalarında model_config = ConfigDict(from_attributes=True) → ORM objesinden doğrudan dönüşüm
  • Opsiyonel alanlar: None default veya Optional ile işaretli
  • Enum değerleri: Literal ile kısıtlı (SQLite VARCHAR uyumu)
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# Ortak tipler
# ─────────────────────────────────────────────────────────────────────────────

JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
StepStatus = Literal["pending", "running", "completed", "failed", "skipped"]
SettingScope = Literal["admin", "module", "provider", "user"]


# ─────────────────────────────────────────────────────────────────────────────
# JobStep Şemaları
# ─────────────────────────────────────────────────────────────────────────────

class JobStepResponse(BaseModel):
    """Bir pipeline adımının API yanıt temsili."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: str
    key: str
    label: str
    order: int
    status: StepStatus
    message: str | None = None
    provider: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None
    cost_estimate_usd: float = 0.0
    cached: bool = False
    output_artifact: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Job Şemaları
# ─────────────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    """Yeni bir pipeline işi başlatma isteği."""

    module_key: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="İçerik modülü adı: standard_video, news_bulletin, product_review",
        examples=["standard_video"],
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=512,
        description="Video konusu veya başlık",
        examples=["Yapay Zekanın Geleceği"],
    )
    language: str = Field(
        default="tr",
        max_length=10,
        description="İçerik dili (ISO 639-1)",
        examples=["tr", "en", "de"],
    )
    settings_overrides: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Bu iş için kullanıcı ayar override'ları. "
            "5 katmanlı hiyerarşinin en üstüne (user katmanı) uygulanır."
        ),
        examples=[{"tts_provider": "elevenlabs", "subtitle_style": "neon_blue"}],
    )


class JobResponse(BaseModel):
    """Bir pipeline işinin tam API yanıt temsili."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    module_key: str
    title: str
    language: str
    status: JobStatus
    current_step: str | None = None
    error_message: str | None = None
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    session_dir: str | None = None
    output_path: str | None = None
    cost_estimate_usd: float = 0.0
    steps: list[JobStepResponse] = Field(default_factory=list)


class JobListResponse(BaseModel):
    """İş listesi API yanıtı — sayfalama destekli."""

    items: list[JobResponse]
    total: int
    page: int
    page_size: int


class JobStatusUpdate(BaseModel):
    """
    İş durumu güncelleme isteği.
    Yalnızca belirli geçişlere izin verilir (cancelled ← queued|running).
    """

    status: Literal["cancelled"] = Field(
        description="Hedef durum — şu an yalnızca 'cancelled' desteklenir",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Setting Şemaları
# ─────────────────────────────────────────────────────────────────────────────

class SettingCreate(BaseModel):
    """Yeni bir ayar kaydı oluşturma isteği (admin tarafından)."""

    scope: SettingScope = Field(
        description="Ayar katmanı",
        examples=["admin"],
    )
    scope_id: str = Field(
        default="",
        max_length=128,
        description="Kapsam tanımlayıcısı (module adı, provider adı veya boş)",
        examples=["", "news_bulletin", "elevenlabs"],
    )
    key: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Ayar anahtarı",
        examples=["tts_provider", "voice_id", "language"],
    )
    value: Any = Field(
        ...,
        description="Ayar değeri — JSON olarak saklanır. String, int, float, bool, list, dict olabilir.",
        examples=["edge_tts", 30, True, ["a", "b"]],
    )
    locked: bool = Field(
        default=False,
        description="True ise kullanıcı bu ayarı override edemez",
    )
    description: str | None = Field(
        default=None,
        max_length=512,
        description="Ayar açıklaması — admin panelinde görüntülenir",
    )


class SettingUpdate(BaseModel):
    """Mevcut bir ayarı güncelleme isteği."""

    value: Any = Field(
        ...,
        description="Yeni ayar değeri",
    )
    locked: bool | None = Field(
        default=None,
        description="Kilit durumunu değiştirmek istenirse gönderilir",
    )
    description: str | None = Field(
        default=None,
        max_length=512,
        description="Güncellenmiş açıklama",
    )


class SettingResponse(BaseModel):
    """Tek bir ayar kaydının API yanıt temsili."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    scope: SettingScope
    scope_id: str
    key: str
    value: Any  # JSON-decoded olarak döner
    locked: bool
    description: str | None = None
    created_at: str
    updated_at: str

    @model_validator(mode="before")
    @classmethod
    def _decode_json_value(cls, data: Any) -> Any:
        """
        ORM Setting.value sütunu JSON-encoded string tutar (ör. '"shorts"', '30').
        API yanıtında decode edilmiş Python değeri döndürülmeli.

        Çoklu encode olmuş değerleri de güvenle çözer: string olduğu sürece
        tekrar json.loads dener (en fazla 5 katman).
        """
        import json as _json

        def _iterative_decode(raw: Any) -> Any:
            """String olduğu sürece json.loads tekrarla, stabil olunca dur."""
            result = raw
            for _ in range(5):
                if not isinstance(result, str):
                    break
                try:
                    result = _json.loads(result)
                except (_json.JSONDecodeError, TypeError):
                    break
            return result

        # from_attributes ile ORM nesnesi gelir
        if hasattr(data, "value"):
            raw = data.value
            if isinstance(raw, str):
                decoded = _iterative_decode(raw)
                # Eğer decode sonucu raw'dan farklıysa, dict'e çevir
                if decoded is not raw or not isinstance(decoded, str):
                    return {
                        "id": data.id,
                        "scope": data.scope,
                        "scope_id": data.scope_id,
                        "key": data.key,
                        "value": decoded,
                        "locked": data.locked,
                        "description": data.description,
                        "created_at": data.created_at,
                        "updated_at": data.updated_at,
                    }
        # dict olarak geldiyse (örn. test veya manual çağrı)
        elif isinstance(data, dict) and "value" in data:
            raw = data["value"]
            if isinstance(raw, str):
                decoded = _iterative_decode(raw)
                if decoded is not raw or not isinstance(decoded, str):
                    data = {**data, "value": decoded}
        return data


class SettingBulkCreate(BaseModel):
    """Birden fazla ayarı toplu olarak kaydetme isteği."""

    settings: list[SettingCreate] = Field(
        ...,
        min_length=1,
        description="Kaydedilecek ayar listesi",
    )


class ResolvedSettingsResponse(BaseModel):
    """
    5 katman uygulandıktan sonra son haline gelmiş ayar seti.
    Kullanıcı ve frontend bu yanıtı alır; hangi katmandan geldiği bilgisi opsiyoneldir.
    """

    settings: dict[str, Any] = Field(
        description="key → value sözlüğü (tüm katmanlar uygulanmış nihai değerler)",
    )
    locked_keys: list[str] = Field(
        default_factory=list,
        description="Admin tarafından kilitlenmiş ve kullanıcı tarafından değiştirilemeyen anahtarlar",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Health / Sistem Şemaları
# ─────────────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """GET /health yanıt şeması."""

    status: Literal["ok", "degraded"]
    version: str
    environment: str
    database: dict[str, str]
