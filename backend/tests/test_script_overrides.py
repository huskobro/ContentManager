"""
Kategori ve hook override sistemi birim testleri.

Canonical fonksiyonlar: backend/pipeline/steps/script.py
  - _get_effective_category()
  - _get_effective_hooks()
  - get_category_prompt_enhancement()
  - build_enhanced_prompt() — enabled=False davranışı

Çalıştırma:
    python3 -m pytest backend/tests/test_script_overrides.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import backend.pipeline.steps.script as _script_mod
from backend.pipeline.steps.script import (
    CATEGORIES,
    _get_effective_category,
    _get_effective_hooks,
    get_category_prompt_enhancement,
    build_enhanced_prompt,
)


def _reset_overrides() -> None:
    """Test izolasyonu için override dict'lerini sıfırla."""
    _script_mod._category_overrides.clear()
    _script_mod._hook_overrides.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Kategori override testleri
# ─────────────────────────────────────────────────────────────────────────────


def test_effective_category_no_override_returns_hardcoded():
    """Override yokken hardcoded değerler döner."""
    _reset_overrides()
    cat = _get_effective_category("science")
    base = CATEGORIES["science"]
    assert cat["tone"] == base["tone"]
    assert cat["focus"] == base["focus"]
    assert cat["style_instruction"] == base["style_instruction"]
    assert cat["enabled"] is True


def test_effective_category_with_override_replaces_fields():
    """Override varken ilgili alanlar değiştirilir, diğerleri hardcoded kalır."""
    _reset_overrides()
    _script_mod._category_overrides["science"] = {
        "tone": "TEST TON",
        "focus": "",  # boş → hardcoded kalır
        "style_instruction": "TEST STİL",
        "enabled": True,
    }
    cat = _get_effective_category("science")
    assert cat["tone"] == "TEST TON"
    assert cat["focus"] == CATEGORIES["science"]["focus"]  # boş override → hardcoded
    assert cat["style_instruction"] == "TEST STİL"
    _reset_overrides()


def test_effective_category_enabled_false():
    """enabled=False override'ı doğru şekilde döner."""
    _reset_overrides()
    _script_mod._category_overrides["science"] = {"enabled": False}
    cat = _get_effective_category("science")
    assert cat["enabled"] is False
    _reset_overrides()


def test_prompt_enhancement_differs_with_override():
    """Override sonrası get_category_prompt_enhancement() farklı metin döner."""
    _reset_overrides()
    default_text = get_category_prompt_enhancement("science")
    _script_mod._category_overrides["science"] = {
        "tone": "ÖZEL TEST TON",
        "focus": "ÖZEL ODAK",
        "style_instruction": "ÖZEL STİL",
        "enabled": True,
    }
    override_text = get_category_prompt_enhancement("science")
    assert "ÖZEL TEST TON" in override_text
    assert "ÖZEL ODAK" in override_text
    assert "ÖZEL STİL" in override_text
    assert default_text != override_text
    _reset_overrides()


def test_build_enhanced_prompt_skips_disabled_category():
    """enabled=False kategorisi build_enhanced_prompt() tarafından atlanır."""
    _reset_overrides()
    _script_mod._category_overrides["science"] = {
        "tone": "ASLA GÖRÜNMEMELİ",
        "enabled": False,
    }
    base_instruction = "BASE INSTRUCTION"
    config = {"language": "tr", "category": "science", "use_hook_variety": False}
    enhanced, _ = build_enhanced_prompt("Test Başlığı", config, base_instruction)
    assert "ASLA GÖRÜNMEMELİ" not in enhanced
    assert "KATEGORI" not in enhanced  # kategori bloğu hiç eklenmemeli
    _reset_overrides()


def test_build_enhanced_prompt_adds_enabled_category():
    """enabled=True (veya override yok) kategorisi prompt'a eklenir."""
    _reset_overrides()
    base_instruction = "BASE INSTRUCTION"
    config = {"language": "tr", "category": "science", "use_hook_variety": False}
    enhanced, _ = build_enhanced_prompt("Test Başlığı", config, base_instruction)
    assert "KATEGORI" in enhanced
    assert "Bilim" in enhanced


def test_build_enhanced_prompt_general_never_added():
    """general kategorisi her zaman atlanır (enabled/disabled bağımsız)."""
    _reset_overrides()
    base_instruction = "BASE INSTRUCTION"
    config = {"language": "tr", "category": "general", "use_hook_variety": False}
    enhanced, _ = build_enhanced_prompt("Test Başlığı", config, base_instruction)
    assert "KATEGORI" not in enhanced


# ─────────────────────────────────────────────────────────────────────────────
# Hook override testleri
# ─────────────────────────────────────────────────────────────────────────────


