"""
Metin normalizasyon yardımcıları.

Bu modül, TTS ve altyazı pipeline'larının paylaştığı
canonical normalize_narration() fonksiyonunu içerir.

Her iki adım da aynı fonksiyonu kullanır — böylece
TTS'e gönderilen metin ile altyazıda görünen metin
birebir aynı token dizisini paylaşır ve word-timing
hizalaması kaymasız olur.
"""

from __future__ import annotations

import re as _re


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
