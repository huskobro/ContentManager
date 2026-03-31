# Ayar Yüzeyi Haritası

**Son Guncelleme:** 2026-03-31
**Durum:** Auto-Save Entegrasyonu Tamamlandi

---

## Ayar Yuzey Matrisi

Her ayarin admin panelde mi, user panelde mi, yoksa her ikisinde mi gorundugunun dokumani.

### Kural

- **Admin-only:** Sadece GlobalSettings.tsx'de gorunur. Kullanici override edemez.
- **User-overridable:** Hem GlobalSettings (admin default) hem UserSettings (user override) panelinde gorunur.
- **Admin gorunur, user override yok:** GlobalSettings'de var ama UserSettings'de yok. Kullanici bu ayari degistiremez.

---

## Tam Ayar Tablosu

| Ayar Anahtari | Kategori | Admin Panelde | User Panelde | Admin-Only | Pipeline Asamasi |
|---|---|---|---|---|---|
| **Sistem** ||||||
| `max_concurrent_jobs` | system | Evet | Hayir | EVET | Is kuyrugu yonetimi |
| `output_dir` | system | Evet | Hayir | EVET | Composition sonrasi dosya kopyalama |
| `video_format` | system | Evet | Hayir | Hayir | Video cozunurlugu ve oran belirleme |
| `language` | system | Evet | EVET | Hayir | LLM prompt dili ve TTS ses secimi |
| **Pipeline Varsayilanlari** ||||||
| `tts_provider` | pipeline | Evet | EVET | Hayir | Her sahne icin ses sentezi saglayicisi |
| `llm_provider` | pipeline | Evet | Hayir | Hayir | — |
| `visuals_provider` | pipeline | Evet | EVET | Hayir | — |
| `subtitle_style` | pipeline | Evet | EVET | Hayir | — |
| `llm_fallback_order` | pipeline | Evet | Hayir | Hayir | — |
| `tts_fallback_order` | pipeline | Evet | Hayir | Hayir | — |
| `visuals_fallback_order` | pipeline | Evet | Hayir | Hayir | — |
| **Senaryo Uretimi** ||||||
| `scene_count` | script | Evet | Hayir | Hayir | — |
| `category` | script | Evet | Hayir | Hayir | — |
| `use_hook_variety` | script | Evet | Hayir | Hayir | — |
| `script_temperature` | script | Evet | Hayir | Hayir | — |
| `script_max_tokens` | script | Evet | Hayir | Hayir | — |
| `job_timeout_seconds` | script | Evet | Hayir | Hayir | — |
| **Video & Gorsel** ||||||
| `tts_voice` | video_audio | Evet | Hayir | Hayir | — |
| `tts_speed` | video_audio | Evet | Hayir | Hayir | — |
| `video_resolution` | video_audio | Evet | EVET | Hayir | — |
| `video_fps` | video_audio | Evet | EVET | Hayir | — |
| `subtitle_font_size` | video_audio | Evet | Hayir | Hayir | — |
| `subtitle_use_whisper` | video_audio | Evet | Hayir | Hayir | — |
| `ken_burns_enabled` | video_audio | Evet | Hayir | Hayir | — |
| `ken_burns_intensity` | video_audio | Evet | Hayir | Hayir | Sahne gorseli uzerinde zoom miktari |
| `ken_burns_direction` | video_audio | Evet | EVET | Hayir | Sahne gorseli transform-origin yonu |
| `video_effect` | video_audio | Evet | EVET | Hayir | Sahne render overlay efekti |
| `subtitle_bg` | video_audio | Evet | EVET | Hayir | Altyazi konteyner stili |
| `subtitle_animation` | video_audio | Evet | EVET | Hayir | Altyazi kelime-seviye giris animasyonu |
| `subtitle_font` | video_audio | Evet | EVET | Hayir | Altyazi font ailesi |
| **TTS & Ses Isleme** ||||||
| `tts_clean_apostrophes` | tts_processing | Evet | Hayir | EVET | Ses sentezinden hemen once metin uzerinde uygulanir |
| `tts_trim_silence` | tts_processing | Evet | Hayir | EVET | Ses dosyasi kaydedildikten sonra |
| `tts_apply_speed_post` | tts_processing | Evet | Hayir | EVET | Ses dosyasi uzerinde, trim silence sonrasi |
| `narration_humanize_enabled` | tts_processing | Evet | Hayir | EVET | Script sonrasi, ses sentezinden once LLM |
| `narration_enhance_enabled` | tts_processing | Evet | Hayir | EVET | Script sonrasi, ses sentezinden once LLM |
| **Haber Bulteni** ||||||
| `bulletin_style` | module_news | Evet | Hayir | Hayir | Bulten lower-third, ticker ve badge renk temasi |
| `bulletin_network_name` | module_news | Evet | Hayir | Hayir | Breaking news overlay badge metni |
| `bulletin_ticker_enabled` | module_news | Evet | Hayir | Hayir | Frame 30'dan itibaren alt ticker bar |
| **Urun Inceleme** ||||||
| `review_style` | module_review | Evet | Hayir | Hayir | Inceleme floating comment ve badge renk temasi |
| `review_price_enabled` | module_review | Evet | Hayir | EVET | Verdict sahnesi animated counter |
| `review_star_rating_enabled` | module_review | Evet | Hayir | EVET | Verdict sahnesi animated stars |
| `review_comments_enabled` | module_review | Evet | Hayir | EVET | Floating speech bubble kartlari |

