"""
Metin normalizasyon ve TTS ön-işleme yardımcıları.

Bu modül, TTS ve altyazı pipeline'larının paylaştığı
canonical normalize_narration() fonksiyonunu ve TTS'e
özgü ek metin temizleme fonksiyonlarını içerir.

Her iki adım da aynı normalize_narration fonksiyonunu kullanır — böylece
TTS'e gönderilen metin ile altyazıda görünen metin
birebir aynı token dizisini paylaşır ve word-timing
hizalaması kaymasız olur.

Ek fonksiyonlar (YTRobot-v3'ten port edildi):
  • clean_for_tts: Apostrof temizleme, akıllı tırnak normalizasyonu,
    üç nokta birleştirme. TTS motorlarında mikro-duraklama sorununu çözer.
  • trim_silence: Ses dosyasının başındaki sessizliği ffmpeg ile kırpar.
"""

from __future__ import annotations

import re as _re
import shutil as _shutil
import subprocess as _subprocess
import tempfile as _tempfile
from pathlib import Path as _Path

from backend.utils.logger import get_logger as _get_logger

_log = _get_logger(__name__)


def normalize_narration(text: str) -> str:
    """
    LLM çıktısındaki narasyon metnini TTS ve altyazı için normalize eder.

    Yapılan temizlikler:
      • Markdown kalın/italik (*, **, _, __)
      • Markdown başlıklar (## ...)
      • Backtick kod blokları (`...`)
      • Satır başı madde işaretleri (-, •, *)
      • Fazla satır sonu ve boşluk

    Args:
        text: Ham narasyon metni (LLM çıktısından).

    Returns:
        Temizlenmiş metin. Boş veya None girdi için olduğu gibi döner.
    """
    if not text:
        return text

    # Markdown kalın/italik işaretlerini kaldır (**, *, __, _)
    cleaned = _re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text)
    cleaned = _re.sub(r"_{1,3}(.*?)_{1,3}", r"\1", cleaned)
    # Markdown başlıkları (## Başlık → Başlık)
    cleaned = _re.sub(r"^#{1,6}\s+", "", cleaned, flags=_re.MULTILINE)
    # Backtick kod bloklarını temizle
    cleaned = _re.sub(r"`+([^`]*)`+", r"\1", cleaned)
    # Satır başındaki madde işaretlerini kaldır (- , • , * )
    cleaned = _re.sub(r"^\s*[-•*]\s+", "", cleaned, flags=_re.MULTILINE)
    # Birden fazla satır sonunu tek boşluğa indir
    cleaned = _re.sub(r"\n{2,}", " ", cleaned)
    cleaned = _re.sub(r"\n", " ", cleaned)
    # Birden fazla boşluğu teke indir ve strip
    cleaned = _re.sub(r" {2,}", " ", cleaned).strip()

    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# TTS Ön-İşleme: Apostrof temizleme ve akıllı tırnak normalizasyonu
# (YTRobot-v3/providers/tts/base.py::clean_for_tts port'u)
# ─────────────────────────────────────────────────────────────────────────────


def clean_for_tts(text: str, *, remove_apostrophes: bool = True) -> str:
    """
    TTS motorlarına gönderilecek metni temizler.

    Yapılan işlemler:
      1. Akıllı/kıvırcık tırnakları düz apostrofa dönüştürür
         (U+2018, U+2019, U+201A → ASCII ')
      2. Apostrofları kaldırır (varsayılan açık)
         — Türkçe ek apostrofları (Iran'ın, Trump'ın) ElevenLabs ve
         benzeri TTS motorlarında mikro-duraklama yaratır.
      3. Üç nokta (...) → tek Unicode ellipsis (…)
         — TTS motorları üç ayrı nokta yerine tek duraklama yapar.
      4. Fazla boşlukları temizler.

    Args:
        text: Temizlenecek metin.
        remove_apostrophes: True ise tüm apostrofları kaldırır.
            Türkçe TTS için önerilir (varsayılan: True).

    Returns:
        Temizlenmiş metin.
    """
    if not text:
        return text

    # Akıllı tırnakları düz apostrofa dönüştür
    cleaned = text.replace("\u2018", "'")   # left single quote
    cleaned = cleaned.replace("\u2019", "'")  # right single quote / apostrof
    cleaned = cleaned.replace("\u201a", "'")  # single low-9 quote

    # Apostrofları kaldır — Türkçe ek apostrofları TTS'te mikro-duraklama yaratır
    if remove_apostrophes:
        cleaned = cleaned.replace("'", "")

    # Üç nokta → tek Unicode ellipsis (tek duraklama)
    cleaned = cleaned.replace("...", "\u2026")

    # Fazla boşlukları temizle
    cleaned = _re.sub(r" {2,}", " ", cleaned).strip()

    return cleaned


# ─────────────────────────────────────────────────────────────────────────────
# Ses Dosyası İşleme: Baştaki sessizliği kırpma
# (YTRobot-v3/providers/tts/base.py::trim_silence port'u)
# ─────────────────────────────────────────────────────────────────────────────


