"""
Tests for text processing functions ported from YTRobot-v3.

Covers:
  - clean_for_tts: apostrof temizleme, akıllı tırnak, ellipsis
  - trim_silence: ffmpeg availability check (unit test only)
"""

from __future__ import annotations

import pytest

from backend.utils.text import clean_for_tts, normalize_narration


# ─── clean_for_tts testleri ──────────────────────────────────────────────────


class TestCleanForTTS:
    """TTS ön-işleme fonksiyonu testleri."""

    def test_empty_input(self) -> None:
        assert clean_for_tts("") == ""
        assert clean_for_tts(None) is None  # type: ignore[arg-type]

    def test_apostrophe_removal_default(self) -> None:
        """Türkçe ek apostrofları kaldırılmalı."""
        assert clean_for_tts("İran'ın") == "İranın"
        assert clean_for_tts("Trump'ın") == "Trumpın"
        assert clean_for_tts("NASA'nın") == "NASAnın"

    def test_apostrophe_preserved(self) -> None:
        """remove_apostrophes=False ile apostroflar korunmalı."""
        assert clean_for_tts("İran'ın", remove_apostrophes=False) == "İran'ın"

    def test_smart_quotes_normalized(self) -> None:
        """Akıllı tırnak karakterleri düz apostrofa dönmeli."""
        # U+2018 (left single quote)
        assert "\u2018" not in clean_for_tts("test\u2018value")
        # U+2019 (right single quote / apostrof)
        assert "\u2019" not in clean_for_tts("test\u2019value")
        # U+201A (single low-9 quote)
        assert "\u201a" not in clean_for_tts("test\u201avalue")

    def test_smart_quotes_to_apostrophe_then_removed(self) -> None:
        """Akıllı tırnaklar → düz apostrof → kaldırılır."""
        result = clean_for_tts("test\u2019value")
        assert result == "testvalue"

    def test_smart_quotes_preserved_when_no_remove(self) -> None:
        """remove_apostrophes=False: akıllı tırnak → düz apostrof (korunur)."""
        result = clean_for_tts("test\u2019value", remove_apostrophes=False)
        assert result == "test'value"

    def test_ellipsis_merged(self) -> None:
        """Üç nokta tek Unicode ellipsis'e dönüşmeli."""
        result = clean_for_tts("Bekle... sonra gör")
        assert "..." not in result
        assert "\u2026" in result  # Unicode ellipsis

    def test_multiple_spaces_collapsed(self) -> None:
        """Çoklu boşluklar teke inmeli."""
        assert clean_for_tts("a  b   c") == "a b c"

    def test_combined_transforms(self) -> None:
        """Tüm transformlar bir arada."""
        text = "İstanbul\u2019un  güzelliği...  harika"
        result = clean_for_tts(text)
        assert "'" not in result
        assert "..." not in result
        assert "  " not in result
        assert "İstanbulun" in result


class TestCleanForTTSIntegration:
    """clean_for_tts ve normalize_narration birlikte kullanımı."""

    def test_normalize_then_clean(self) -> None:
        """Pipeline sırası: normalize → clean_for_tts."""
        raw = "**İstanbul'un** güzelliği... *harika*"
        normalized = normalize_narration(raw)
        cleaned = clean_for_tts(normalized)
        # Markdown temizlenmeli
        assert "*" not in cleaned
        # Apostrof kaldırılmalı
        assert "'" not in cleaned
        # Ellipsis dönüşmeli
        assert "..." not in cleaned

    def test_altyazi_tts_text_divergence(self) -> None:
        """Altyazı metni ve TTS metni farklı olabilir — amaçlanan davranış."""
        raw = "NASA'nın projesi"
        subtitle_text = normalize_narration(raw)
        tts_text = clean_for_tts(subtitle_text)
        # Altyazı: apostrof korunur
        assert "'" in subtitle_text
        # TTS: apostrof kaldırılır
        assert "'" not in tts_text


# ─── apply_speed testleri ──────────────────────────────────────────────────

from unittest.mock import patch, MagicMock
from pathlib import Path
from backend.utils.text import apply_speed


