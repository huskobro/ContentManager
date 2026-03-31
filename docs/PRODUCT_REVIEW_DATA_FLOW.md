# Ürün İnceleme — Veri Akışı

> Versiyon: 0.7.0 · Tarih: 2026-03-31

Bu doküman, Product Review modülündeki her görsel bileşenin veri kaynağını, pipeline boyunca nasıl aktığını ve feature flag'lerin nasıl çalıştığını açıklar.

---

## Pipeline Genel Bakış

```
config (_product_name, _product_price, review_*, ...)
  └─► step_script_review   (LLM → scenes[] + overall_score + top_comments + ...)
        └─► step_tts          (ses dosyaları)
              └─► step_visuals  (görsel dosyaları)
                    └─► step_subtitles (Whisper → entries[])
                          └─► step_composition_remotion
                                └─► _build_product_review_props()
                                      └─► ProductReview.tsx
```

---

## Bileşen Bazlı Veri Zinciri

### 1. Genel Skor / ScoreRing (`overallScore`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| LLM çıktısı | `script_data.overall_score` | `step_script_review` → `script_data.setdefault("overall_score", 7.0)` |
| Config (override) | `config.review_score` | Admin/user override — LLM değerini ezer |
| Props builder | `overallScore` | `script_data.get("overall_score") or config.get("review_score", 0)` ← **Fix: 2026-03-31** |
| Remotion | `ScoreRing.tsx` | Animasyonlu score halka, 10 üzerinden gösterilir |

**LLM davranışı:** `step_script_review` sonucu `overall_score` 1-10 arası bir float üretir. LLM üretmezse `setdefault(7.0)` ile 7.0 atanır.
**Önceki Bug (düzeltildi):** `config.get("review_score", 0)` kullanılıyordu → LLM değeri görmezden geliniyordu, admin configure etmezse 0/10 görünüyordu.
**Fix:** `script_data.get("overall_score") or config.get("review_score", 0)` — LLM öncelikli, config override.
**Boş veri davranışı:** `overallScore = 0` ise ScoreRing 0/10 gösterir (görünür ama içerik anlamsız).

---

### 2. Fiyat Rozeti / PriceBadge (`price`, `originalPrice`, `currency`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Feature flag | `review_price_enabled` | `DEFAULT_CONFIG = False` — varsayılan **kapalı** |
| Config (zorunlu) | `_product_price` | Job yaratılırken kullanıcı girer |
| Config (opsiyonel) | `_product_original_price` | İndirim için eski fiyat |
| LLM (fallback) | `script_data.price` | LLM bazen fiyat içerebilir (tutarsız) |
| Props builder | `result["price"]` | Sadece `review_price_enabled=True` VE fiyat varsa eklenir |
| Remotion | `PriceBadge.tsx` | Animasyonlu sayaç, indirim badge'i |