def test_effective_hooks_no_override_returns_all():
    """Override yokken tüm 8 hook döner."""
    _reset_overrides()
    hooks = _get_effective_hooks("tr")
    assert len(hooks) == 8


def test_effective_hooks_disabled_hook_excluded():
    """enabled=False olan hook filtrelenir."""
    _reset_overrides()
    _script_mod._hook_overrides[("shocking_fact", "tr")] = {"enabled": False}
    hooks = _get_effective_hooks("tr")
    types = [h["type"] for h in hooks]
    assert "shocking_fact" not in types
    assert len(hooks) == 7
    _reset_overrides()


def test_effective_hooks_template_override_applied():
    """Template override uygulanır."""
    _reset_overrides()
    _script_mod._hook_overrides[("question", "tr")] = {
        "name": "ÖZEL SORU",
        "template": "ÖZEL: {topic} hakkında ne düşünüyorsunuz?",
        "enabled": True,
    }
    hooks = _get_effective_hooks("tr")
    question_hook = next(h for h in hooks if h["type"] == "question")
    assert question_hook["name"] == "ÖZEL SORU"
    assert question_hook["template"] == "ÖZEL: {topic} hakkında ne düşünüyorsunuz?"
    _reset_overrides()


def test_effective_hooks_all_disabled_fallback_to_base():
    """Tüm hook'lar disabled olursa tam hardcoded liste döner."""
    _reset_overrides()
    from backend.pipeline.steps.script import _HOOKS_TR
    for hook in _HOOKS_TR:
        _script_mod._hook_overrides[(hook["type"], "tr")] = {"enabled": False}
    hooks = _get_effective_hooks("tr")
    assert len(hooks) == 8  # fallback: tam liste
    _reset_overrides()


def test_effective_hooks_en_language():
    """İngilizce hook listesi döner."""
    _reset_overrides()
    hooks_en = _get_effective_hooks("en")
    assert len(hooks_en) == 8
    # En az bir hook İngilizce template içermeli
    templates = " ".join(h["template"] for h in hooks_en)
    assert any(h["type"] == "shocking_fact" for h in hooks_en)


# ─────────────────────────────────────────────────────────────────────────────
# A/B kanıt testi — override before/after farkı
# ─────────────────────────────────────────────────────────────────────────────


def test_ab_category_before_after():
    """
    A/B kanıtı: aynı fonksiyon çağrısı override öncesi ve sonrası farklı sonuç döner.
    """
    _reset_overrides()

    # A — default
    a_result = get_category_prompt_enhancement("history")
    assert "TON:" in a_result

    # B — override
    _script_mod._category_overrides["history"] = {
        "tone": "AB_TEST_TON",
        "focus": "AB_TEST_ODAK",
        "style_instruction": "AB_TEST_STIL",
        "enabled": True,
    }
    b_result = get_category_prompt_enhancement("history")

    assert "AB_TEST_TON" in b_result
    assert "AB_TEST_ODAK" in b_result
    assert "AB_TEST_STIL" in b_result
    assert a_result != b_result

    _reset_overrides()


def test_ab_hook_before_after():
    """
    A/B kanıtı: hook template override öncesi ve sonrası farklı hook döner.
    """
    _reset_overrides()
    from backend.pipeline.steps.script import _HOOKS_TR

    # A — default template
    default_hook = next(h for h in _HOOKS_TR if h["type"] == "story")
    hooks_before = _get_effective_hooks("tr")
    story_before = next(h for h in hooks_before if h["type"] == "story")
    assert story_before["template"] == default_hook["template"]

    # B — override template
    _script_mod._hook_overrides[("story", "tr")] = {
        "name": "ÖZEL HİKAYE",
        "template": "AB_TEST_HIKAYE: {topic}",
        "enabled": True,
    }
    hooks_after = _get_effective_hooks("tr")
    story_after = next(h for h in hooks_after if h["type"] == "story")
    assert story_after["template"] == "AB_TEST_HIKAYE: {topic}"
    assert story_before["template"] != story_after["template"]

    _reset_overrides()


# ─────────────────────────────────────────────────────────────────────────────
# CRUD sınır testi
# ─────────────────────────────────────────────────────────────────────────────


def test_unknown_category_key_uses_general_fallback():
    """Bilinmeyen kategori key'i general fallback'e düşer, hata fırlatmaz."""
    _reset_overrides()
    cat = _get_effective_category("nonexistent_key")
    assert cat["name_tr"] == CATEGORIES["general"]["name_tr"]


def test_categories_are_fixed_set():
    """Kategori listesi 6 hardcoded item içerir, daha fazla değil."""
    assert len(CATEGORIES) == 6
    assert set(CATEGORIES.keys()) == {
        "general", "true_crime", "science", "history", "motivation", "religion"
    }


# ─────────────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