class TestApplySpeed:
    """Post-synthesis ffmpeg atempo hız ayarı testleri."""

    def test_no_change_at_1x(self) -> None:
        """speed ~1.0 ise False dönmeli, ffmpeg çağrılmamalı."""
        assert apply_speed("/fake/audio.mp3", 1.0) is False
        assert apply_speed("/fake/audio.mp3", 0.999) is False
        assert apply_speed("/fake/audio.mp3", 1.005) is False

    def test_missing_file(self, tmp_path: Path) -> None:
        """Dosya yoksa False dönmeli."""
        assert apply_speed(tmp_path / "nonexistent.mp3", 1.5) is False

    @patch("backend.utils.text._subprocess")
    @patch("backend.utils.text._shutil")
    def test_normal_speed_2x(self, mock_shutil: MagicMock, mock_subprocess: MagicMock, tmp_path: Path) -> None:
        """2x hız — tek atempo=2.0000 filtresi."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"\xff" * 100)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        # tmp dosya oluştur (mock move'un başarılı olması için)
        with patch("backend.utils.text._tempfile") as mock_tempfile:
            tmp_out = tmp_path / "out.mp3"
            tmp_out.write_bytes(b"\xff" * 80)
            mock_tempfile.mkstemp.return_value = (99, str(tmp_out))

            result = apply_speed(str(audio), 2.0)

        assert result is True
        # ffmpeg çağrıldığını kontrol et
        call_args = mock_subprocess.run.call_args
        cmd = call_args[0][0]
        assert "atempo=2.0000" in cmd[cmd.index("-filter:a") + 1]

    @patch("backend.utils.text._subprocess")
    def test_speed_4x_chains_two_atempo(self, mock_subprocess: MagicMock, tmp_path: Path) -> None:
        """4x hız — iki atempo=2.0 zinciri gerekir."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"\xff" * 100)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        with patch("backend.utils.text._tempfile") as mock_tempfile:
            tmp_out = tmp_path / "out.mp3"
            tmp_out.write_bytes(b"\xff" * 80)
            mock_tempfile.mkstemp.return_value = (99, str(tmp_out))
            with patch("backend.utils.text._shutil"):
                apply_speed(str(audio), 4.0)

        call_args = mock_subprocess.run.call_args
        cmd = call_args[0][0]
        filter_str = cmd[cmd.index("-filter:a") + 1]
        assert filter_str.count("atempo=2.0") >= 2

    @patch("backend.utils.text._subprocess")
    def test_speed_025x_chains_two_half(self, mock_subprocess: MagicMock, tmp_path: Path) -> None:
        """0.25x hız — iki atempo=0.5 zinciri gerekir."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"\xff" * 100)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        with patch("backend.utils.text._tempfile") as mock_tempfile:
            tmp_out = tmp_path / "out.mp3"
            tmp_out.write_bytes(b"\xff" * 80)
            mock_tempfile.mkstemp.return_value = (99, str(tmp_out))
            with patch("backend.utils.text._shutil"):
                apply_speed(str(audio), 0.25)

        call_args = mock_subprocess.run.call_args
        cmd = call_args[0][0]
        filter_str = cmd[cmd.index("-filter:a") + 1]
        assert filter_str.count("atempo=0.5") >= 2

    @patch("backend.utils.text._subprocess")
    def test_ffmpeg_failure_returns_false(self, mock_subprocess: MagicMock, tmp_path: Path) -> None:
        """ffmpeg hata kodu döndürürse False dönmeli."""
        audio = tmp_path / "test.mp3"
        audio.write_bytes(b"\xff" * 100)

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = b"error"
        mock_subprocess.run.return_value = mock_result

        with patch("backend.utils.text._tempfile") as mock_tempfile:
            mock_tempfile.mkstemp.return_value = (99, str(tmp_path / "out.mp3"))
            result = apply_speed(str(audio), 1.5)

        assert result is False


# ─── TTS Capabilities testleri ─────────────────────────────────────────────

from backend.providers.tts.capabilities import (
    get_tts_capabilities,
    get_all_capabilities,
    TTSCapability,
)


class TestTTSCapabilities:
    """TTS provider capability model testleri."""

    def test_edge_tts_has_word_timing(self) -> None:
        caps = get_tts_capabilities("edge_tts")
        assert caps.supports_word_timing is True
        assert caps.word_timing_format == "word_boundary_ms"
        assert caps.timing_quality == "excellent"

    def test_edge_tts_pre_synthesis_speed(self) -> None:
        caps = get_tts_capabilities("edge_tts")
        assert caps.supports_pre_synthesis_speed is True
        assert caps.requires_post_synthesis_speed is False

    def test_elevenlabs_no_word_timing(self) -> None:
        caps = get_tts_capabilities("elevenlabs")
        assert caps.supports_word_timing is False
        assert caps.requires_alignment_fallback is True
        assert caps.recommended_subtitle_strategy == "whisper_api"

    def test_openai_tts_needs_whisper(self) -> None:
        caps = get_tts_capabilities("openai_tts")
        assert caps.supports_word_timing is False
        assert caps.requires_alignment_fallback is True

    def test_unknown_provider_returns_safe_default(self) -> None:
        caps = get_tts_capabilities("some_unknown_provider")
        assert caps.supports_word_timing is False
        assert caps.requires_post_synthesis_speed is True
        assert caps.recommended_subtitle_strategy == "equal_distribution"
        assert caps.timing_quality == "none"

    def test_frozen_dataclass(self) -> None:
        """TTSCapability is frozen — immutable."""
        caps = get_tts_capabilities("edge_tts")
        with pytest.raises(AttributeError):
            caps.supports_word_timing = False  # type: ignore[misc]

    def test_get_all_capabilities(self) -> None:
        all_caps = get_all_capabilities()
        assert "edge_tts" in all_caps
        assert "elevenlabs" in all_caps
        assert "openai_tts" in all_caps
        assert len(all_caps) == 3
        for name, cap in all_caps.items():
            assert isinstance(cap, TTSCapability)