def trim_silence(
    audio_path: str | _Path,
    *,
    threshold_db: float = -35.0,
    min_duration: float = 0.1,
) -> bool:
    """
    Ses dosyasının BAŞINDAKİ sessizliği kırpar (in-place).

    Sondaki sessizliğe dokunmaz — sahne geçişlerinde doğal
    nefes/decay korunur.

    ffmpeg ``silenceremove`` filtresi kullanır.

    Args:
        audio_path: Ses dosyasının yolu (mp3, wav, m4a vb.).
        threshold_db: Sessizlik eşiği (dB). Varsayılan -35 dB.
        min_duration: Minimum sessizlik süresi (saniye). Varsayılan 0.1s.

    Returns:
        True: Kırpma başarılı (dosya güncellendi veya zaten sessizlik yok).
        False: ffmpeg hatası (orijinal dosya korunur).
    """
    audio_path = _Path(audio_path)
    if not audio_path.exists():
        _log.warning("trim_silence: Dosya bulunamadı", path=str(audio_path))
        return False

    suffix = audio_path.suffix or ".mp3"
    tmp_fd, tmp_path = _tempfile.mkstemp(suffix=suffix)

    try:
        # sadece baştaki sessizliği kaldır (stop_periods=1, stop_duration → start only)
        cmd = [
            "ffmpeg", "-y",
            "-i", str(audio_path),
            "-af", (
                f"silenceremove=start_periods=1"
                f":start_duration={min_duration}"
                f":start_threshold={threshold_db}dB"
            ),
            "-c:a", "libmp3lame" if suffix == ".mp3" else "aac",
            "-q:a", "2",
            tmp_path,
        ]

        result = _subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            _log.warning(
                "trim_silence: ffmpeg hatası",
                returncode=result.returncode,
                stderr=result.stderr.decode(errors="replace")[:300],
            )
            return False

        # Sonuç dosyası varsa ve boyutu > 0 ise orijinalin üzerine yaz
        tmp_file = _Path(tmp_path)
        if tmp_file.exists() and tmp_file.stat().st_size > 0:
            _shutil.move(str(tmp_file), str(audio_path))
            return True

        return False

    except _subprocess.TimeoutExpired:
        _log.warning("trim_silence: ffmpeg zaman aşımı", path=str(audio_path))
        return False
    except Exception as exc:
        _log.warning("trim_silence: Beklenmeyen hata", error=str(exc)[:200])
        return False
    finally:
        # Temp dosya hâlâ varsa temizle
        import os
        try:
            os.close(tmp_fd)
        except OSError:
            pass
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Ses Hız Ayarı: ffmpeg atempo ile post-synthesis speed
# (YTRobot-v3/providers/tts/base.py::apply_speed port'u)
# ─────────────────────────────────────────────────────────────────────────────


def apply_speed(
    audio_path: str | _Path,
    speed: float,
) -> bool:
    """
    Ses dosyasının hızını ffmpeg atempo filtresi ile değiştirir (in-place).

    ffmpeg atempo filtresi 0.5-2.0 aralığında çalışır.
    Bu aralık dışındaki hızlar için birden fazla atempo filtresi zincirlenir.
    Örn: speed=4.0 → atempo=2.0,atempo=2.0
         speed=0.25 → atempo=0.5,atempo=0.5

    Bu fonksiyon post-synthesis speed ayarı içindir — TTS'in kendi
    hız parametresi olmayan sağlayıcılarda kullanılır.
    Edge TTS gibi pre-synthesis hız desteği olan sağlayıcılarda
    bu fonksiyon çağrılmamalıdır (çift hız uygulanır).

    Args:
        audio_path: Ses dosyasının yolu (mp3, wav, m4a vb.).
        speed: Hız çarpanı (0.25-4.0). 1.0 = değişiklik yok.

    Returns:
        True: Hız değişikliği başarılı.
        False: Hata oluştu veya speed ~1.0 (değişiklik gerekmedi).
    """
    if abs(speed - 1.0) < 0.01:
        return False  # Değişiklik gerekmez

    audio_path = _Path(audio_path)
    if not audio_path.exists():
        _log.warning("apply_speed: Dosya bulunamadı", path=str(audio_path))
        return False

    # atempo filter chain oluştur (0.5-2.0 aralığı kısıtı)
    filters: list[str] = []
    s = speed
    while s > 2.0:
        filters.append("atempo=2.0")
        s /= 2.0
    while s < 0.5:
        filters.append("atempo=0.5")
        s *= 2.0
    filters.append(f"atempo={s:.4f}")
    filter_str = ",".join(filters)

    suffix = audio_path.suffix or ".mp3"
    tmp_fd, tmp_path = _tempfile.mkstemp(suffix=suffix)

    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(audio_path),
            "-filter:a", filter_str,
            "-c:a", "libmp3lame" if suffix == ".mp3" else "aac",
            "-q:a", "2",
            tmp_path,
        ]

        result = _subprocess.run(
            cmd,
            capture_output=True,
            timeout=60,
        )

        if result.returncode != 0:
            _log.warning(
                "apply_speed: ffmpeg hatası",
                returncode=result.returncode,
                stderr=result.stderr.decode(errors="replace")[:300],
            )
            return False

        tmp_file = _Path(tmp_path)
        if tmp_file.exists() and tmp_file.stat().st_size > 0:
            _shutil.move(str(tmp_file), str(audio_path))
            return True

        return False

    except _subprocess.TimeoutExpired:
        _log.warning("apply_speed: ffmpeg zaman aşımı", path=str(audio_path))
        return False
    except Exception as exc:
        _log.warning("apply_speed: Beklenmeyen hata", error=str(exc)[:200])
        return False
    finally:
        import os
        try:
            os.close(tmp_fd)
        except OSError:
            pass
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
