"""
5 Katmanlı Ayar Çözümleme Motoru (Settings Resolver).

Hiyerarşi (düşük → yüksek öncelik):
  1. global     — config.py'deki hardcoded defaults (DB'de saklanmaz)
  2. admin      — Admin panelinden girilen sistem geneli varsayımlar
  3. module     — Modüle özgü varsayımlar (ör. news_bulletin farklı TTS)
  4. provider   — Provider'a özgü varsayımlar (ör. elevenlabs ses ayarları)
  5. user       — Kullanıcı override'ları (en yüksek öncelik)

Çakışma kuralı: En yüksek katman kazanır, AMA admin tarafından
locked=True olarak işaretlenmiş anahtarlar kullanıcı tarafından
override edilemez — admin değeri korunur.

Kullanım:
    from backend.services.settings_resolver import SettingsResolver

    resolver = SettingsResolver(db)
    result = resolver.resolve(module_key="standard_video")
    # result.settings  → {"tts_provider": "elevenlabs", "language": "tr", ...}
    # result.locked_keys → ["language", "max_concurrent_jobs"]

    # Tek bir ayar sorgulama:
    value = resolver.get(
        key="tts_provider",
        module_key="standard_video",
        user_overrides={"tts_provider": "openai_tts"},
    )
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.models.settings import Setting
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Katman 1: Global Defaults (kod-içi, DB'de saklanmaz)
# ─────────────────────────────────────────────────────────────────────────────

# config.py'deki pipeline default'larının ayar anahtarlarına eşleştirilmiş hali.
# Bu sözlük "en düşük öncelik" katmanıdır — hiçbir DB kaydı yoksa
# bu değerler kullanılır.

_GLOBAL_DEFAULTS: dict[str, Any] = {
    "language": app_settings.default_language,
    "tts_provider": app_settings.default_tts_provider,
    "llm_provider": app_settings.default_llm_provider,
    "visuals_provider": app_settings.default_visuals_provider,
    "video_resolution": app_settings.default_video_resolution,
    "video_fps": app_settings.default_video_fps,
    "subtitle_style": app_settings.default_subtitle_style,
    "max_concurrent_jobs": app_settings.max_concurrent_jobs,
    "job_timeout_seconds": app_settings.job_timeout_seconds,
    # Provider API anahtarları (.env'den okunur, admin panelden override edilebilir)
    "kieai_api_key": app_settings.kieai_api_key,
    "openai_api_key": app_settings.openai_api_key,
    "elevenlabs_api_key": app_settings.elevenlabs_api_key,
    "pexels_api_key": app_settings.pexels_api_key,
}


def get_global_defaults() -> dict[str, Any]:
    """
    Katman 1 global default'larının bir kopyasını döndürür.
    Dış kodun orijinal dict'i mutasyona uğratmasını önlemek için kopya verilir.
    """
    return dict(_GLOBAL_DEFAULTS)


# ─────────────────────────────────────────────────────────────────────────────
# Yardımcı: JSON value decode
# ─────────────────────────────────────────────────────────────────────────────

def _decode_value(raw: str) -> Any:
    """
    Setting.value sütunundaki JSON-encoded string'i Python nesnesine çevirir.

    Çoklu encode olmuş değerleri de güvenle çözer: string olduğu sürece
    tekrar json.loads dener, stabil olunca (artık string değilse veya
    parse edilemiyorsa) durur. En fazla 5 katman (güvenlik sınırı).

    Örnekler:
      '"edge_tts"' → "edge_tts"
      '30'         → 30
      'true'       → True
      '["a","b"]'  → ["a", "b"]
      '{"k": "v"}' → {"k": "v"}
      '"[\\"a\\",\\"b\\"]"' → ["a", "b"]  (çoklu encode)
    """
    result: Any = raw
    for _ in range(5):  # Güvenlik sınırı: en fazla 5 decode katmanı
        if not isinstance(result, str):
            break
        try:
            result = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            break
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Veritabanından katman okuma
# ─────────────────────────────────────────────────────────────────────────────

def _load_scope(
    db: Session,
    scope: str,
    scope_id: str = "",
) -> tuple[dict[str, Any], set[str]]:
    """
    Belirli bir (scope, scope_id) çifti için tüm ayarları yükler.

    Returns:
        (settings_dict, locked_keys_set)
        settings_dict: key → decoded value
        locked_keys_set: bu katmandaki locked=True anahtarlar
    """
    rows: list[Setting] = (
        db.query(Setting)
        .filter(Setting.scope == scope, Setting.scope_id == scope_id)
        .all()
    )

    values: dict[str, Any] = {}
    locked: set[str] = set()

    for row in rows:
        values[row.key] = _decode_value(row.value)
        if row.locked:
            locked.add(row.key)

    return values, locked


# ─────────────────────────────────────────────────────────────────────────────
# SettingsResolver Ana Sınıfı
# ─────────────────────────────────────────────────────────────────────────────

class SettingsResolver:
    """
    5 katmanlı ayar çözümleme motoru.

    Her çağrıda veritabanından ilgili katmanları okur, hiyerarşiyi uygular
    ve nihai değerleri döndürür. Kilitleme mantığını katman 5 (user)
    uygulaması sırasında kontrol eder.

    Args:
        db: Aktif SQLAlchemy Session nesnesi.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Tam çözümleme ───────────────────────────────────────────────────────

    def resolve(
        self,
        module_key: str | None = None,
        provider_key: str | None = None,
        user_overrides: dict[str, Any] | None = None,
    ) -> _ResolvedSettings:
        """
        5 katmanı sırasıyla uygulayarak nihai ayar setini döndürür.

        Args:
            module_key: İçerik modülü adı (ör. "standard_video").
                        None ise katman 3 (module) atlanır.
            provider_key: Provider adı (ör. "elevenlabs").
                          None ise katman 4 (provider) atlanır.
            user_overrides: Kullanıcının bu iş için gönderdiği override'lar.
                            None veya boş dict ise katman 5 atlanır.

        Returns:
            _ResolvedSettings nesnesi (.settings dict, .locked_keys list).
        """

        # Katman 1: Global defaults (kod-içi)
        merged: dict[str, Any] = get_global_defaults()
        all_locked: set[str] = set()

        # Katman 2: Admin defaults
        admin_values, admin_locked = _load_scope(self._db, "admin", "")
        merged.update(admin_values)
        all_locked.update(admin_locked)

        # Katman 3: Module defaults (varsa)
        if module_key:
            mod_values, mod_locked = _load_scope(self._db, "module", module_key)
            merged.update(mod_values)
            all_locked.update(mod_locked)

        # Katman 4: Provider defaults (varsa)
        if provider_key:
            prov_values, prov_locked = _load_scope(self._db, "provider", provider_key)
            merged.update(prov_values)
            all_locked.update(prov_locked)

        # Katman 5: User overrides — kilitli anahtarlar hariç
        if user_overrides:
            user_db_values, _ = _load_scope(self._db, "user", "")
            # Önce DB'deki user ayarlarını uygula
            for key, value in user_db_values.items():
                if key not in all_locked:
                    merged[key] = value

            # Sonra request-level override'ları uygula (en yüksek öncelik)
            for key, value in user_overrides.items():
                if key not in all_locked:
                    merged[key] = value
                else:
                    log.warning(
                        "Kilitli ayar override denemesi engellendi",
                        key=key,
                        attempted_value=str(value)[:100],
                    )
        else:
            # user_overrides verilmese bile DB'deki user katmanı okunmalı
            user_db_values, _ = _load_scope(self._db, "user", "")
            for key, value in user_db_values.items():
                if key not in all_locked:
                    merged[key] = value

        log.debug(
            "Ayarlar çözümlendi",
            module_key=module_key or "-",
            provider_key=provider_key or "-",
            total_keys=len(merged),
            locked_count=len(all_locked),
        )

        return _ResolvedSettings(
            settings=merged,
            locked_keys=sorted(all_locked),
        )

    # ── Tek ayar sorgulama ──────────────────────────────────────────────────

    def get(
        self,
        key: str,
        module_key: str | None = None,
        provider_key: str | None = None,
        user_overrides: dict[str, Any] | None = None,
        default: Any = None,
    ) -> Any:
        """
        Tek bir ayar anahtarının nihai değerini döndürür.

        Dahili olarak resolve() çağırır, sonra verilen key'i çeker.
        Sık kullanılan tek-değer sorguları için kolaylık metodu.

        Args:
            key: Ayar anahtarı (ör. "tts_provider").
            module_key: Modül filtresi.
            provider_key: Provider filtresi.
            user_overrides: Kullanıcı override'ları.
            default: Anahtar bulunamazsa döndürülecek varsayılan değer.

        Returns:
            Çözümlenmiş değer veya default.
        """
        resolved = self.resolve(
            module_key=module_key,
            provider_key=provider_key,
            user_overrides=user_overrides,
        )
        return resolved.settings.get(key, default)

    # ── Belirli bir scope'a ayar yazma ──────────────────────────────────────

    def upsert(
        self,
        scope: str,
        scope_id: str,
        key: str,
        value: Any,
        locked: bool = False,
        description: str | None = None,
    ) -> Setting:
        """
        Ayar tablosuna yeni kayıt ekler veya mevcudu günceller.

        (scope, scope_id, key) üçlüsü benzersizdir — varsa UPDATE,
        yoksa INSERT yapılır.

        Args:
            scope: Katman adı ("admin", "module", "provider", "user").
            scope_id: Kapsam tanımlayıcısı (modül adı, provider adı veya "").
            key: Ayar anahtarı.
            value: Ayar değeri (Python nesnesi; JSON'a encode edilir).
            locked: True ise kullanıcı override edemez.
            description: Ayar açıklaması.

        Returns:
            Oluşturulan veya güncellenen Setting ORM nesnesi.
        """
        encoded_value = json.dumps(value, ensure_ascii=False)

        existing: Setting | None = (
            self._db.query(Setting)
            .filter(
                Setting.scope == scope,
                Setting.scope_id == scope_id,
                Setting.key == key,
            )
            .first()
        )

        if existing:
            existing.value = encoded_value
            existing.locked = locked
            if description is not None:
                existing.description = description
            self._db.flush()
            log.info(
                "Ayar güncellendi",
                scope=scope,
                scope_id=scope_id or "-",
                key=key,
            )
            return existing

        new_setting = Setting(
            scope=scope,
            scope_id=scope_id,
            key=key,
            value=encoded_value,
            locked=locked,
            description=description,
        )
        self._db.add(new_setting)
        self._db.flush()
        log.info(
            "Yeni ayar oluşturuldu",
            scope=scope,
            scope_id=scope_id or "-",
            key=key,
        )
        return new_setting

    # ── Toplu ayar yazma ────────────────────────────────────────────────────

    def bulk_upsert(
        self,
        settings_list: list[dict[str, Any]],
    ) -> list[Setting]:
        """
        Birden fazla ayarı tek seferde yazar.

        Args:
            settings_list: Her biri {scope, scope_id, key, value, locked?, description?}
                          sözlüğü içeren liste.

        Returns:
            Oluşturulan/güncellenen Setting nesnelerinin listesi.
        """
        results: list[Setting] = []
        for item in settings_list:
            setting = self.upsert(
                scope=item["scope"],
                scope_id=item.get("scope_id", ""),
                key=item["key"],
                value=item["value"],
                locked=item.get("locked", False),
                description=item.get("description"),
            )
            results.append(setting)
        return results

    # ── Belirli bir scope'un ayarlarını listeleme ───────────────────────────

    def list_scope(
        self,
        scope: str,
        scope_id: str = "",
    ) -> list[Setting]:
        """
        Belirli bir (scope, scope_id) çiftindeki tüm ayar kayıtlarını döndürür.

        Args:
            scope: Katman adı.
            scope_id: Kapsam tanımlayıcısı.

        Returns:
            Setting ORM nesnelerinin listesi.
        """
        return (
            self._db.query(Setting)
            .filter(Setting.scope == scope, Setting.scope_id == scope_id)
            .order_by(Setting.key)
            .all()
        )

    # ── Tek ayar silme ──────────────────────────────────────────────────────

    def delete(
        self,
        scope: str,
        scope_id: str,
        key: str,
    ) -> bool:
        """
        Belirli bir ayar kaydını siler.

        Returns:
            True ise silindi, False ise kayıt bulunamadı.
        """
        existing: Setting | None = (
            self._db.query(Setting)
            .filter(
                Setting.scope == scope,
                Setting.scope_id == scope_id,
                Setting.key == key,
            )
            .first()
        )

        if not existing:
            return False

        self._db.delete(existing)
        self._db.flush()
        log.info(
            "Ayar silindi",
            scope=scope,
            scope_id=scope_id or "-",
            key=key,
        )
        return True


# ─────────────────────────────────────────────────────────────────────────────
# Çözümleme Sonucu (Internal DTO)
# ─────────────────────────────────────────────────────────────────────────────

class _ResolvedSettings:
    """
    resolve() metodunun döndürdüğü sonuç nesnesi.

    Attributes:
        settings: key → value sözlüğü (tüm katmanlar uygulanmış).
        locked_keys: Admin tarafından kilitlenmiş anahtar listesi.
    """

    __slots__ = ("settings", "locked_keys")

    def __init__(self, settings: dict[str, Any], locked_keys: list[str]) -> None:
        self.settings = settings
        self.locked_keys = locked_keys

    def to_response_dict(self) -> dict[str, Any]:
        """
        Pydantic ResolvedSettingsResponse şemasıyla uyumlu dict döndürür.
        API endpoint'lerinde doğrudan kullanılabilir.
        """
        return {
            "settings": self.settings,
            "locked_keys": self.locked_keys,
        }

    def __repr__(self) -> str:
        return (
            f"<ResolvedSettings keys={len(self.settings)} "
            f"locked={len(self.locked_keys)}>"
        )
