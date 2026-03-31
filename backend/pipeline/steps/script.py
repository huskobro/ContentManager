"""
Senaryo Uretimi Yardimci Modulu -- Kategori Promptlari ve Acilis Hook'lari.

youtube_video_bot projesinden alinan en iyi prompt muhendisligi pratikleri:
  - 6 icerik kategorisi (True Crime, Bilim, Tarih, Motivasyon, Din, Genel)
  - 8 benzersiz acilis hook'u (dil bazli, tekrar onleme)
  - Kategori bazli master prompt sablonlari

Bu fonksiyonlar dogrudan pipeline step'leri tarafindan import edilir.
Standard video modulu config'den "category" ve "use_hook_variety" ayarlarini
okuyarak bu fonksiyonlari kullanir.

Override Sistemi:
  Kategori ve hook metinleri admin panelden duzenlenebilir.
  Overridelar settings tablosunda saklanir:
    - category: scope="admin", key="category_content_{key}"
                value = JSON: {tone, focus, style_instruction, enabled}
    - hook:     scope="admin", key="hook_content_{type}_{lang}"
                value = JSON: {name, template, enabled}
  load_overrides_from_db(db) cagrisi ile runtime'a yuklenir.
"""

from __future__ import annotations

import json
import random
from typing import Any


# ---------------------------------------------------------------------------
# Kategori Tanimlari
# ---------------------------------------------------------------------------

CATEGORIES: dict[str, dict[str, str]] = {
    "general": {
        "name_tr": "Genel",
        "name_en": "General",
        "tone": "Bilgilendirici, samimi ve akici",
        "focus": "Konuyu genis bir perspektiften ele al, izleyiciyi merakllandir",
        "style_instruction": (
            "Genel izleyici kitlesine hitap et. Konuyu erisilebilir ve "
            "ilgi cekici bir sekilde anlat. Teknik jargondan kacin."
        ),
    },
    "true_crime": {
        "name_tr": "Suc & Gizem",
        "name_en": "True Crime",
        "tone": "Gerilimli, merak uyandiran, arastirmaci gazetecilik uslubu",
        "focus": "Olayi kronolojik sirala, ipuclarini serpistir, gerilimi koru",
        "style_instruction": (
            "Gercek suc ve gizem anlaticisi gibi yaz. Olaylari dramatik ama "
            "saygili bir sekilde aktar. Kronolojik duzen kullan. Her sahnenin "
            "sonunda merak birak. Ipuclarini stratejik olarak dagit."
        ),
    },
    "science": {
        "name_tr": "Bilim & Teknoloji",
        "name_en": "Science & Technology",
        "tone": "Merakli, kesfedici, bilimsel ama anlasilir",
        "focus": "Karmasik kavramlari basitlestir, somut ornekler ve benzetmeler kullan",
        "style_instruction": (
            "Bilim iletisimcisi gibi yaz. Karmasik kavramlari gunluk hayattan "
            "orneklerle acikla. Sayilari ve istatistikleri anlamli karsilastirmalarla "
            "sun. 'Bunu bilmek neden onemli?' sorusunu surekli cevapla."
        ),
    },
    "history": {
        "name_tr": "Tarih",
        "name_en": "History",
        "tone": "Hikaye anlaticisi, derinlemesine, baglam kuran",
        "focus": "Tarihi olaylari canli karakterler ve sahnelerle anlat",
        "style_instruction": (
            "Tarih belgeseli anlaticisi gibi yaz. Olaylari sadece aktarma, "
            "canlandir. Donemin atmosferini hissettir. Neden-sonuc iliskilerini "
            "vurgula. Gunumuze paralellikleri goster."
        ),
    },
    "motivation": {
        "name_tr": "Motivasyon & Kisisel Gelisim",
        "name_en": "Motivation & Self-Development",
        "tone": "Ilham verici, enerjik, samimi ve eyleme geciren",
        "focus": "Kisisel hikayeler, somut adimlar ve eyleme cagri",
        "style_instruction": (
            "Motivasyon konusmacisi gibi yaz. Guclu kisisel hikayeler ve gercek "
            "ornekler kullan. Her sahnede uygulanabilir bir tavsiye ver. "
            "Izleyiciye dogrudan hitap et ('Sen de yapabilirsin'). Enerjik ama "
            "yapay olmayan bir ton tut."
        ),
    },
    "religion": {
        "name_tr": "Din & Maneviyat",
        "name_en": "Religion & Spirituality",
        "tone": "Saygili, dusundurcu, derin ama erisilebilir",
        "focus": "Dini ve manevi konulari saygiyla, farkli bakis acilarini da gozeterek ele al",
        "style_instruction": (
            "Saygili ve kapsayici bir uslupla yaz. Dini konulari derinlemesine "
            "ama dogmatik olmadan ele al. Farkli yorumlari kabul et. Tarihi ve "
            "kulturel baglami ver. Dusunmeye davet eden, dayatmayan bir ton kullan."
        ),
    },
}


