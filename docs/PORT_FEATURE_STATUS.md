# Port Özellik Durumu

> Versiyon: 0.7.0 · Tarih: 2026-03-31
> YTRobot-v3'ten port edilen görsel özelliklerin production durumu.

---

## Durum Tanımları

| Durum | Açıklama |
|-------|----------|
| ✅ **Production-Ready** | Veri zinciri tamamlanmış, runtime render test edilmiş, kullanıma hazır |
| 🔧 **Config-Required** | Feature flag veya config girişi gerekiyor, aksi halde görünmez |
| ⚠️ **Data-Model-Waiting** | Backend'de alan var ama UI'da kullanıcıya henüz sunulmuyor |
| ❌ **Not-Wired** | Remotion bileşeni var ama pipeline'a bağlı değil |

---

## News Bulletin Özellikleri

| Özellik | Bileşen | Durum | Veri Kaynağı | Notlar |
|---------|---------|-------|--------------|--------|
| Haber başlığı | `NewsBulletin.tsx` lower-third | ✅ Production-Ready | LLM `visual_keyword` | Fallback: `"Haber N"` |
| Haber kaynağı | `NewsBulletin.tsx` lower-third alt metin | ✅ Production-Ready | LLM `news_source` | **Bug fix: 2026-03-31** — `source` key mismatch düzeltildi |
| Kategori rozeti | `NewsBulletin.tsx` lower-third badge | ✅ Production-Ready | LLM `category` | **Yeni: 2026-03-31** — LLM prompt şemasına eklendi |
| Ticker (alt bant) | `NewsTicker.tsx` | 🔧 Config-Required | `bulletin_ticker_enabled=True` | Varsayılan açık; içerik başlıklardan otomatik üretilir |
| Breaking overlay | `BreakingNewsOverlay.tsx` | 🔧 Config-Required | `bulletin_breaking_enabled=False` | Admin açmalı + metin girmeli; LLM üretmez |
| Altyazı | `Subtitles.tsx` | ✅ Production-Ready | Whisper word-timing | `subtitles: []` ise gizlenir |
| Network adı | `NewsBulletin.tsx` üst sol | 🔧 Config-Required | `bulletin_network_name` | Boşsa görünmez |
| Tarih damgası | `NewsBulletin.tsx` üst sağ | ✅ Production-Ready | Runtime `datetime.now()` | — |
| Vertical layout (9:16) | Tüm bulletin | ✅ Production-Ready | `useLayout()` hook | `settings.height > settings.width` ile tetiklenir |

---

## Product Review Özellikleri

| Özellik | Bileşen | Durum | Veri Kaynağı | Notlar |
|---------|---------|-------|--------------|--------|
| Genel skor (ScoreRing) | `ScoreRing` (inline) | ✅ Production-Ready | LLM `overall_score` (setdefault 7.0) | **Bug fix: 2026-03-31** — LLM değeri görmezden geliniyordu |
| Bölüm etiketleri (Pro/Con/Verdict) | `ProductReview.tsx` | ✅ Production-Ready | LLM `section_type` veya sıra ataması | Fallback sırası: hook/overview/pros/cons/verdict |
| Bölüm başlıkları | `ProductReview.tsx` | ✅ Production-Ready | LLM `visual_keyword` | Fallback: `"Bölüm N"` |
| Altyazı | `Subtitles.tsx` | ✅ Production-Ready | Whisper word-timing | — |
| Vertical layout (9:16) | Tüm review | ✅ Production-Ready | `useLayout()` hook | ScoreRing 140px, StarRating 28px vertical'da |
| **Fiyat rozeti** | `PriceBadge.tsx` | 🔧 Config-Required | `review_price_enabled=False` + `_product_price` | Varsayılan kapalı; açmak için flag + fiyat gerekli |
| **Yıldız puanı** | `StarRating.tsx` | 🔧 Config-Required | `review_star_rating_enabled=False` + `_product_star_rating` | Varsayılan kapalı; açmak için flag + puan gerekli |
| **Yüzen yorumlar** | `FloatingComments.tsx` | 🔧 Config-Required | `review_comments_enabled=False` + yorumlar | Varsayılan kapalı; LLM üretebilir ama flag açılmalı |

