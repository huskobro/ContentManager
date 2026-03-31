# Zamanlama Karşılaştırması: Edge TTS ve Whisper

**Date:** 2026-03-31
**Question:** Whisper senkron için birincil kaynak olmalı mı?
**Answer: HAYIR — Edge TTS birincil kalmalı, Whisper fallback olarak kalmalı**

---

## Mevcut Sistem

```
Birincil:  Edge TTS WordBoundary events (ücretsiz, anlık, exact)
Fallback:  Whisper API (ücretli, +5-30s gecikme, ASR bazlı)
Son çare:  Eşit dağıtım
```

Kod: `backend/pipeline/steps/subtitles.py:348-389`

---

## Edge TTS WordBoundary Timing

**Mekanizma:** SSML synthesis sırasında her kelime için gerçek zamanlı event. TTS motoru doğrudan fonetik sınırda event fırlatır.

**Granülarite:** 12.5ms (TTS motorunun iç clock cycle'ı)

**Maliyet:** $0 (TTS senteziyle birlikte gelir)

**Gecikme:** 0ms (ses üretimi sırasında zaten capture edilir)

**Word match:** Her zaman exact — TTS'e gönderilen kelimeyle bire bir

### Ölçülen Kalite (bu job, 383 kelime)

| Metrik | Değer |
|--------|-------|
| Overlap | 0 |
| <60ms word | 0 |
| Sahne sınırı max drift | 3ms |
| Word start drift (TTS→subtitle) | max 0.5ms (fp yuvarlama) |
| Büyük boşluk doğruluğu | ±58ms (ffmpeg doğruladı) |
| Sistematik end_ms | ~30-100ms erken (fonetik sınır ≠ sessizlik sonu) |

---

## Whisper API Timing

**Mekanizma:** Ses dosyası → OpenAI ASR → word-level timestamps via `verbose_json`

**Granülarite:** ~50-200ms (ASR kaynaklı belirsizlik)

**Maliyet:** $0.006/dakika → bu job için ~$0.020

**Gecikme:** +5-30s per scene (API round-trip)

**Word match:** ASR transcript ≠ normalize_narration(script.narration)

### Whisper'ın Yapısal Sorunu

Whisper, sesi duyduğu gibi transkribe eder. Ancak altyazı `subtitle.text` alanı `normalize_narration(script.narration)` ile doldurulur. Bu iki metin farklı olabilir:

| Senaryo | Script metni | Whisper transkripti | Sonuç |
|---------|-------------|--------------------|-|
| Birleşik yazım | "on binlerce" | "onbinlerce" | Kelime sayısı uyumsuz → orphan kelime |
| Özel isim | "İstanbul" | "İstanbul'" veya "Istanbul" | Timing hizası kayar |
| Filler kelime | TTS bazen ekler | Whisper duyar | Ekstra kelime → index kaydı |
| Hızlı konuşma | "bir de" | "birde" | Merge → kelime kaybı |

**Sonuç:** Whisper'ın kelime sayısı veya sırası mismatch yaratması durumunda karaoke/hormozi
word highlight bozulur. Standard stil için etki yok ama kelime bazlı stil için kritik.

---

## Karşılaştırma Tablosu

| Özellik | Edge TTS | Whisper |
|---------|----------|---------|
| Maliyet | Ücretsiz | $0.006/dk (~$0.02/video) |
| Gecikme | 0ms | +5-30s/sahne |
| Granülarite | 12.5ms | ~50-200ms |
| Word match riski | 0 (exact) | ~5-15% (ASR WER) |
| Overlap riski | 0 | Düşük ama sıfır değil |
| Turkish support | Native (EmelNeural) | İyi ama mükemmel değil |
| Hallucination | Yok | Düşük risk var |
| End_ms bias | ~30-100ms erken | Daha doğru (ses biter) |

---

## Whisper'ın Daha İyi Olduğu Tek Senaryo

Edge TTS `end_ms` fonetik sınırda kapanır, gerçek sesin bitişinden ~100ms önce. Bu, hormozi/karaoke modunda her kelimenin vurgusunun ses hâlâ devam ederken kaybolması demek.

Whisper: `end` timestamp gerçek ses sonunu yakalar → karaoke vurgulaması daha doğal kapanır.

**Etkisi:** Sadece karaoke/hormozi stili kullanan kullanıcılar için, her kelimede ~50-100ms daha "yumuşak" kapanış.

**Tradeoff:** $0.02/video + 50-300s ek süre (tüm sahneler için Whisper) — çoğu kullanıcı için kabul edilemez.

---

## Önerilen Mimari

```
subtitle_use_whisper: false (admin default)
  ↓
Birincil: TTS word_timings (her zaman)
Fallback: Whisper (TTS timings yoksa AND subtitle_use_whisper=true)
Son çare: Eşit dağıtım

Admin panel seçeneği: subtitle_use_whisper toggle
  - false: mevcut davranış (ücretsiz, hızlı)
  - true: TTS timings olmayan providerlar için Whisper devreye girer
```

**Mevcut kod bu mimariye tam uygun** (`elif whisper_available:` — sadece TTS timings yoksa çalışır).

---

## Sonuç

**Whisper birincil yapılmamalı.**

Gerekçe:
1. Edge TTS word boundary 12.5ms granülaritesi, Whisper'ın 50-200ms ASR belirsizliğinden üstün
2. Word mismatch riski: Whisper ASR ≠ normalize_narration, karaoke highlight bozulabilir
3. $0.02/video ek maliyet + 50-300s ek süre — somut maliyet, minimum kazanım
4. end_ms ~100ms underestimate: algısal eşik altında (150ms), pratikte görünmez
5. Mevcut ElevenLabs gibi word boundary destekleyen tüm sağlayıcılarda aynı kalite

Whisper'ın doğru yeri: `subtitle_use_whisper=true` ile ElevenLabs veya word boundary
döndürmeyen sağlayıcılar için **admin ayarlı opsiyonel fallback**.

Edge TTS hâlihazırda bu görevi mükemmel yapıyor. Değiştirmek için net gerekçe yok.