# ---------------------------------------------------------------------------
# Acilis Hook'lari (8 farkli tip)
# ---------------------------------------------------------------------------

_HOOKS_TR: list[dict[str, str]] = [
    {
        "type": "shocking_fact",
        "name": "Sok Edici Gercek",
        "template": (
            "Videoya sok edici, az bilinen bir gercekle basla. "
            "Izleyicinin 'Bu gercek olamaz!' demesini sagla."
        ),
    },
    {
        "type": "question",
        "name": "Dusundurcu Soru",
        "template": (
            "Videoya izleyicinin cevabini merak edecegi guclu bir soruyla basla. "
            "Sorunun cevabi videonun sonuna dogru verilsin."
        ),
    },
    {
        "type": "story",
        "name": "Kisa Anekdot",
        "template": (
            "Videoya konuyla ilgili kisa, carpici bir hikaye veya anekdotla basla. "
            "Dinleyicinin kendini hikayenin icinde hissetmesini sagla."
        ),
    },
    {
        "type": "contradiction",
        "name": "Yaygin Yanilgi",
        "template": (
            "Videoya konuyla ilgili yaygin bir yanlis inanci curunterek basla. "
            "'Cogu kisi X oldugunu dusunur, ama aslinda...' formatini kullan."
        ),
    },
    {
        "type": "future_peek",
        "name": "Gelecek Tahmini",
        "template": (
            "Videoya konunun gelecekte nasil sekillenecegine dair guclu bir "
            "ongoruyle basla. Izleyicinin 'Bunu bilmem gerekiyor' hissi uyandir."
        ),
    },
    {
        "type": "comparison",
        "name": "Beklenmedik Karsilastirma",
        "template": (
            "Videoya konuyu beklenmedik bir seyle karsilastirarak basla. "
            "Ornegin teknolojiyi dogayla, tarihi bugunle, bilimi sanatla kiyasla."
        ),
    },
    {
        "type": "personal_address",
        "name": "Dogrudan Hitap",
        "template": (
            "Videoya izleyiciye dogrudan hitap ederek basla. "
            "'Hic dusundunuz mu...', 'Siz de X yasadiysaniz...' gibi "
            "kisisel bir baglanti kur."
        ),
    },
    {
        "type": "countdown",
        "name": "Geri Sayim/Liste",
        "template": (
            "Videoya 'X seyin Y tanesini' vaat ederek basla. Bir geri sayim "
            "veya liste formati oner. Izleyicinin sonuna kadar izlemesini tetikle."
        ),
    },
]

_HOOKS_EN: list[dict[str, str]] = [
    {
        "type": "shocking_fact",
        "name": "Shocking Fact",
        "template": (
            "Start the video with a shocking, lesser-known fact. "
            "Make the viewer think 'That can't be true!'"
        ),
    },
    {
        "type": "question",
        "name": "Thought-Provoking Question",
        "template": (
            "Start the video with a powerful question the viewer will want answered. "
            "Reveal the answer toward the end."
        ),
    },
    {
        "type": "story",
        "name": "Short Anecdote",
        "template": (
            "Start with a short, striking story or anecdote related to the topic. "
            "Make the listener feel immersed."
        ),
    },
    {
        "type": "contradiction",
        "name": "Common Misconception",
        "template": (
            "Start by debunking a common misconception about the topic. "
            "Use the format 'Most people think X, but actually...'"
        ),
    },
    {
        "type": "future_peek",
        "name": "Future Prediction",
        "template": (
            "Start with a bold prediction about the future of the topic. "
            "Create an 'I need to know this' feeling."
        ),
    },
    {
        "type": "comparison",
        "name": "Unexpected Comparison",
        "template": (
            "Start by comparing the topic to something unexpected. "
            "Compare technology to nature, history to today, science to art."
        ),
    },
    {
        "type": "personal_address",
        "name": "Direct Address",
        "template": (
            "Start by directly addressing the viewer. "
            "'Have you ever wondered...', 'If you've experienced X...' "
            "-- create a personal connection."
        ),
    },
    {
        "type": "countdown",
        "name": "Countdown/List",
        "template": (
            "Start by promising 'Y things about X'. Suggest a countdown or "
            "list format. Trigger the viewer to watch until the end."
        ),
    },
]

