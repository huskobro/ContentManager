# TTS → Subtitle Text Chain Trace

**Date:** 2026-03-31 (güncel — ikinci doğrulama turu)
**Session:** `c2261ada354448c7b2153a36dfb246a0`
**Job title:** "Ateş Nasıl Bulundu? İnsanlığın En Büyük Keşfi"
**Verification method:** Gerçek job artifact analizi + ffmpeg sessizlik doğrulaması
**Result: PASS — metin eşleşmesi 10/10, timing kalitesi yüksek, sorun yok**

---

## Zincir

```
script.narration
  → normalize_narration()                         [standard_video/pipeline.py]
  → Edge TTS provider → WordBoundary events
  → step_tts.json: {scene, filename, duration, size, word_timings, text}

script.narration
  → normalize_narration()                         [pipeline/steps/subtitles.py]
  → subtitle entry text
  → step_tts.json'dan word_timings okunur
  → cumulative offset eklenir
  → step_subtitles.json: {scene, text, start_time, end_time, word_timings, timing_source}
```

Her iki dal da **aynı** `normalize_narration()` fonksiyonunu kullanır.

---

## normalize_narration() Davranışı

Dosya: `backend/utils/text.py`

- `**bold**`, `*italic*`, `_underscore_` → kaldırır
- `## başlık` → kaldırır
- `` `backtick` `` → kaldırır
- Satır başı `-`, `•`, `*` bullet → kaldırır
- Çoklu newline → space
- Baş/son whitespace → strip

**Sonuç:** TTS'e giden metin == altyazıda görünen metin. Kesin.

---

## Metin Eşleşmesi (10 Sahne)

| Sahne | Narrasyon uzunluğu | normalize sonrası | subtitle.text == normalize | TTS kelime | Sub kelime |
|-------|-------------------|-------------------|---------------------------|-----------|-----------|
| 1 | 329 karakter | 329 karakter | ✓ EXACT | 48 kelime | 48 kelime |
| 2 | 278 | 278 | ✓ EXACT | 34 | 34 |
| 3 | 278 | 278 | ✓ EXACT | 37 | 37 |
| 4 | 264 | 264 | ✓ EXACT | 32 | 32 |
| 5 | 262 | 262 | ✓ EXACT | 36 | 36 |
| 6 | 298 | 298 | ✓ EXACT | 41 | 41 |
| 7 | 268 | 268 | ✓ EXACT | 35 | 35 |
| 8 | 295 | 295 | ✓ EXACT | 37 | 37 |
| 9 | 312 | 312 | ✓ EXACT | 38 | 38 |
| 10 | 312 | 312 | ✓ EXACT | 45 | 45 |

**Toplam 383 kelime — 0 kelime kaybı, 0 ayrışma.**

---

## Timing Kalitesi

### Sahne sınırı uyumu

| Sahne | Süre | sub start | sub end | Beklenen | inter-scene gap |
|-------|------|-----------|---------|----------|----------------|
| 1 | 23.19s | 0.000s | 23.190s | 0.000–23.190s | N/A |
| 2 | 22.0s | 23.190s | 45.190s | 23.190–45.190s | 0.002s |
| 3 | 18.95s | 45.190s | 64.140s | 45.190–64.140s | 0.000s |
| 4 | 17.2s | 64.140s | 81.340s | 64.140–81.340s | 0.000s |
| 5 | 18.49s | 81.340s | 99.830s | 81.340–99.830s | 0.000s |
| 6 | 18.75s | 99.830s | 118.580s | 99.830–118.580s | 0.002s |
| 7 | 19.06s | 118.580s | 137.640s | 118.580–137.640s | 0.000s |
| 8 | 22.11s | 137.640s | 159.750s | 137.640–159.750s | -0.002s |
| 9 | 22.14s | 159.750s | 181.890s | 159.750–181.890s | -0.002s |
| 10 | 21.98s | 181.890s | 203.870s | 181.890–203.870s | 0.003s |

**Max inter-scene gap: 3ms — algısal sıfır.**

### Word timing drift (TTS → subtitle)

Tüm sahneler için ilk 3 kelime drift testi:
- Max drift: **0.0005s (0.5ms)** — floating point yuvarlama
- Drift kaynağı: ms→s dönüşümünde `round(..., 3)` sınırı

### Word timing istatistikleri (383 kelime)

| Metrik | Değer |
|--------|-------|
| Min kelime süresi | 75ms |
| Max kelime süresi | 1062ms |
| Ortalama | 410ms |
| Medyan | 387ms |
| Std sapma | 181ms |
| Overlap | 0 |
| <60ms kelime | 0 |

---

## Büyük Boşlukların Doğrulanması (ffmpeg Sessizlik Analizi)

Edge TTS birden fazla cümle arasında doğal duraklar bırakır (1–1.2s). Bu boşluklardaki ses
sessizliği ffmpeg ile doğrulandı:

| Kelime geçişi | TTS gap | ffmpeg sessizlik | Eşleşme | Drift |
|---------------|---------|-----------------|---------|-------|
| muyuz→Muhtemelen | 4.562→5.775s | 4.593→5.880s | ✓ | -31ms/-105ms |
| hayır→Peki | 6.800→7.850s | 6.858→7.971s | ✓ | -58ms/-121ms |
| düşünün→Tıpkı | 11.737→12.775s | 11.749→12.882s | ✓ | -12ms/-107ms |
| gibi→ateşi | 15.112→15.437s | 15.149→15.536s | ✓ | -37ms/-99ms |
| biriydi→Ama | 19.462→20.587s | 19.497→20.693s | ✓ | -35ms/-106ms |

**Bulgu:** Edge TTS `end_ms` sistematik olarak ~30-100ms sessizliğin gerçek bitişinden önce biter.
Bu "word boundary event" doğasından kaynaklanır (sesin anatomik bitişi değil, fonetik sınırı).
Algısal etki: karaoke stili için her kelime 30-100ms erken söner — insan algı eşiği (~150ms) altında.

---

## Mevcut Timing Kaynağı Dağılımı

Tüm 10 sahne: `timing_source: "tts_word_timing"` — Whisper fallback'e düşülmedi.

---

## Kod Yolu Özeti

| Adım | Dosya | Satır |
|------|-------|-------|
| TTS metni normalize et | `standard_video/pipeline.py` | `tts_text = normalize_narration(narration)` |
| TTS ses üret + word boundary al | `standard_video/pipeline.py` | provider.synthesize → word_timings |
| TTS manifest kaydet | `standard_video/pipeline.py` | tts_results.append({..., "text": tts_text}) |
| Subtitle metni normalize et | `pipeline/steps/subtitles.py:343` | `narration = normalize_narration(raw_narration)` |
| Word timing çıkar | `pipeline/steps/subtitles.py:350` | `_extract_word_timings_from_tts(..., current_offset_sec)` |
| Subtitle kaydet | `pipeline/steps/subtitles.py:394` | subtitle_entries.append(...) |

---

## Verdict

| Kontrol | Sonuç |
|---------|-------|
| TTS text == subtitle text (normalize sonrası) | ✓ PASS — 10/10 exact match |
| Kelime sayısı eşleşmesi | ✓ PASS — 383/383 |
| Word timing drift | ✓ PASS — max 0.5ms |
| Sahne sınırı uyumu | ✓ PASS — max 3ms inter-scene gap |
| Büyük boşluklar gerçek mi | ✓ PASS — ffmpeg doğruladı |
| Sistematik end_ms underestimate | ℹ️ 30-100ms, algısal eşik altında |
| Timing source | tts_word_timing (tüm sahneler) |