---

## Ozet Sayilar

| Metrik | Sayi |
|---|---|
| Toplam ayar | 44 |
| Admin panelde gorunen | 44 |
| User panelde gorunen | 13 |
| Admin-only (user override edemez) | 13 |
| Her iki panelde | 13 |
| pipelineStage aciklamasi olan | 28 |
| pipelineStage aciklamasi eksik | 16 |

---

## User Panelde Gorunen 13 Ayar

1. `language` — Icerik dili
2. `tts_provider` — Ses sentezi saglayicisi
3. `subtitle_style` — Altyazi renk stili
4. `visuals_provider` — Gorsel kaynagi
5. `video_resolution` — Video cozunurlugu
6. `video_fps` — Kare hizi
7. `ken_burns_direction` — Ken Burns zoom yonu *(Phase 2)*
8. `video_effect` — Video renk efekti *(Phase 2)*
9. `subtitle_animation` — Altyazi karaoke animasyonu *(Phase 2)*
10. `subtitle_font` — Altyazi fontu *(Phase 2)*
11. `subtitle_bg` — Altyazi arka plan stili *(Phase 2)*

Not: metadata_enabled, thumbnail_enabled, publish_to_youtube user panelde gorunur ama **disabled** (henuz backend'de aktif degil).

---

## Admin-Only 13 Ayar (Kullanici Override Edemez)

1. `max_concurrent_jobs` — Sistem limiti
2. `output_dir` — Sistem dizini
3. `tts_clean_apostrophes` — TTS on-isleme
4. `tts_trim_silence` — TTS on-isleme
5. `tts_apply_speed_post` — TTS son-isleme
6. `narration_humanize_enabled` — LLM son-isleme
7. `narration_enhance_enabled` — LLM son-isleme
8. `review_price_enabled` — Veri bagimli feature flag
9. `review_star_rating_enabled` — Veri bagimli feature flag
10. `review_comments_enabled` — Veri bagimli feature flag

Not: `adminOnly` flagi constants.ts'de tanimli ama frontend'de **filtreleme icin kullanilmiyor**. Admin/user ayrimi, panellerin farkli sayfalarda olmasi ve user panelin sadece bilinen ayarlari gostermesi ile saglanmistir.

---

## Auto-Save Kapsam Matrisi

| Yüzey | Auto-Save | Toggle/Select | Text/Number | Çoklu Seçim |
|---|---|---|---|---|
| `GlobalSettings` → `SettingRow` | ✅ | Anında | 800ms debounce + blur | Manuel Kaydet |
| `ModuleManager` → `AdminSettingRow` | ✅ | Anında | 800ms debounce + blur | Manuel Kaydet |
| `UserSettings` | ✅ | Anında | 800ms debounce + blur | — |
| `PromptManager` | ⏳ | — | Manuel Kaydet (büyük textarea) | — |

**`uiStore.autoSaveEnabled`** toggle butonu GlobalSettings ve UserSettings sayfa başlıklarında görünür.
Detaylar için: `docs/AUTOSAVE_BEHAVIOR.md`

---

## Pipeline Stage Aciklamalari Eksik Ayarlar

Asagidaki ayarlarin pipelineStage alani tanimli degil:

| Ayar | Neden |
|---|---|
| `llm_provider` | Pipeline geneli, tek asamaya ozel degil |
| `visuals_provider` | Pipeline geneli |
| `subtitle_style` | Pipeline geneli |
| `llm/tts/visuals_fallback_order` | Pipeline geneli fallback |
| `scene_count`, `category`, `use_hook_variety` | Script asamasi — acik ama etiketlenmemis |
| `script_temperature`, `script_max_tokens` | Script asamasi — acik ama etiketlenmemis |
| `job_timeout_seconds` | Sistem geneli |
| `tts_voice`, `tts_speed` | TTS asamasi — acik ama etiketlenmemis |
| `subtitle_font_size`, `subtitle_use_whisper` | Composition/Subtitle asamasi |
| `ken_burns_enabled` | Composition asamasi |

Bu ayarlar icin pipelineStage eklenebilir ama mevcut durumda kullanici aciklama metninden asamayi cikarabilir.