# Hook havuzu, dil bazli
_HOOKS: dict[str, list[dict[str, str]]] = {
    "tr": _HOOKS_TR,
    "en": _HOOKS_EN,
}

# Kullanilan hook tipleri -- ayni session'da tekrar onleme
_used_hook_types: list[str] = []

# ---------------------------------------------------------------------------
# Override Sistemi -- Admin panelden duzenlenebilir icerikler
# ---------------------------------------------------------------------------

# {category_key: {tone, focus, style_instruction, enabled}}
_category_overrides: dict[str, dict[str, Any]] = {}

# {(hook_type, lang): {name, template, enabled}}
_hook_overrides: dict[tuple[str, str], dict[str, Any]] = {}


def load_overrides_from_db(db: Any) -> None:
    """
    Settings tablosundan kategori ve hook override'larini yukler.

    Bu fonksiyon pipeline runner tarafindan is baslamadan once cagirilir.
    Yoksa override'lar bos kalir ve hardcoded degerler kullanilir.

    Args:
        db: SQLAlchemy Session ornegi.
    """
    global _category_overrides, _hook_overrides

    try:
        from backend.models.settings import Setting

        rows = (
            db.query(Setting)
            .filter(
                Setting.scope == "admin",
                Setting.scope_id == "",
                Setting.key.like("category_content_%") | Setting.key.like("hook_content_%"),
            )
            .all()
        )
    except Exception:
        return

    new_cat: dict[str, dict[str, Any]] = {}
    new_hook: dict[tuple[str, str], dict[str, Any]] = {}

    for row in rows:
        try:
            value = json.loads(row.value) if isinstance(row.value, str) else row.value
            if not isinstance(value, dict):
                continue
        except (json.JSONDecodeError, TypeError):
            continue

        key: str = row.key
        if key.startswith("category_content_"):
            cat_key = key[len("category_content_"):]
            new_cat[cat_key] = value
        elif key.startswith("hook_content_"):
            # format: hook_content_{type}_{lang}  (lang = tr | en)
            rest = key[len("hook_content_"):]
            # lang is always last 2 chars preceded by '_'
            if "_" in rest:
                last_underscore = rest.rfind("_")
                hook_type = rest[:last_underscore]
                lang = rest[last_underscore + 1:]
                new_hook[(hook_type, lang)] = value

    _category_overrides = new_cat
    _hook_overrides = new_hook


def _get_effective_category(key: str) -> dict[str, Any]:
    """Hardcoded CATEGORIES uzerine override merge ederek efektif kategori bilgisini dondurur."""
    base = dict(CATEGORIES.get(key, CATEGORIES["general"]))
    override = _category_overrides.get(key, {})
    for field in ("tone", "focus", "style_instruction"):
        if override.get(field):
            base[field] = override[field]
    return base


def _get_effective_hooks(language: str) -> list[dict[str, str]]:
    """Hardcoded hook listesi uzerine override merge ederek efektif hook listesini dondurur.
    enabled=False olan hook'lar filtrelenir."""
    base_list = list(_HOOKS.get(language, _HOOKS.get("en", _HOOKS_TR)))
    result = []
    for hook in base_list:
        override = _hook_overrides.get((hook["type"], language), {})
        # enabled=False ise hook'u atla
        if override.get("enabled") is False:
            continue
        effective = dict(hook)
        if override.get("name"):
            effective["name"] = override["name"]
        if override.get("template"):
            effective["template"] = override["template"]
        result.append(effective)
    return result if result else base_list  # Tum hook'lar pasifse fallback


def get_category_prompt_enhancement(category: str) -> str:
    """
    Belirtilen kategori icin prompt zenginlestirme metni dondurur.

    Admin override varsa hardcoded deger yerine override kullanilir.

    Args:
        category: Kategori anahtari (or. "true_crime", "science").
                  Taninmayan kategoriler "general" olarak degerlendirilir.

    Returns:
        LLM system instruction'a eklenecek kategori-spesifik talimat metni.
    """
    cat_info = _get_effective_category(category)

    return (
        f"\n\nKATEGORI: {cat_info['name_tr']}\n"
        f"TON: {cat_info['tone']}\n"
        f"ODAK: {cat_info['focus']}\n"
        f"STIL TALIMATI: {cat_info['style_instruction']}"
    )