---

## Standard Video Özellikleri

| Özellik | Bileşen | Durum | Notlar |
|---------|---------|-------|--------|
| Ken Burns efekti | `StandardVideo.tsx` | ✅ Production-Ready | `video_effect: "kenBurns"` |
| Cinematic bars | `StandardVideo.tsx` | ✅ Production-Ready | `video_effect: "cinematic"` |
| Zoom | `StandardVideo.tsx` | ✅ Production-Ready | `video_effect: "zoom"` |
| Altyazı | `Subtitles.tsx` | ✅ Production-Ready | Whisper word-timing |
| Vertical layout (9:16) | `StandardVideo.tsx` | ✅ Production-Ready | `useLayout()` hook |
| Sahne sayacı | `StandardVideo.tsx` | ✅ Production-Ready | Overlay pozisyonu layout'tan |

---

## Genel Altyapı Özellikleri

| Özellik | Durum | Notlar |
|---------|-------|--------|
| `useLayout()` responsive hook | ✅ Production-Ready | 16:9 ve 9:16, ölçekleme, tüm bileşenler entegre |
| 5 altyazı stili | ✅ Production-Ready | standard, karaoke, neon, gold, minimal |
| Word-level subtitle sync | ✅ Production-Ready | Whisper + `_build_subtitle_chunks()` |
| Vertical subtitle konumu | ✅ Production-Ready | `adjustTopForVertical()` ile otomatik |
| Pipeline crash recovery | ✅ Production-Ready | SQLite step state, `status=interrupted` → UI'da "Devam Et" |
| 5-layer settings resolution | ✅ Production-Ready | global → admin → module → provider → user |
| SSE log streaming | ✅ Production-Ready | Real-time pipeline progress |

---

## Düzeltilen Bug'lar (Bu Session)

| Bug | Dosya | Satır | Düzeltme Tarihi |
|-----|-------|-------|----------------|
| `source` key mismatch: LLM `news_source` üretirken kod `source` okuyordu | `backend/pipeline/steps/composition.py` | ~308 | 2026-03-31 |
| `overallScore` LLM değerini yok sayıyor, config 0 defaultu dönüyordu | `backend/pipeline/steps/composition.py` | ~423 | 2026-03-31 |
| `category` LLM şemasında yoktu, badge daima boştu | `backend/modules/news_bulletin/pipeline.py` | ~70 | 2026-03-31 |

---

## UI'da Kullanıcıya Sunulması Gereken Alanlar (Config-Required Özellikler)

Product review opsiyonel özelliklerini aktif etmek için CreateVideo formunda şu alanlar olmalı:

| Alan | Form Tipi | Açıklama |
|------|-----------|----------|
| Fiyat aktif? | Toggle (flag) | `review_price_enabled` |
| Güncel fiyat | Number input | `_product_price` |
| Eski fiyat | Number input (opsiyonel) | `_product_original_price` |
| Para birimi | Text/Select | `_product_currency` |
| Yıldız puanı aktif? | Toggle (flag) | `review_star_rating_enabled` |
| Yıldız puanı | Number (0-5) | `_product_star_rating` |
| Yorum sayısı | Number (opsiyonel) | `_product_review_count` |
| Yorumlar aktif? | Toggle (flag) | `review_comments_enabled` |
| Top yorumlar | Textarea/List | `_product_top_comments` |

Breaking news overlay için:

| Alan | Form Tipi | Açıklama |
|------|-----------|----------|
| Breaking aktif? | Toggle | `bulletin_breaking_enabled` |
| Breaking metni | Text input | `bulletin_breaking_text` |

> **Not:** Bu UI alanları henüz frontend formlarına eklenmemiştir. Şu an yalnızca admin API üzerinden config olarak geçilebilir.
