"""
normalize_narration() birim testleri.

Canonical fonksiyon: backend/utils/text.py
TTS ve subtitle pipeline'ları bu tek fonksiyonu paylaşır.

Çalıştırma:
    python3 -m pytest backend/tests/test_normalize_narration.py -v
    veya pytest yoksa:
    python3 backend/tests/test_normalize_narration.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Proje kökünü sys.path'e ekle (pytest olmadan da çalışabilsin)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.utils.text import normalize_narration


# ─── Boş/None girdi ──────────────────────────────────────────────────────────

def test_empty_string_returns_empty():
    assert normalize_narration("") == ""


def test_none_returns_none():
    assert normalize_narration(None) is None


# ─── Markdown temizleme ──────────────────────────────────────────────────────

def test_bold_asterisks_removed():
    assert normalize_narration("**bold** text") == "bold text"


def test_italic_asterisk_removed():
    assert normalize_narration("*italic* text") == "italic text"


def test_bold_italic_triple_asterisk():
    assert normalize_narration("***bold italic***") == "bold italic"


def test_underscore_bold_removed():
    assert normalize_narration("__underline bold__") == "underline bold"


def test_underscore_italic_removed():
    assert normalize_narration("_italic_ word") == "italic word"


def test_heading_h2_removed():
    assert normalize_narration("## Heading here") == "Heading here"


def test_heading_h1_removed():
    assert normalize_narration("# Title") == "Title"


def test_heading_h4_removed():
    assert normalize_narration("#### Deep heading") == "Deep heading"


def test_backtick_code_removed():
    assert normalize_narration("`code` text") == "code text"


def test_triple_backtick_removed():
    assert normalize_narration("```block``` text") == "block text"


# ─── Madde işaretleri ────────────────────────────────────────────────────────

def test_dash_bullet_removed():
    assert normalize_narration("- bullet point") == "bullet point"


def test_unicode_bullet_removed():
    assert normalize_narration("• bullet point") == "bullet point"


def test_asterisk_bullet_removed():
    assert normalize_narration("* list item") == "list item"


# ─── Boşluk / satır sonu normalizasyonu ─────────────────────────────────────

def test_double_newline_to_space():
    assert normalize_narration("line1\n\nline2") == "line1 line2"


def test_single_newline_to_space():
    assert normalize_narration("line1\nline2") == "line1 line2"


def test_multiple_spaces_collapsed():
    assert normalize_narration("too   many   spaces") == "too many spaces"


def test_leading_trailing_whitespace_stripped():
    assert normalize_narration("  leading and trailing  ") == "leading and trailing"


# ─── Karma senaryolar ────────────────────────────────────────────────────────

def test_mixed_markdown():
    text = "**Bu** bir *test* metnidir.\n\n## Başlık\n- Madde 1"
    assert normalize_narration(text) == "Bu bir test metnidir. Başlık Madde 1"


def test_plain_text_unchanged():
    text = "Bu düz bir metin, herhangi bir markdown yok."
    assert normalize_narration(text) == text


def test_turkish_characters_preserved():
    text = "Türkçe karakterler: ğüşıöç ĞÜŞİÖÇ"
    assert normalize_narration(text) == text


# ─── Doğrudan çalıştırma ────────────────────────────────────────────────────

if __name__ == "__main__":
    import inspect

    passed = 0
    failed = 0
    for name, func in inspect.getmembers(sys.modules[__name__], inspect.isfunction):
        if name.startswith("test_"):
            try:
                func()
                passed += 1
                print(f"  ✓ {name}")
            except AssertionError as e:
                failed += 1
                print(f"  ✗ {name}: {e}")

    total = passed + failed
    print(f"\n{passed}/{total} tests passed")
    if failed:
        sys.exit(1)