**Aktifleştirme:** `review_price_enabled: true` + `_product_price` config'de olmalı.
**Boş veri davranışı:** `price` prop geçilmezse `PriceBadge` render edilmez (ProductReview.tsx'te koşullu render).
**İndirim hesabı:** `originalPrice > price` ise yüzde fark Remotion içinde otomatik hesaplanır.

---

### 3. Yıldız Puanı / StarRating (`starRating`, `reviewCount`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Feature flag | `review_star_rating_enabled` | `DEFAULT_CONFIG = False` — varsayılan **kapalı** |
| Config (zorunlu) | `_product_star_rating` | Job yaratılırken kullanıcı girer (0-5 arası float) |
| Config (opsiyonel) | `_product_review_count` | Yorum sayısı |
| LLM (fallback) | `script_data.star_rating` | LLM nadiren üretir |
| Props builder | `result["starRating"]` | Sadece `review_star_rating_enabled=True` VE değer varsa eklenir |
| Remotion | `StarRating.tsx` | 5 yıldız, kesirli dolum, yorum sayısı |

**Aktifleştirme:** `review_star_rating_enabled: true` + `_product_star_rating` config'de olmalı.
**Boş veri davranışı:** `starRating` prop yoksa `StarRating` render edilmez.

---

### 4. Yüzen Yorumlar / FloatingComments (`topComments`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Feature flag | `review_comments_enabled` | `DEFAULT_CONFIG = False` — varsayılan **kapalı** |
| Config (zorunlu) | `_product_top_comments` | `list[str]`, job yaratılırken kullanıcı girer |
| LLM (birincil) | `script_data.top_comments` | `step_script_review` LLM yorumları üretebilir |
| Props builder | `result["topComments"]` | Max 5 yorum, sadece flag açıksa eklenir |
| Remotion | `FloatingComments.tsx` | Pop-in animasyonu, float motion, 3 sn fade-out |

**LLM davranışı:** `step_script_review` prompt'u `top_comments` üretmesini talep eder. Üretilen yorumlar `script_data.top_comments` olarak gelir. Config `_product_top_comments` override eder.
**Aktifleştirme:** `review_comments_enabled: true` + yorumlar (`_product_top_comments` veya LLM'den).
**Boş veri davranışı:** `topComments` yoksa `FloatingComments` render edilmez.

---

### 5. Bölüm Başlıkları / Section Headings

| Aşama | Alan | Kaynak |
|-------|------|--------|
| LLM çıktısı | `scene.visual_keyword` | Her sahne için keyword |
| Props builder | `section.heading` | `scene.get("visual_keyword", f"Bölüm {n}")` |
| Remotion | `ProductReview.tsx` bölüm etiketi | Hook/Overview/Pros/Cons/Verdict label |

**Bölüm tipi ataması:** `section_type` LLM'den gelirse kullanılır, yoksa sıra ile atanır: `["hook", "overview", "pros", "cons", "verdict"]`.

---

### 6. Altyazı

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Whisper | `subtitle_entries` | Ses dosyalarından kelime-bazlı zamanlama |
| Props builder | `subtitle_chunks` | `_build_subtitle_chunks()` |
| Remotion | `Subtitles.tsx` | Zamanlama eşleşirse ekranda |

---

## Feature Flag Özeti

| Flag | Varsayılan | Aktifleştirme | Bağımlı Alan |
|------|-----------|---------------|--------------|
| `review_price_enabled` | `False` | Admin/user toggle | `_product_price` (zorunlu) |
| `review_star_rating_enabled` | `False` | Admin/user toggle | `_product_star_rating` (zorunlu) |
| `review_comments_enabled` | `False` | Admin/user toggle | `_product_top_comments` veya LLM |

---

## LLM Ürettiği vs Config'den Gelen Alanlar

| Alan | LLM Üretiyor mu? | Config Override? | Sonuç |
|------|-----------------|-----------------|-------|
| `overallScore` | ✅ Evet (`overall_score`, setdefault 7.0) | ✅ `review_score` | LLM öncelikli (Fix: 2026-03-31) |
| `topComments` | ✅ Evet (tutarsız) | ✅ `_product_top_comments` | Config öncelikli |
| `price` | ⚠️ Nadiren | ✅ `_product_price` | Config öncelikli |
| `starRating` | ⚠️ Nadiren | ✅ `_product_star_rating` | Config öncelikli |
| `sections[].heading` | ✅ `visual_keyword` | ❌ | LLM'den gelir |
| `sections[].type` | ⚠️ Opsiyonel | ❌ Sırayla atanır | Fallback var |

---

## Vertical (9:16) Davranışı

| Bileşen | Landscape | Vertical |
|---------|-----------|----------|
| ScoreRing boyutu | 180px | 140px (via `useLayout`) |
| StarRating boyutu | 36px | 28px (via `useLayout`) |
| PriceBadge font | ~56px | ~44px (scaled) |
| FloatingComments max | 5 yorum | 3 yorum |
| FloatingComments konumları | 5 konum | 3 konum (dar alan) |

---

## Fallback Davranış Özeti

```
overallScore  → LLM değeri (veya config.review_score, veya 0)
price         → prop yoksa PriceBadge görünmez
starRating    → prop yoksa StarRating görünmez
topComments   → prop yoksa FloatingComments görünmez
section.type  → sıra ile atanır (hook/overview/pros/cons/verdict)
section.heading → "Bölüm N" fallback
```