def select_opening_hook(
    language: str = "tr",
    exclude_types: list[str] | None = None,
) -> dict[str, str]:
    """
    Rastgele bir acilis hook'u secer.

    Tekrar onleme: Son kullanilan hook tipleri haric tutulur.
    Tum hook'lar kullanildiysa havuz sifirlanir.

    Args:
        language: Dil kodu ("tr" veya "en"). Desteklenmeyen diller
                  "en" olarak degerlendirilir.
        exclude_types: Bu tipleri haric tut (opsiyonel, ek filtre).

    Returns:
        Secilen hook dict'i (type, name, template).
    """
    global _used_hook_types

    # Override sistemi: efektif hook listesini al (admin override + enabled filtresi uygulanmis)
    hooks = _get_effective_hooks(language)

    # Haric tutulacak tipler
    all_excludes = set(_used_hook_types)
    if exclude_types:
        all_excludes.update(exclude_types)

    # Kullanilabilir hook'lari filtrele
    available = [h for h in hooks if h["type"] not in all_excludes]

    # Tumu kullanildiysa havuzu sifirla
    if not available:
        _used_hook_types.clear()
        available = list(hooks)

    selected = random.choice(available)
    _used_hook_types.append(selected["type"])

    # Havuz boyutunu sinirla (son 6 hook'u hatirla)
    if len(_used_hook_types) > 6:
        _used_hook_types = _used_hook_types[-6:]

    return selected


def build_enhanced_prompt(
    title: str,
    config: dict[str, Any],
    base_system_instruction: str,
) -> tuple[str, str]:
    """
    Kategori ve hook bilgilerini kullanarak zenginlestirilmis
    prompt ve system instruction olusturur.

    Args:
        title: Video/is basligi.
        config: Cozumlenmis ayarlar.
        base_system_instruction: Modulun temel system instruction'i.

    Returns:
        (enhanced_system_instruction, hook_instruction) tuple'i.
        hook_instruction bos string olabilir (use_hook_variety=False ise).
    """
    language = config.get("language", "tr")
    category = config.get("category", "general")
    use_hook_variety = config.get("use_hook_variety", True)

    # System instruction'i kategori bilgisiyle zenginlestir
    enhanced_instruction = base_system_instruction

    if category and category != "general":
        category_enhancement = get_category_prompt_enhancement(category)
        enhanced_instruction += category_enhancement

    # Acilis hook'u sec
    hook_instruction = ""
    if use_hook_variety:
        hook = select_opening_hook(language)
        hook_instruction = (
            f"\n\nACILIS HOOK TIPI: {hook['name']}\n"
            f"TALIMAT: {hook['template']}"
        )

    return enhanced_instruction, hook_instruction


def get_available_categories() -> list[dict[str, str]]:
    """
    Kullanilabilir tum kategorileri dondurur (sadece key + isimler).

    Returns:
        [{"key": "true_crime", "name_tr": "Suc & Gizem", "name_en": "True Crime"}, ...]
    """
    return [
        {
            "key": key,
            "name_tr": info["name_tr"],
            "name_en": info["name_en"],
        }
        for key, info in CATEGORIES.items()
    ]


def get_category_detail(category_key: str) -> dict[str, Any]:
    """
    Tek bir kategori icin hardcoded + override birlestirilmis tam detay dondurur.

    Returns:
        {key, name_tr, name_en, tone, focus, style_instruction,
         has_override, enabled}
    """
    base = CATEGORIES.get(category_key, CATEGORIES["general"])
    override = _category_overrides.get(category_key, {})
    effective = _get_effective_category(category_key)

    return {
        "key": category_key,
        "name_tr": base["name_tr"],
        "name_en": base["name_en"],
        "tone": effective["tone"],
        "focus": effective["focus"],
        "style_instruction": effective["style_instruction"],
        "default_tone": base["tone"],
        "default_focus": base["focus"],
        "default_style_instruction": base["style_instruction"],
        "has_override": bool(override),
        "enabled": override.get("enabled", True),
    }


def get_all_categories_detail() -> list[dict[str, Any]]:
    """
    Tum kategorilerin tam detayini dondurur.
    """
    return [get_category_detail(key) for key in CATEGORIES]


def get_available_hooks(language: str = "tr") -> list[dict[str, str]]:
    """
    Belirtilen dildeki tum hook tiplerini dondurur (override uygulanmis + enabled filtresi YOK).
    Admin panel icin tum hook'lari listeler (disabled olanlar dahil).

    Returns:
        [{type, name, template, enabled, has_override}, ...]
    """
    base_list = list(_HOOKS.get(language, _HOOKS.get("en", _HOOKS_TR)))
    result = []
    for hook in base_list:
        override = _hook_overrides.get((hook["type"], language), {})
        result.append({
            "type": hook["type"],
            "name": override.get("name") or hook["name"],
            "template": override.get("template") or hook["template"],
            "default_name": hook["name"],
            "default_template": hook["template"],
            "enabled": override.get("enabled", True),
            "has_override": bool(override),
        })
    return result
