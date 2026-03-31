# QA Log — ContentManager

Her görev sonunda doğrulama, test ve smoke kontrol kayıtları bu dosyada tutulur.
Yeni görevlerde bu dosyaya ekleme yapılır, üzerine yazılmaz.

---

## 2026-03-31 — Kategori/Hook Override Runtime Doğrulaması + Bug Fix

### Değişiklik Özeti

| Dosya | Değişiklik |
|---|---|
| `backend/pipeline/steps/script.py` | `_get_effective_category()` artık `enabled` alanını döndürüyor; `build_enhanced_prompt()` `enabled=False` kategorileri atlıyor |
| `frontend/src/pages/admin/PromptManager.tsx` | Hatalı açıklama metni düzeltildi (pasif kategori davranışı artık kodla uyumlu) |
| `backend/tests/test_script_overrides.py` | 16 yeni unit test — A/B kanıtı, disabled filtreleme, CRUD sınır testi |

### Tespit Edilen Bug ve Düzeltme

**Bug:** `build_enhanced_prompt()` içinde `category` `enabled=False` olsa bile prompt enhancement ekleniyordu.

Kök neden: `_get_effective_category()` `enabled` alanını döndürmüyordu; `build_enhanced_prompt()` sadece `category != "general"` kontrolü yapıyordu.

**Fix:**
1. `_get_effective_category()` artık `base["enabled"] = override.get("enabled", True)` döndürüyor
2. `build_enhanced_prompt()` artık `cat_info.get("enabled", True)` kontrolü yapıyor; `False` ise enhancement eklemiyor

### Runtime Wiring Kanıtları

**Kategori override pipeline'a gerçekten gidiyor mu:**

| Adım | Kanıt |
|---|---|
| DB'ye yazma | `PUT /api/admin/categories/{key}` → `settings` tablosunda `scope=admin`, `key=category_content_{key}` |
| Memory'ye yükleme | `runner.py:141` → `load_overrides_from_db(db)` her pipeline başlangıcında çağrılıyor |
| Prompt'a ekleme | `build_enhanced_prompt()` → `_get_effective_category()` → override değerleri kullanılıyor |
| enabled=False atlama | `build_enhanced_prompt()` satır 443-446: `cat_info.get("enabled", True)` → False ise enhancement eklenmez |

**A/B test sonucu (statik, unit test ile kanıtlandı):**

```
DEFAULT (science):
  TON: Merakli, kesfedici, bilimsel ama anlasilir
  ODAK: Karmasik kavramlari basitlestir...

OVERRIDE (science, tone="SON DERECE RESMİ"):
  TON: SON DERECE RESMİ
  ODAK: Karmasik kavramlari basitlestir... (override yok, hardcoded kalır)
```

**Hook override pipeline'a gerçekten gidiyor mu:**

| Adım | Kanıt |
|---|---|
| DB'ye yazma | `PUT /api/admin/hooks/{type}/{lang}` → `settings` tablosunda `scope=admin`, `key=hook_content_{type}_{lang}` |
| Memory'ye yükleme | Aynı `load_overrides_from_db(db)` çağrısı hook'ları da yükliyor |
| Filtreleme | `_get_effective_hooks()` satır 338: `enabled=False` olan hook'lar atlanıyor |
| Tüm hook'lar disabled → fallback | satır 346: `return result if result else base_list` |

### CRUD Gerçeği (Dürüst Belgeleme)

**Sistem: Override/Edit sistemi. Tam CRUD DEĞİL.**

| Soru | Cevap |
|---|---|
| Yeni kategori eklenebilir mi? | **HAYIR.** 6 hardcoded kategori, `admin.py:312` bilinmeyen key'e 404 döner |
| Yeni hook tipi eklenebilir mi? | **HAYIR.** 8 hardcoded tip, `admin.py:412` bilinmeyen type'a 404 döner |
| Mevcut kategori içeriği düzenlenebilir mi? | **EVET.** tone/focus/style_instruction override edilebilir |
| Mevcut hook içeriği düzenlenebilir mi? | **EVET.** name/template override edilebilir |
| Kategori enabled/disabled? | **EVET.** DB'ye yazılıyor, pipeline'da kontrol ediliyor (bug düzeltildi) |
| Hook enabled/disabled? | **EVET.** DB'ye yazılıyor, `_get_effective_hooks()` filtreliyor |
| Override sıfırlanabilir mi? | **EVET.** Boş body + enabled=True → DB kaydı siliniyor, hardcoded'a dönüyor |

### Çalıştırılan Testler

```
backend/tests/test_script_overrides.py — 16 passed (0.02s)
  test_effective_category_no_override_returns_hardcoded   PASSED
  test_effective_category_with_override_replaces_fields   PASSED
  test_effective_category_enabled_false                   PASSED
  test_prompt_enhancement_differs_with_override           PASSED
  test_build_enhanced_prompt_skips_disabled_category      PASSED  ← bug fix kanıtı
  test_build_enhanced_prompt_adds_enabled_category        PASSED
  test_build_enhanced_prompt_general_never_added          PASSED
  test_effective_hooks_no_override_returns_all            PASSED
  test_effective_hooks_disabled_hook_excluded             PASSED
  test_effective_hooks_template_override_applied          PASSED
  test_effective_hooks_all_disabled_fallback_to_base      PASSED
  test_effective_hooks_en_language                        PASSED
  test_ab_category_before_after                           PASSED  ← A/B kanıt
  test_ab_hook_before_after                               PASSED  ← A/B kanıt
  test_unknown_category_key_uses_general_fallback         PASSED
  test_categories_are_fixed_set                           PASSED

Tüm backend testleri: 81 passed
```

### tsc --noEmit

```
Çıktı yok → temiz
```

### Kalan Sınırlar (Planlı)

- Yeni kategori / hook tipi ekleme desteklenmiyor (Python kodu değişikliği gerekir)
- PromptManager'da "Yeni Ekle" butonu kasıtlı yok — sistem override/edit tasarımında
- Kategori seçim listesinde disabled kategoriler görünüyor (backend filtrelemesi hâlâ settings_resolver'a eklenmedi — düşük öncelik)

---

## 2026-03-31 — Category/Hook CRUD Sistemi — Tam CRUD Doğrulama

### Değişiklik Özeti

**Sistem tipi Override/Edit'ten tam CRUD'a yükseltildi.**

| Dosya | Değişiklik |
|---|---|
| `backend/models/category.py` | Yeni ORM — `categories` tablosu (`key`, `name_tr`, `name_en`, `tone`, `focus`, `style_instruction`, `enabled`, `is_builtin`, `sort_order`) |
| `backend/models/hook.py` | Yeni ORM — `hooks` tablosu (`type`, `lang`, `name`, `template`, `enabled`, `is_builtin`) |
| `backend/database.py` | `create_tables()` — category ve hook modelleri import edilip tablo oluşturmaya dahil edildi |
| `backend/main.py` | `_seed_categories_and_hooks(db)` — startup lifespan'da çağrılıyor; hardcoded 6 kategori + 8×2 hook `is_builtin=True` olarak ilk çalışmada seed ediliyor |
| `backend/api/admin.py` | Categories ve hooks için tam CRUD endpoint'leri — POST/PUT/DELETE/GET |
| `backend/pipeline/steps/script.py` | `_get_effective_category(key, db=None)` ve `_get_effective_hooks(language, db=None)` — `db` verilirse ORM'den okur; verilmezse hardcoded'a düşer |
| `backend/pipeline/runner.py` | `config["_db"] = db` injection — pipeline'ın DB'ye erişimi |
| `backend/modules/standard_video/pipeline.py` | `db=config.get("_db")` ile script adımına DB geçiriliyor |
| `backend/tests/test_category_hook_crud.py` | 20 endpoint testi — tam CRUD, builtin koruma, 409 çakışma, 403 silme engeli |

### Yeni API Endpoint'leri

```
GET    /api/admin/categories              → tüm kategorileri listeler
POST   /api/admin/categories              → yeni özel kategori oluşturur (201/409/422)
PUT    /api/admin/categories/{key}        → herhangi bir kategoriyi günceller (200/404)
DELETE /api/admin/categories/{key}        → sadece özel kategorileri siler (200/403/404)

GET    /api/admin/hooks/{lang}            → dil için hook'ları listeler
POST   /api/admin/hooks                   → yeni özel hook oluşturur (201/409/422/400)
PUT    /api/admin/hooks/{type}/{lang}     → herhangi bir hook'u günceller (200/404)
DELETE /api/admin/hooks/{type}/{lang}     → sadece özel hook'ları siler (200/403/404)
```

### Builtin Koruma Mantığı

- `is_builtin=True` olan kayıtlar (seed edilen hardcoded 6 kategori + 8×2 hook): **silinemez** (DELETE → 403)
- `is_builtin=True` kayıtlar düzenlenebilir ve disable edilebilir (PUT → 200)
- `is_builtin=False` kayıtlar (admin tarafından oluşturulan): **tamamen silinebilir** (DELETE → 200)
- Aynı `key` ile ikinci POST → 409 Conflict

### Çalıştırılan Testler

```
backend/tests/test_category_hook_crud.py — 19 passed, 1 skipped (0.04s)
  test_list_categories_returns_seeded_data         PASSED
  test_create_custom_category                      PASSED
  test_create_duplicate_category_409               PASSED
  test_update_builtin_category                     PASSED
  test_update_nonexistent_category_404             PASSED
  test_delete_custom_category                      PASSED
  test_delete_builtin_category_403                 PASSED
  test_delete_nonexistent_category_404             PASSED
  test_list_hooks_by_lang                          PASSED
  test_create_custom_hook                          PASSED
  test_create_duplicate_hook_409                   PASSED
  test_create_hook_invalid_lang_400                PASSED
  test_update_builtin_hook                         PASSED
  test_update_nonexistent_hook_404                 PASSED
  test_delete_custom_hook                          PASSED
  test_delete_builtin_hook_403                     PASSED
  test_delete_nonexistent_hook_404                 PASSED
  test_pipeline_reads_from_db_when_injected        PASSED
  test_pipeline_fallback_hardcoded_when_no_db      PASSED
  test_seed_idempotent_second_startup              SKIPPED (DB reset not implemented in fixture)

Tüm backend testleri: geçen toplam artı 19 yeni → temiz
```

### tsc --noEmit

```
Çıktı yok → temiz
```

### Runtime Doğrulama

- Startup logunda `_seed_categories_and_hooks` çağrıldı, 6 kategori + 16 hook seed edildi
- `GET /api/admin/categories` → `is_builtin` alanı doğru dönüyor
- `DELETE /api/admin/categories/science` (builtin) → 403 Forbidden
- `POST /api/admin/categories` (yeni özel) + `DELETE` → 200 OK, DB'den silindi
- `config["_db"]` pipeline'da script adımına ulaşıyor, `_get_effective_category` DB sorgusunu çalıştırıyor

### Kalan Sınırlar (Planlı)

- `news_bulletin` ve `product_review` pipeline'ları henüz `db=config.get("_db")` almıyor — düşük öncelik
- Kategori listesinde `sort_order` sıralaması frontend'de henüz uygulanmıyor

---

## 2026-03-31 — KRİTİK: Subtitle/Scene Off-by-One Render Bug — Root Cause + Fix

### Önceki Trace Neden Yetersizdi

Önceki doğrulama turları (aynı gün) sadece JSON artifact'ları karşılaştırdı (`step_script.json`, `step_tts.json`, `step_subtitles.json`). Bu katmanlarda metin eşleşmesi 10/10 doğruydu. Ancak **composition/render katmanı incelenmemişti**. Kullanıcı final videoda farklı altyazı gördüğünü bildirdi — ve haklıydı.

### Root Cause

`remotion/src/compositions/StandardVideo.tsx:256-257` — 1-based `scene.index` (scene_number) doğrudan 0-based `subtitles[]` array index'i olarak kullanılıyordu.

```typescript
// BUGGY: scene.index = 1 → subtitles[1] = Scene 2'nin altyazısı
const subtitleChunk = subtitles[scene.index];
```

Sonuç: **10/10 sahne yanlış altyazı gösteriyor.** Her sahne bir sonraki sahnenin altyazısını gösteriyor. Son sahne hiç altyazı göstermiyor (array overflow).

### Video Frame Kanıtı

Session: `c2261ada354448c7b2153a36dfb246a0` ("Ateş Nasıl Bulundu?")

| Frame | TTS Okuyor | Ekrandaki Altyazı | Doğru mu |
|-------|-----------|-------------------|----------|
| t=1s (Scene 1) | "Bugün internetimiz..." | "Ateş yokken hayat gerçekten acımasızdı / Soğuk" | YANLIŞ (Scene 2) |
| t=184s (Scene 10) | "Bugün bile..." | (altyazı yok) | YANLIŞ (overflow) |

Sağ üst köşe: "2 / 10" yazıyor Scene 1'de — olması gereken "1 / 10" (aynı bug).

### Fix

| Dosya | Değişiklik |
|---|---|
| `remotion/src/compositions/StandardVideo.tsx` | `subtitles[scene.index]` → `subtitles[arrayIndex]` (0-based map index) |
| Aynı dosya | `sceneIndex={scene.index}` → `sceneIndex={arrayIndex}` |
| Aynı dosya | `Sahne ${scene.index + 1}` → `Sahne ${arrayIndex + 1}` |
| `docs/TTS_SUBTITLE_RENDER_MISMATCH.md` | Yeni: tam root cause analizi + frame kanıtları |

### Etkilenmeyen Dosyalar

- `NewsBulletin.tsx`: zaten `map((item, idx))` → 0-based `idx` kullanıyor
- `ProductReview.tsx`: zaten `map((section, idx))` → 0-based `idx` kullanıyor

### Çalıştırılan Testler

```
python3 -m pytest backend/tests/ -q → 100 passed, 1 skipped
npx tsc --noEmit (frontend) → clean
npx tsc --noEmit (remotion) → clean
```

### Kalan Adım

Yeni video render edilerek fix doğrulanmalı (mevcut final.mp4 eski kodla render edilmiş).

---

## 2026-03-31 — Output Picker UI E2E Doğrulama + TTS Subtitle Zinciri Doğrulama

### Değişiklik Özeti

| Dosya | Değişiklik |
|---|---|
| `backend/modules/standard_video/pipeline.py` | `tts_results.append()` içine `"text": tts_text` alanı eklendi — manifest audit gap fix |
| `docs/OUTPUT_PICKER_TRACE.md` | Yeni: output picker E2E kanıt dokümanı |
| `docs/TTS_SUBTITLE_TRACE.md` | Yeni: TTS→subtitle text zinciri kanıt dokümanı |

### Output Picker UI E2E Kanıtları (browser network log)

| Test | Network Kanıtı | Sonuç |
|---|---|---|
| Kaydet → backend | `POST /api/settings/admin/output-folder → 200` `{"absolute_path": "/private/tmp/ui_output_test"}` | PASS |
| Sayfa yenileme sonrası persistence | `GET /api/settings?scope=admin` → input shows `/private/tmp/ui_output_test` | PASS |
| FolderPickerDialog açılışı | `GET /api/admin/directories?path=%2Fprivate%2Ftmp%2Fui_output_test → 200` | PASS |
| "Bu Klasörü Seç" | Dialog kapandı, input doğru path | PASS |
| Finder butonu | `POST /api/settings/admin/open-folder → 200` | PASS |

### TTS → Subtitle Zinciri Kanıtları (gerçek job artifacts)

Session: `7835389a3699457da9d76a8e7fecf1f4`

| Check | Sonuç |
|---|---|
| Script narration → TTS text (normalize_narration) | 10/10 eşleşme |
| TTS narration → subtitle text (normalize_narration) | 10/10 eşleşme |
| TTS word_timings → subtitle word_timings | 10/10 eşleşme |
| timing_source | Tüm sahneler: `tts_word_timing` |
| Sahne 2 cumulative offset | 20.3s (doğru) |

### Bug Fix — TTS manifest `text` alanı eksikti

**Sorun:** `step_tts.json` içindeki tüm sahneler `"text": ""` olarak kaydediliyordu.
**Etki:** Audit edilemezlik — word_timings doğruydu, sessiz bir veri eksikliğiydi.
**Fix:** `pipeline.py:343` — `"text": tts_text` tts_results dict'ine eklendi.

### Çalıştırılan Testler

```
python3 -m pytest backend/tests/ -q
100 passed, 1 skipped in 0.62s

npx tsc --noEmit
(no output — clean)
```

### Doğrulanamayan Noktalar

- Gerçek bir yeni job'un `/private/tmp/ui_output_test` klasörüne çıktı yazması — pipeline provider'ları gerçek API key'i olmadan çalıştırılamadı
- `step_tts.json` `text` fix'inin gerçek bir job çalıştırılarak doğrulanması

---

## 2026-03-31 — TTS/Subtitle Zinciri Derinlemesine Yeniden Doğrulama + Whisper Değerlendirmesi

### Kapsam

Kullanıcı isteği: TTS ve altyazı metninin gerçekten aynı olduğunu yeniden doğrula, senkron kalitesini ölç, Whisper'ın birincil kaynak yapılıp yapılmaması gerektiğini değerlendir.

### Session

`c2261ada354448c7b2153a36dfb246a0` — "Ateş Nasıl Bulundu?" (en güncel job, 10 sahne, 203.86s)

### Değişen Dosyalar

Kod değişikliği yok — tüm testler geçti, sorun bulunamadı.

| Dosya | Değişiklik |
|---|---|
| `docs/TTS_SUBTITLE_TRACE.md` | Güncellendi — yeni session, ffmpeg doğrulaması, tam timing tablosu |
| `docs/TIMING_COMPARISON.md` | Yeni — Edge TTS vs Whisper karşılaştırması |

### Metin Eşleşmesi (2. tur)

| Kontrol | Sonuç |
|---|---|
| normalize_narration(script) == subtitle.text | 10/10 EXACT MATCH |
| Karakter sayısı | 10/10 eşit |
| Kelime sayısı TTS==subtitle | 10/10 eşit (383 kelime toplam) |
| Trailing space veya encoding farkı | YOK |

### Timing Kalitesi

| Kontrol | Sonuç |
|---|---|
| Word timing drift (TTS→subtitle) | max 0.5ms (fp yuvarlama) |
| Sahne sınırı uyumu | max 3ms inter-scene gap |
| Büyük boşluklar gerçek mi | ffmpeg doğruladı — 5/5 eşleşme ±58ms |
| Overlap | 0 |
| <60ms kelime | 0 |
| timing_source | tts_word_timing (10/10 sahne) |

### Sistematik End_ms Underestimate

Edge TTS `end_ms` fonetik sınırı işaretler (sessizlik bitişini değil). Ölçülen: ~30-100ms erken kapanış.
Perceptual threshold: ~150ms. **Etki: algılanamaz.**

Karaoke/hormozi stili için: highlight ~50-100ms erken söner. Standard stil: hiç etkisi yok.

### Whisper Değerlendirmesi

**Karar: Whisper birincil yapılmamalı.**

| Kriter | Edge TTS | Whisper |
|---|---|---|
| Granülarite | 12.5ms | ~50-200ms |
| Maliyet | $0 | ~$0.02/video |
| Gecikme | 0ms | +50-300s |
| Word mismatch riski | 0 (exact) | ~5-15% (ASR WER) |
| Hallucination | Yok | Düşük ama var |

**Mevcut fallback mimarisi doğru:** TTS→Whisper→EşitDağıtım. Değişiklik önerilmiyor.

### Çalıştırılan Testler

```
python3 -m pytest backend/tests/ -q
100 passed, 1 skipped in 0.62s

npx tsc --noEmit
(no output — clean)
```

### Doğrulanamayan Noktalar

- Gerçek Whisper API karşılaştırması — OpenAI API key yok, karşılaştırma analitik/mimari bazlı yapıldı
- ElevenLabs, OpenAI TTS gibi diğer sağlayıcılarda word_timings kalitesi (sadece Edge TTS test edildi)

---

## Kayıt Formatı

```
## [YYYY-MM-DD] Konu Başlığı
### Değişiklik Özeti
### Çalıştırılan Testler
### Manuel Kontroller
### tsc --noEmit
### Doğrulanamayan Noktalar
### Kalan Riskler
```

---

## 2026-03-30 — Klavye Navigasyon Sistemi Sertleştirme + Output Folder Bug Fix

### Değişiklik Özeti

**Görev 1 — Klavye navigasyon sistemi (birden fazla oturum):**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/hooks/useScopedKeyboardNavigation.ts` | `instanceof HTMLElement` guard, triple contenteditable check, `clampOnMutation` seçeneği, race-safe `moveNext`/`movePrev`, `onKeyboardMove` callback |
| `frontend/src/hooks/useRovingTabindex.ts` | `lastWasKeyboardRef` reset sonrası `el.focus()`, `notifyKeyboard()` API'ye eklendi |
| `frontend/src/hooks/useFocusRestore.ts` | `timerRef` ile competing deferred restore race fix, `cancelPending()` garantisi |
| `frontend/src/hooks/useDismissStack.ts` | `_firing` flag ile hızlı ardışık ESC double-fire koruması, `_clearDismissStackForTesting()` |
| `frontend/src/pages/user/JobList.tsx` | `useFocusRestore`, `useDismissOnEsc`, `onKeyboardMove: notifyKeyboard` entegrasyonu |
| `frontend/src/pages/admin/AdminJobs.tsx` | Aynı pattern |
| `frontend/src/pages/admin/ModuleManager.tsx` | `onKeyboardMove: notifyKeyboard` |
| `frontend/src/pages/admin/ProviderManager.tsx` | Aynı pattern |
| `frontend/src/test/useKeyboardNavigation.test.ts` | 62 test (yeni dosya) |

**Görev 2 — Output folder bug fix:**

**Root cause:** `GlobalSettings.tsx`'deki `handleSave` `output_dir` için generic `POST /api/settings` kullanıyordu. Bu endpoint yalnızca DB'ye yazıyor; backend `app_settings.output_dir` runtime güncellenmiyor, klasör oluşturulmuyor, path doğrulaması yapılmıyordu.

| Dosya | Değişiklik |
|---|---|
| `frontend/src/stores/adminStore.ts` | `setOutputFolder(path)` method eklendi → `POST /api/settings/admin/output-folder` |
| `frontend/src/pages/admin/GlobalSettings.tsx` | `handleSave`'de `output_dir` key için özel endpoint akışı; `APIError` import, 401 için anlamlı hata mesajı |
| `frontend/src/test/outputFolder.test.ts` | 7 test (yeni dosya) |

---

### Çalıştırılan Testler

#### `npm test -- --run` (Vitest)

```
Komut: npx vitest run --reporter=verbose
Ortam: jsdom, @testing-library/react
```

**Sonuçlar:**

| Test Dosyası | Test Sayısı | Sonuç |
|---|---|---|
| `src/test/useKeyboardNavigation.test.ts` | 62 | ✅ Tümü geçti |
| `src/test/outputFolder.test.ts` | 7 | ✅ Tümü geçti |
| **TOPLAM** | **69** | **✅ 69/69 passed** |

**Test süreleri:**
- Duration: ~741ms – 1.08s (iki ayrı çalıştırma)
- Transform: ~63ms, Setup: ~54-103ms

**Uyarılar (kritik değil):**
- `useKeyboardNavigation.test.ts`'de bazı testlerde `act()` uyarısı: React state güncellemeleri `act()` dışında tetikleniyor. Bu uyarılar daha önce de vardı, yeni kod değişikliklerinden kaynaklanmıyor. Test sonuçlarını etkilemiyor.

#### Bireysel test grupları ve kapsamları

**`useScopedKeyboardNavigation` (16 test):**
- ArrowDown/ArrowUp/Home/End/Space/Enter/Escape/ArrowRight/ArrowLeft
- disabled, metaKey, ctrlKey, isComposing guard'ları
- INPUT hedef guard
- itemCount değişince sıfırlama

**`keyboardStore scope stack` (4 test):**
- push/pop/isActive akışları
- iki scope mount: üstteki aktif, alttaki pasif
- duplicate push koruması

**`Guard koşulları — interactive hedef` (6 test):**
- contenteditable, role=textbox, role=combobox
- window target ile navigasyon çalışır
- altKey ile çalışmaz
- isComposing=true ile çalışmaz

**`Quick Look Space toggle` (2 test):**
- Space basınca capture listener modal kapatır
- Input içindeyken modal kapatılmaz

**`Scope ownership` (3 test):**
- disabled scope pasif
- overlay scope mount olunca alttaki pasif
- pop sonrası alttaki tekrar aktif

**`useDismissStack — ESC kapatma önceliği` (7 test):**
- Tek entry ESC
- İki entry öncelik sırası
- unregister sonrası
- useDismissOnEsc isOpen true/false
- QuickLook(20) > Sheet(10) önceliği

**`useRovingTabindex` (5 test):**
- getTabIndex hesaplama
- notifyKeyboard çağrılabilirlik
- focusItem DOM focus

**`Liste mutasyonu — focus güvenliği` (7 test):**
- itemCount 0'a düşünce -1
- clampOnMutation=true: sil → son satıra taşı
- clampOnMutation=true: geçerli satır korunur
- clampOnMutation=true: boşalınca -1
- clampOnMutation=false: sıfırla
- boş listede ArrowDown/End hata fırlatmaz

**`ESC hızlı ardışık basış` (3 test):**
- Çift ESC → tek callback
- İki overlay, sıralı kapatma
- unregister sonrası kalan entry çalışır

**`useFocusRestore` (4 test):**
- Hedef DOM'da yoksa no-op
- Deferred hedef DOM'da yoksa no-op
- captureForRestore bekleyen deferred'ı iptal eder
- captureForRestore olmadan restoreFocus no-op

**`Scope stack — unmount cleanup` (3 test):**
- Unmount sonrası stale entry yok
- Hızlı mount/unmount wrong scope oluşmaz
- Duplicate push tek entry garantisi

**`adminStore.setOutputFolder` (7 test):**
- Doğru endpoint + body + PIN ile POST
- 422 → null + store.error
- 401 → null + store.error
- Başarı sonrası store.settings senkronizasyonu
- Kayıt yokken liste değişmez
- Doğru PIN ile X-Admin-Pin header
- Network hatası → null + store.error

---

### tsc --noEmit

```
Komut: npx tsc --noEmit
Sonuç: Temiz — sıfır hata, sıfır uyarı
Çalıştırılma sayısı: Her görev sonunda (toplam 3 kez)
```

---

### Statik Kod Doğrulamaları (Manuel / Ajan Tabanlı)

Aşağıdaki davranışlar kaynak kod incelemesi ile doğrulandı (browser/runtime testi yapılmadı):

#### UI Akışı

| Davranış | Doğrulama | Sonuç |
|---|---|---|
| Output path seçildikten sonra ekranda yeni path görünür | `setOutputFolder` → store.settings map → SettingRow useEffect | ✅ ONAYLANDI |
| Sayfa yenilenince path korunur | `fetchSettings` → DB → `dbRecord.value` = `absolute_path` | ✅ ONAYLANDI |
| Boş path → varsayılana dön | `handleSave` empty branch → `deleteSetting` → `loadData` → `defaultToDisplay("")` | ✅ ONAYLANDI |

#### Folder Picker

| Davranış | Doğrulama | Sonuç |
|---|---|---|
| Klasör seçici açılır | `setFolderPickerOpen(true)` → `FolderPickerDialog` render | ✅ ONAYLANDI |
| `GET /api/admin/directories` çağrılır | `loadDir` → `api.get(...)` with adminPin | ✅ ONAYLANDI |
| onSelect → input günceller → Kaydet aktif | `onSelect={(path) => setDisplay(path)}` → `isDirty=true` | ✅ ONAYLANDI |
| 401 → anlamlı hata mesajı | `APIError.status === 401` branch → "Admin PIN gerekli veya geçersiz" | ✅ ONAYLANDI |
| Liste boş → kullanıcıya mesaj | `subdirs.length === 0` → "Bu dizinde alt klasör yok" | ✅ ONAYLANDI |

#### Backend Runtime

| Davranış | Doğrulama | Sonuç |
|---|---|---|
| `set_output_folder` → `app_settings.output_dir` runtime güncellenir | `app_settings.output_dir = output_path` (settings.py:435) | ✅ ONAYLANDI |
| `set_output_folder` → DB'ye absolute_path kaydedilir | `resolver.upsert(..., value=str(output_path))` (settings.py:439) | ✅ ONAYLANDI |
| Klasör oluşturulur | `validate_output_path` → `mkdir(parents=True, exist_ok=True)` | ✅ ONAYLANDI |
| Yazma izni test edilir | `test_file.write_text("test"); test_file.unlink()` | ✅ ONAYLANDI |

#### Restart Senaryosu

| Davranış | Doğrulama | Sonuç |
|---|---|---|
| Restart sonrası output_dir DB'den yüklenir | `main.py:66-78` — `SettingsResolver.get("output_dir")` → `settings.output_dir = resolved_path` | ✅ ONAYLANDI |
| Startup'ta klasör yeniden oluşturulur | `resolved_path.mkdir(parents=True, exist_ok=True)` (main.py:73) | ✅ ONAYLANDI |
| Pipeline `app_settings.output_dir` kullanır | `composition.py:833`, `runner.py:180` — doğrudan singleton okuma | ✅ ONAYLANDI |
| Runner output_dir yoksa session fallback | `composition.py:859-865` — copy fail → warning + session path | ✅ ONAYLANDI |

---

### Doğrulanamayan Noktalar

1. **Pydantic version / frozen model:**
   `settings.output_dir = resolved_path` ataması Pydantic v2 `frozen=True` config varsa runtime `ValidationError` fırlatır. `backend/config.py`'de `model_config` kontrolü yapılmadı. Kod halihazırda çalışıyorsa sorun yok.

2. **Browser/runtime test yapılmadı:**
   Tüm doğrulama statik kod analizi ve Vitest (jsdom) üzerinden. Gerçek tarayıcıda folder picker, SSE canlı log akışı ve video render akışı test edilmedi.

3. **`/api/admin/directories` path parametresi:**
   FolderPickerDialog başlangıç dizinini `initialPath ?? ""` ile açıyor. Boş string gönderilince backend'in home/root dizini nasıl belirlediği doğrulanmadı.

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| Pydantic frozen config | Düşük | `settings.output_dir =` ataması v2 frozen modelde çalışmaz. Startup log'da "SettingsResolver'dan output_dir yüklendi" görülüyorsa risk yok. |
| `act()` uyarıları | Düşük | Keyboard navigation testlerinde React state güncellemeleri act() dışında tetikleniyor. Test sonuçlarını etkilemiyor, false negative riski minimal. |
| Folder picker 401 sonrası retry yok | Düşük | PIN girip dialog tekrar açılırsa düzelir. UX eksiği, bug değil. |
| ~~Output_dir boş bırakılınca runtime'da hâlâ eski değer~~ | ~~Bilgi~~ | **GİDERİLDİ** — Bir sonraki kayıtta belgelenmiştir. |

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-30 — Output Folder Reset Bug Fix + Broken Pages Fix + TypeScript Temizliği

### Değişiklik Özeti

**Görev 1 — Output folder reset bug fix (kritik):**

Önceki oturumda tespit edilen kritik risk giderildi: output_dir alanı boşaltılıp kaydedilince yalnızca DB kaydı siliniyordu; `app_settings.output_dir` runtime değişmiyordu. Sonraki video eski output_dir'e gitmeye devam ediyordu.

| Dosya | Değişiklik |
|---|---|
| `backend/api/settings.py` | `DELETE /api/settings/admin/output-folder` endpoint eklendi: DB kaydını siler + `app_settings.output_dir` = `BASE_DIR/output` + klasör oluşturur |
| `frontend/src/stores/adminStore.ts` | `resetOutputFolder()` method eklendi → `DELETE /api/settings/admin/output-folder`; başarıda `output_dir` kaydı settings listesinden kaldırılır |
| `frontend/src/pages/admin/GlobalSettings.tsx` | Boş path akışı: `deleteSetting` yerine `resetOutputFolder()` çağrısı; başarıda `default_path` toast mesajında gösterilir |

**Görev 2 — Açılmayan/çöken sayfalar fix:**

Root cause: `useScopedKeyboardNavigation` içinde `onKeyboardMove: notifyKeyboard` geçilirken `notifyKeyboard` henüz bir sonraki satırda tanımlanıyordu (temporal dead zone — TS2448/TS2454).

| Dosya | Root Cause | Fix |
|---|---|---|
| `frontend/src/pages/user/JobList.tsx` | `notifyKeyboard` TDZ: `useScopedKeyboardNavigation` çağrısından sonra `useRovingTabindex` tanımlanıyor | `notifyKeyboardRef = useRef<...>(undefined)` + `onKeyboardMove: () => notifyKeyboardRef.current?.()` + `notifyKeyboardRef.current = notifyKeyboard` |
| `frontend/src/pages/admin/AdminJobs.tsx` | Aynı | Aynı ref pattern |
| `frontend/src/pages/admin/ModuleManager.tsx` | Aynı + `clearSettings` ve `moduleKey` unused | Aynı ref pattern + unused var temizliği |
| `frontend/src/pages/admin/ProviderManager.tsx` | Aynı + `createSetting`/`updateSetting` unused, `addToast` type mismatch | Aynı ref pattern + type fix (`Omit<Toast, "id">`) + unused var temizliği |

**Görev 3 — TypeScript build hataları (`npm run build`):**

| Dosya | Hata | Fix |
|---|---|---|
| `frontend/src/test/useKeyboardNavigation.test.ts` | TS6133: `resultA` unused | `result: _resultA` |
| `frontend/src/components/layout/Header.tsx` | TS6133: `adminUnlocked` unused | Destructure'dan kaldırıldı |
| `frontend/src/lib/constants.ts` | TS2322: Lucide `ComponentType<{size?:number}>` type mismatch | `ForwardRefExoticComponent<Omit<LucideProps,"ref"> & RefAttributes<SVGSVGElement>>` |
| `frontend/src/pages/admin/AdminDashboard.tsx` | TS6133: `CheckCircle2`, `DollarSign`, `Activity`, `JobStats` unused | Import'lardan kaldırıldı |
| `frontend/src/pages/admin/ProviderManager.tsx` | TS6133: `updateSetting` unused (ana component'de) | Destructure'dan kaldırıldı |
| `frontend/tsconfig.node.json` | TS2304: vite `Worker` type not found | `"skipLibCheck": true` eklendi |
| `frontend/src/pages/admin/CostTracker.tsx` | TS6133: `error` state unused | State ve `setError` kaldırıldı |
| `frontend/src/pages/user/CreateVideo.tsx` | TS2322: Lucide `title` prop kaldırıldı (v3) | `title=` → `aria-label=` |

---

### Çalıştırılan Testler

#### `npx vitest run` (Vitest)

**Sonuçlar:**

| Test Dosyası | Test Sayısı | Sonuç |
|---|---|---|
| `src/test/useKeyboardNavigation.test.ts` | 62 | ✅ Tümü geçti |
| `src/test/outputFolder.test.ts` | 13 | ✅ Tümü geçti |
| `src/test/pageSmoke.test.tsx` | 7 | ✅ Tümü geçti |
| **TOPLAM** | **82** | **✅ 82/82 passed** |

**Yeni testler — `outputFolder.test.ts` (13 test):**

| Test | Amaç |
|---|---|
| `setOutputFolder` — 7 test | Önceki oturumdan, değişmedi |
| `resetOutputFolder` başarı → default_path döner | DELETE endpoint doğru çağrılır, PIN header doğru |
| `resetOutputFolder` başarı → output_dir listeden kalkar | Store senkronizasyonu |
| `resetOutputFolder` output_dir yokken hata vermez | Edge case |
| `resetOutputFolder` backend hata → null + error | 401/500 senaryosu |
| `resetOutputFolder` network hatası → null + error | fetch throw |
| `resetOutputFolder` doğru PIN ile header | localStorage PIN |

**Yeni testler — `pageSmoke.test.tsx` (7 test):**

| Sayfa | Test |
|---|---|
| `/jobs` (JobList) | Çökmeden render olur |
| `/admin/jobs` (AdminJobs) | Çökmeden render olur |
| `/admin/modules` (ModuleManager) | Çökmeden render olur |
| `/admin/providers` (ProviderManager) | Çökmeden render olur |
| `/admin/cost-tracker` (CostTracker) | Çökmeden render olur |
| `/admin/cost-tracker` (CostTracker) | Yükleme durumu doğru |
| `/admin/dashboard` (AdminDashboard) | Çökmeden render olur |

**Setup değişikliği — `src/test/setup.ts`:**
- jsdom'da bulunmayan `EventSource` için minimal stub eklendi (JobList ve AdminJobs SSE kullanıyor)

#### `npm run build` (Vite + tsc -b)

```
✓ 1675 modules transformed.
✓ built in 1.28s
dist/assets/index-jzpmsyBy.js  421.04 kB │ gzip: 118.97 kB
```

Kaynak koddan sıfır TypeScript hatası. (node_modules/vite/types/importGlob.d.ts Worker hatası vite kütüphanesi içi — `skipLibCheck` ile bertaraf edildi.)

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| `act()` uyarıları | Düşük | Keyboard navigation testlerinde bazı async state güncellemeleri `act()` dışında. Test sonuçlarını etkilemiyor. |
| Folder picker 401 sonrası retry yok | Düşük | PIN girip dialog tekrar açılırsa düzelir. UX eksiği, bug değil. |
| Browser/runtime test yapılmadı | Bilgi | Smoke testler jsdom ortamında. Gerçek tarayıcıda SSE, folder picker ve video render test edilmedi. |

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — CostTracker (/admin/cost-tracker) Sayfa Crash Fix

### Root Cause

Frontend `CostTracker.tsx` ile backend `/api/admin/costs` arasında **tam schema uyumsuzluğu** vardı:

| Alan | Frontend Bekliyordu | Backend Döndürüyordu |
|---|---|---|
| `summary.total_usd` | ✓ | YOK |
| `summary.total_cost_usd` | YOK | ✓ |
| `summary.this_month_usd` | ✓ | YOK |
| `summary.trend_percent` | ✓ | YOK |
| `by_provider[].category` | ✓ | YOK |
| `by_provider[].total_usd` | ✓ | YOK → `total_cost_usd` |
| `recent_jobs[].status` | ✓ | YOK (sadece completed gelir) |
| `recent_jobs[].created_at` | ✓ | YOK → `completed_at` |

`formatUSD(undefined)` çağrısı `TypeError: Cannot read properties of undefined (reading 'toFixed')` fırlatıyordu. React error boundary bu hatayı yakalayıp tüm component tree'yi unmount etti — root div boş kaldı, uygulama tamamen çöktü.

### Değiştirilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/admin/CostTracker.tsx` | Tamamen backend response schema'sına uyarlandı: `BackendSummary`, `BackendProviderCost`, `BackendRecentJob` tipleri; `formatUSD` null/undefined guard eklendi; provider category/label logic → `providerLabel()` helper; UI 3 kartlı düzenden gerçek veriye uygun düzene geçildi |

### Doğrulama (Browser — preview_screenshot)

- **Önce:** `/admin/cost-tracker` → siyah ekran, `root` div boş, tüm React uygulaması crash
- **Sonra:** Sayfa tam render, header "Maliyet Takibi", 3 stat kartı, provider dağılım çubukları, son işler tablosu görünür
- Gerçek backend verisi: `$0.00178` toplam maliyet, 18 API çağrısı, 5 provider, 2 tamamlanmış iş
- Hard reload sonrası da aynı sonuç — kalıcı fix

### Çalıştırılan Testler

```
npx vitest run
Test Files  3 passed (3)
Tests       82 passed (82)   ✅
```

### tsc --noEmit

```
npx tsc -p tsconfig.app.json --noEmit
→ Çıktı yok — sıfır hata  ✅
```

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| Backend schema değişirse frontend crash olur | Orta | `/api/admin/costs` response'u `dict[str, Any]` tipinde — Pydantic response_model yok. Backend alanları değişirse frontend yeniden bozulur. Çözüm: backend'e Pydantic response model eklemek. |
| `this_month_usd` ve trend gösterilmiyor | Bilgi | Backend bu veriyi hesaplamıyor. UI kaldırıldı, UX eksiği, bug değil. |

---

## 2026-03-31 — CostTracker Normalize Refactor

### Değişiklik Özeti

Backend→UI mapping mantığı component içinden ayrı bir utils modülüne taşındı.

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/admin/costTrackerUtils.ts` | **Yeni.** `BackendCostResponse`, `NormalizedCostData`, `NormalizedProvider`, `NormalizedJob` tipleri; `formatUSD`, `formatShortDate`, `resolveProviderLabel`, `resolveModuleLabel`, `normalizeCostResponse`, `EMPTY_COST_DATA` export'ları |
| `frontend/src/pages/admin/CostTracker.tsx` | Tüm mapping mantığı kaldırıldı; `normalizeCostResponse` ile ham veri normalize ediliyor; bileşen yalnızca `NormalizedCostData` tüketiyor; `ProviderBar` sub-component eklendi |
| `frontend/src/test/costTrackerUtils.test.ts` | **Yeni.** 25 test: `formatUSD` (6), `resolveProviderLabel` (3), `resolveModuleLabel` (3), `normalizeCostResponse` (11), `formatShortDate` (2) |

### Test Sonuçları

```
Test Files  4 passed (4)
Tests       107 passed (107)   ✅
```

Önceki: 82 → Bu session: +25 → Toplam: 107

### tsc --noEmit

```
npx tsc -p tsconfig.app.json --noEmit → sıfır hata  ✅
```

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — Çoklu Encode Onarımı + TTS/Altyazı Senkron Denetimi + Admin Panel Genişletme

### Değişiklik Özeti

**Görev 1 — Çoklu encode onarımı (kritik):**

| Sorun | Root Cause | Fix |
|---|---|---|
| `tts_fallback_order`, `llm_fallback_order`, `visuals_fallback_order` DB'de bozuk | Fragment array pattern: `['["edge_tts"', '"openai_tts"]', 'edge_tts']` | `_repair_list_elements` + `_repair_multi_encoded_values` startup onarımı |
| `settings_resolver._decode_value` yalnızca tek katman decode | `json.loads` tek kez çağrılıyordu | Iteratif decode (max 5 tur) |

| Dosya | Değişiklik |
|---|---|
| `backend/main.py` | `_repair_list_elements()` + `_repair_multi_encoded_values()` startup adımı (0b) |
| `backend/services/settings_resolver.py` | `_decode_value()` → iteratif json.loads (5 tur) |
| `backend/models/schemas.py` | `SettingResponse._decode_json_value` — iteratif decode eklendi |
| `backend/tests/test_migration_and_paths.py` | +28 test: `TestDecodeValueIterative` (9), `TestRepairMultiEncodedValues` (9), `TestCanonicalTextChain` (7), `TestSettingResponseDecoder` (+3) |

**Görev 2 — TTS/Altyazı senkron denetimi:**

Kod incelemesiyle doğrulandı: her iki zincir de aynı kaynak üzerinden `normalize_narration()` geçiriyor; senkron sorunu yok.

**Görev 3 — Admin panel genişletme (script + video/audio ayarları + prompt templates):**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/lib/constants.ts` | `toggle` SettingFieldType; `script`, `video_audio` kategori; `SYSTEM_SETTINGS_SCHEMA`'ya 14 yeni entry; `PROMPT_SETTINGS_SCHEMA` |
| `frontend/src/pages/admin/GlobalSettings.tsx` | toggle render branch; `PromptRow` + `PromptTemplatesCard` component; `script`, `video_audio` kategori render |
| `backend/pipeline/runner.py` | `{module_key}_script_prompt` → `script_prompt_template` aliasing; `{module_key}_metadata_prompt` → `metadata_prompt_template` aliasing |

---

### Çalıştırılan Testler

#### Backend (`python3 -m pytest backend/tests/test_migration_and_paths.py`)

```
43 passed in 0.40s  ✅
```

| Test Grubu | Test Sayısı | Sonuç |
|---|---|---|
| `TestMigrateLegacySettingKeys` | 4 | ✅ |
| `TestOutputPathSanitization` | 5 | ✅ |
| `TestSettingResponseDecoder` | 8 | ✅ |
| `TestDecodeValueIterative` | 9 | ✅ |
| `TestRepairMultiEncodedValues` | 9 | ✅ |
| `TestCanonicalTextChain` | 7 | ✅ |
| **TOPLAM** | **43** | **✅** |

#### Frontend (`npx tsc --noEmit`)

```
Çıktı yok — sıfır hata  ✅
```

---

### Doğrulanamayan Noktalar

1. **Prompt template alan görünümü tarayıcıda test edilmedi:** `PromptTemplatesCard` bileşeni jsdom'da render test edilmedi; yalnızca tsc ile tip kontrolü yapıldı.
2. **Startup onarım logu:** `_repair_multi_encoded_values` çalışınca "Çoklu encode onarımı tamamlandı" logu alınması beklenir; ancak gerçek DB üzerinde test edilmedi.

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| `{module_key}_script_prompt` key aliasing news_bulletin/product_review için de geçerli | Düşük | `runner.py` aliasing modül adına göre dinamik — tüm modüller için çalışır |
| Prompt template textarea boş kaydedilirse `""` vs null davranışı | Düşük | `config.setdefault` yalnızca truthy değerler için alias yapıyor — boş string alias yapılmaz, hardcoded template kullanılır. İstenen davranış bu. |

---

## 2026-03-31 — Tam Sistem Teşhis ve Hardcoded Envanter Raporu

> **Not:** Bu kayıt bir teşhis raporudur. Kod değişikliği yapılmamıştır.
> Amaç: Tüm hardcoded değerler, ayar akış kopuklukları, kullanılmayan ayarlar ve öncelikli fix planının belgelenmesi.

---

### 1. Hardcoded Ayar Envanteri

#### 1A. `backend/config.py` — Global Defaults (Katman 1)

| Ayar | Default | DB'ye Yazılır mı? | Runtime Kullanılır mı? | Notlar |
|---|---|---|---|---|
| `default_language` | `"tr"` | Evet (admin) | Evet | OK |
| `default_tts_provider` | `"edge_tts"` | Evet (admin) | Evet | OK |
| `default_llm_provider` | `"kieai"` | Evet (admin) | Evet | OK |
| `default_visuals_provider` | `"pexels"` | Evet (admin) | Evet | OK |
| `default_video_resolution` | `"1920x1080"` | Evet (admin) | Evet | OK |
| `default_video_fps` | `30` | Evet (admin) | Evet | OK |
| `default_subtitle_style` | `"standard"` | Evet (admin) | Evet | OK |
| `default_video_format` | `"long"` | Evet (admin) | **Hayır** | **KIRIK** — pipeline okumuyor |
| `admin_pin` | `"0000"` | Hayır | Evet | .env'den override edilmeli |
| `max_concurrent_jobs` | `2` | Evet (admin) | Evet | OK |
| `job_timeout_seconds` | `1800` | Hayır | **Kısmen** | **KIRIK** — `_GLOBAL_DEFAULTS`'a eklenmemiş |
| `output_dir` | `BASE_DIR/"output"` | Evet (admin) | Evet | OK |

#### 1B. `backend/modules/standard_video/config.py` — Modül Defaults (30 ayar, 12'si kullanılmıyor)

**Kullanılan ayarlar (18):** `scene_count`, `target_duration_seconds`, `language`, `script_temperature`, `script_max_tokens`, `tts_provider`, `tts_voice`, `tts_speed`, `visuals_provider`, `subtitle_style`, `subtitle_font_size`, `video_resolution`, `video_fps`, `ken_burns_enabled`, `ken_burns_intensity` + `llm_provider` (sorunlu — aşağıda)

**KULLANILMAYAN ayarlar (12):**

| Ayar | Default | Neden Kullanılmıyor |
|---|---|---|
| `llm_model` | `"gemini-2.5-flash"` | Provider kendi modelini biliyor |
| `metadata_provider` | `"gemini"` | Registry'den çekilir |
| `generate_metadata` | `True` | Metadata step her zaman çalışır |
| `metadata_language` | `"tr"` | `language` kullanılır |
| `visuals_per_scene` | `1` | Visuals step okumuyor |
| `visuals_orientation` | `"landscape"` | Pexels filtrelemiyor |
| `visuals_min_duration` | `5` | Okunmuyor |
| `subtitle_position` | `"bottom"` | Stil objeleri kendi position'ını tanımlıyor |
| `generate_subtitles` | `True` | Subtitle step her zaman çalışır |
| `video_format` | `"mp4"` | Her zaman mp4 |
| `composition_engine` | `"remotion"` | Sadece remotion destekli |
| `background_music_enabled/volume` | `False/0.15` | Müzik entegrasyonu yok |

#### 1C. Hardcoded Provider Sabitleri

| Provider | Sabit | Değer |
|---|---|---|
| edge_tts | Default voice (fallback) | `"tr-TR-AhmetNeural"` |
| kieai | Base URL | `https://api.kie.ai` |
| kieai | Endpoint | `/gemini-2.5-flash/v1/chat/completions` |
| kieai | Cost | `$0.075/$0.30 per 1M tokens` |
| composition | DEFAULT_SCENE_DURATION | `5.0s` (config'den okunamaz) |
| composition | API timeout | `120s` (config'den okunamaz) |

---

### 2. Hardcoded Prompt Envanteri

**Admin'den düzenlenebilir (PROMPT_SETTINGS_SCHEMA):** 6 prompt (3 modül × 2: script + metadata)

**Admin'den düzenleneMEZ (hardcoded):**
- 6 kategori (general, true_crime, science, history, motivation, religion) — `script.py`
- 8 açılış hook'u (shocking_fact, question, story, controversial, time_pressure, emotional, mystery, comparison) — `script.py`
- 5 subtitle stili (standard, neon_blue, gold, minimal, hormozi) — `subtitles.py`

---

### 3. Script → TTS → Subtitle Metin Zinciri

```
LLM → scenes[].narration (ham metin, markdown olabilir)
  ↓
TTS: _normalize_narration_for_tts(narration) [pipeline.py]
  → Edge TTS → .wav + word_timings
  ↓
Subtitle: _normalize_narration(narration) [subtitles.py]  ← ORJİNAL metni yeniden normalize eder
  → DUPLİKE FONKSİYON (aynı regex, farklı dosya)
  → Timing: TTS word_timings → Whisper fallback → eşit dağılım fallback
```

**Risk:** İki normalize fonksiyonu bağımsız dosyalarda. Biri değişirse TTS↔subtitle metin uyumsuzluğu.

---

### 4. Output Path Zinciri

```
config.py default → Admin POST /settings/admin/output-folder → DB + runtime mutation
→ Pipeline runner: job.resolved_settings_json snapshot veya app_settings.output_dir fallback
→ Final video copy: {output_dir}/{filename}.mp4
```

---

### 5. Kırık/Sorunlu Alanlar

| # | Alan | Ciddiyet |
|---|---|---|
| 1 | `llm_provider: "gemini"` in standard_video/config.py — kayıtlı provider adı `"kieai"` | **Yüksek** |
| 2 | 12 kullanılmayan DEFAULT_CONFIG ayarı — sessiz başarısızlık | **Orta** |
| 3 | Duplike normalize fonksiyonu (pipeline.py vs subtitles.py) | **Orta** |
| 4 | `video_format` pipeline'da okunmuyor | **Orta** |
| 5 | 5/11 UserSettings ayarı backend'de etkisiz (subtitle_enabled, metadata_enabled, thumbnail_enabled, publish_to_youtube, youtube_privacy) | **Orta** |
| 6 | `job_timeout_seconds` DB'den override edilemiyor | **Düşük** |
| 7 | Kategori promptları + açılış hook'ları admin'den değiştirilemez | **Düşük** |
| 8 | Backend response model yok (özellikle /admin/costs) | **Düşük** |
| 9 | Provider health check endpoint yok | **Düşük** |

---

### 6. Öncelikli Fix Planı

| Öncelik | İş | Dosyalar |
|---|---|---|
| **P0** | `llm_provider: "gemini"` → `"kieai"` düzelt | `standard_video/config.py` |
| **P1** | 12 unused config kaldır veya implemente et | `standard_video/config.py`, pipeline steps |
| **P1** | Etkisiz 5 user ayarını UI'dan kaldır veya implemente et | `UserSettings.tsx` |
| **P1** | Duplike normalize → tek fonksiyon | `pipeline.py`, `subtitles.py` |
| **P2** | `video_format` pipeline'da oku | `composition.py` |
| **P2** | `job_timeout_seconds` → `_GLOBAL_DEFAULTS` | `settings_resolver.py` |
| **P2** | Backend response model'leri ekle | `api/admin.py` |
| **P3** | Kategori promptları admin'den düzenlenebilir yap | `script.py`, `constants.ts` |
| **P3** | Provider health check ekle | `api/providers.py`, `ProviderManager.tsx` |

---

### Doğrulanamayan Noktalar

1. Module bootstrap: `DEFAULT_CONFIG` DB'ye yazılıyor mu? Yazılmıyorsa `llm_provider: "gemini"` sadece teorik.
2. `news_bulletin` / `product_review` config.py dosyalarında aynı sorunlar olabilir.
3. `default_` prefix routing: Admin `default_tts_provider` → pipeline `tts_provider` key uyumu detaylı trace edilmedi.

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — P0/P1 Sessiz Kırık Düzeltmeleri

### Değişiklik Özeti

Teşhis raporundaki (yukarıdaki kayıt) P0 ve P1 bulgularına göre sessiz kırıklar düzeltildi.

#### P0: llm_provider name mismatch

**Aktif bug muydu?** Hayır — module bootstrap DB'ye yazılmıyor (`get_default_config()` hiçbir yerde çağrılmıyor), bu yüzden config.py'deki `"gemini"` değeri pipeline'a ulaşmıyordu. Pipeline SettingsResolver katman 1'deki `"kieai"` değerini kullanıyor ve çalışıyordu. **Ancak:** module bootstrap gelecekte aktif edilirse anında kırılırdı. Ayrıca config dosyası yanlış bilgi taşıyordu.

**Root cause:** 3 modül config dosyasında `llm_provider: "gemini"` yazılmış ama registry'de kayıtlı provider adı `"kieai"`. `"gemini"` adında provider yok.

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `backend/modules/standard_video/config.py` | `llm_provider: "gemini"` → `"kieai"`, `metadata_provider: "gemini"` → `"kieai"` |
| `backend/modules/news_bulletin/config.py` | `llm_provider: "gemini"` → `"kieai"` |
| `backend/modules/product_review/config.py` | `llm_provider: "gemini"` → `"kieai"` |

#### P1: Duplike normalize fonksiyonu birleştirildi

**Root cause:** `_normalize_narration_for_tts()` (pipeline.py) ve `_normalize_narration()` (subtitles.py) birebir aynı regex pattern'leri uyguluyordu ama ayrı dosyalarda bağımsız tanımlanmıştı. Biri değiştirilirse TTS metni ile altyazı metni uyumsuz olurdu.

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `backend/utils/text.py` | **Yeni.** Canonical `normalize_narration()` fonksiyonu — tek kaynak |
| `backend/modules/standard_video/pipeline.py` | `_normalize_narration_for_tts()` silindi, `from backend.utils.text import normalize_narration` + kullanım güncellendi |
| `backend/pipeline/steps/subtitles.py` | `_normalize_narration()` silindi, `import re as _re` kaldırıldı, `from backend.utils.text import normalize_narration` + kullanım güncellendi |
| `backend/tests/test_normalize_narration.py` | **Yeni.** 22 birim testi (boş/None girdi, markdown temizleme, madde işareti, boşluk normalizasyonu, karma senaryo, Türkçe karakter) |

#### P1: Etkisiz modül ayarları kaldırıldı (12 ayar)

Pipeline'da hiçbir step'te okunmayan 12 ayar 3 modül config dosyasından temizlendi:

Kaldırılan ayarlar: `llm_model`, `metadata_provider`, `generate_metadata`, `metadata_language`, `visuals_per_scene`, `visuals_orientation`, `visuals_min_duration`, `subtitle_position`, `generate_subtitles`, `video_format` (mp4), `composition_engine`, `background_music_enabled`, `background_music_volume`

| Dosya | Kalan ayar sayısı |
|---|---|
| `standard_video/config.py` | 30 → 17 |
| `news_bulletin/config.py` | 28 → 17 |
| `product_review/config.py` | 23 → 17 |

#### P1: Etkisiz user ayarları UI'da dürüst hale getirildi (5 ayar)

**Problem:** UserSettings.tsx'te 5 toggle/select (subtitle_enabled, metadata_enabled, thumbnail_enabled, publish_to_youtube, youtube_privacy) backend'de hiçbir pipeline step tarafından okunmuyordu. Kullanıcı bu ayarları değiştirip kaydediyordu ama etkisi sıfırdı.

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/user/UserSettings.tsx` | "Yayın & Ek Özellikler" bölümü `opacity-60` + amber "henüz aktif değil" banner + tüm toggle'lar `locked` |
| `frontend/src/pages/user/UserSettings.tsx` | `subtitle_enabled` toggle kaldırıldı, sadece `subtitle_style` seçimi bırakıldı |
| `frontend/src/pages/user/UserSettings.tsx` | Save payload'dan etkisiz 5 key çıkarıldı (artık backend'e gönderilmez) |

#### video_format durumu

**Aktif bug mu?** Hayır. `video_format` ("long"/"shorts") CreateVideo.tsx'te `resolveResolution()` ile `video_resolution` string'e çevrilir (1920x1080 veya 1080x1920). Pipeline `video_resolution`'ı okur ve doğru sonuç üretir. `video_format` key'i resolved_settings'e gereksiz metadata olarak yazılır ama kullanıcıyı yanıltmıyor.

---

### Çalıştırılan Testler

#### Backend — `normalize_narration` testleri

```
python3 backend/tests/test_normalize_narration.py
22/22 tests passed  ✅
```

| Test Grubu | Test Sayısı |
|---|---|
| Boş/None girdi | 2 |
| Markdown temizleme (bold, italic, heading, backtick) | 10 |
| Madde işaretleri (-, •, *) | 3 |
| Boşluk/satır sonu normalizasyonu | 4 |
| Karma senaryo + Türkçe karakter | 3 |

#### Frontend — Vitest

```
npx vitest run
Test Files  4 passed (4)
Tests       107 passed (107)  ✅
```

Mevcut testlerin tamamı geçti (önceki: 107, şimdi: 107 — değişiklik yok).

#### tsc --noEmit

```
npx tsc -p tsconfig.app.json --noEmit
→ Çıktı yok — sıfır hata  ✅
```

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| `get_default_config()` gelecekte DB bootstrap'a bağlanırsa | Düşük | Artık config dosyaları doğru `"kieai"` değerini taşıyor — güvenli |
| `default_` prefix routing | ✅ Çözüldü | Aşağıdaki 2026-03-31 kaydında düzeltildi |
| Etkisiz ayarlar `UserVideoDefaults` type'da duruyor | Bilgi | Type'dan kaldırılmadı (settingsStore.ts) — breaking change riski nedeniyle bu görevde yapılmadı |

---

## 2026-03-31 — Kullanıcı Güvenini Bozan Görünür Sorunların Düzeltilmesi

**Görev:** Kullanıcıya görünen 4 güven-kırıcı sorunun giderilmesi.
**Önceki Kayıt:** P0/P1 sessiz kırıklar düzeltmesi (yukarıdaki kayıt).

### Tespit 1: GlobalSettings save/load — Kaydedilen değer sayfa yenilenince kayboluyor

**Belirti:** Admin "Shorts" seçip kaydediyor, sayfa yenilenince "Uzun Video"ya dönüyor. Aynı şekilde dil seçimi de korunmuyor.

**Kök Neden (2 katmanlı):**

1. **SettingResponse JSON decode eksik:** `SettingResponse` modeli `from_attributes=True` ile ORM'den `Setting.value` sütununu okuyor. Bu sütun JSON-encoded string tutuyor (ör. `'"shorts"'`). Ancak Pydantic'e decode ettiren bir validator yoktu — frontend ham JSON string alıyordu (`'"shorts"'`). Bu string hiçbir `<option value="shorts">` ile eşleşmiyordu.

2. **Anahtar isim uyumsuzluğu:** Frontend schema `default_language`, `default_tts_provider` vb. key adları kullanıyordu. Ancak `SettingsResolver._GLOBAL_DEFAULTS` ve pipeline kodu `language`, `tts_provider` vb. kullanıyor. Admin `default_language: "de"` kaydedince DB'ye `key="default_language"` olarak yazılıyordu — resolver `language` key'ini arıyor, bulamıyor, global default'a dönüyordu.

**Düzeltme:**

| Dosya | Değişiklik |
|-------|------------|
| `backend/models/schemas.py` | `SettingResponse`'a `@model_validator(mode="before")` eklendi — `Setting.value` JSON string'ini Python nesnesine çevirir |
| `frontend/src/lib/constants.ts` | Schema key'leri düzeltildi: `default_language` → `language`, `default_tts_provider` → `tts_provider`, `default_llm_provider` → `llm_provider`, `default_visuals_provider` → `visuals_provider`, `default_subtitle_style` → `subtitle_style` |
| `frontend/src/pages/user/CreateVideo.tsx` | `lockedKeys.includes("default_language")` → `lockedKeys.includes("language")` vb. |

### Tespit 2: Output folder path çift tırnak ve yol birleştirme hatası

**Belirti:** Output path `"/BASE_DIR/output"` şeklinde tırnaklı görünmesi.

**Kök Neden:** Aynı `SettingResponse` JSON-decode eksikliği. DB'de `'"/path/to/output"'` olarak saklanan değer frontend'e tırnak işaretleriyle birlikte dönüyordu.

**Düzeltme:** `SettingResponse` model_validator eklenmesiyle çözüldü (Tespit 1 ile aynı fix).

### Tespit 3: JobDetail — Çalışan adım için süre göstergesi yok

**Belirti:** Pipeline adımı "running" durumundayken spinner dönüyor ama geçen süre görünmüyor.

**Kök Neden:**
- Backend `update_step` SSE event'inde `started_at` alanı gönderilmiyordu.
- Frontend'de çalışan adımlar için süre sayacı bileşeni yoktu.

**Düzeltme:**

| Dosya | Değişiklik |
|-------|------------|
| `backend/services/job_manager.py` | SSE `step_update` event verisine `started_at` alanı eklendi |
| `frontend/src/stores/jobStore.ts` | SSE handler'lar `started_at`'i step state'ine aktarıyor |
| `frontend/src/pages/user/JobDetail.tsx` | `ElapsedTimer` bileşeni eklendi — `started_at`'ten itibaren canlı geçen süreyi gösteriyor |

### Test Sonuçları

```
npx tsc --noEmit → Çıktı yok — sıfır hata  ✅
npx vitest run → 107 test PASSED  ✅
python3 -m pytest backend/tests/ → 22 test PASSED  ✅
```

### Kalan Riskler

| Risk | Seviye | Not |
|---|---|---|
| Eski `default_*` key'leriyle DB'de kalan kayıtlar | Düşük | Yeni key adlarıyla eşleşmeyecek — admin tekrar kaydetmeli |
| `video_format` key resolver'da yok | Bilgi | Pipeline tarafından kullanılmıyor, sadece frontend UI tercihi |

---

## 2026-03-31 — Çoklu Encode Onarımı + TTS/Altyazı Senkron Denetimi

### Root Causes

**Bozuk encode (Problem 1):**
Geçmiş buglar nedeniyle DB'deki ayar kayıtları birden fazla `json.dumps` katmanıyla encode edilmişti. Özellikle fallback_order alanlarında JSON array brackets elemanlar arasında parçalanmıştı:
- `tts_fallback_order`: `['["edge_tts"', '"openai_tts"]', 'edge_tts']` (orijinal: `["edge_tts", "openai_tts"]`)
- `llm_fallback_order`: `['["kieai"', '"gemini"', '"openai_llm"]']` (orijinal: `["kieai", "gemini", "openai_llm"]`)
- `visuals_fallback_order`: `['["pexels"', '"pixabay"]']` (orijinal: `["pexels", "pixabay"]`)
- Ayrıca `kieai_api_key`, `language`, `tts_provider` gibi alanlar JSON encode edilmemiş bare string olarak saklanıyordu.

`_decode_value()` tek bir `json.loads()` yapıyordu — çoklu encode katmanlarını çözemiyordu.

**TTS/Altyazı senkron (Problem 2):**
Kod denetimi sonucu: mevcut mimari **doğru**. TTS ve altyazı aynı canonical `normalize_narration()` fonksiyonunu kullanıyor. Altyazı primary path'te TTS word-timing'lerini doğrudan kullanıyor (yeniden üretmiyor). Metin zinciri:
```
script.narration → normalize_narration() → Edge TTS → WordBoundary events → subtitle word_timings → Remotion render
```
Tüm zincir tek canonical kaynaktan besleniyor, divergence noktası yok.

### Yapılan Değişiklikler

| Dosya | Değişiklik |
|---|---|
| `backend/services/settings_resolver.py` | `_decode_value()` iteratif decode: string olduğu sürece json.loads tekrarla (max 5 katman) |
| `backend/models/schemas.py` | `SettingResponse._decode_json_value` iteratif decode (aynı mantık) |
| `backend/main.py` | `_repair_multi_encoded_values()`: startup'ta tüm DB kayıtlarını iteratif decode + canonical re-encode. `_repair_list_elements()`: fragment'lı array elemanlarını birleştirip parse, deduplicate. Lifespan'de step 0b olarak çağrılıyor. |
| `backend/tests/test_migration_and_paths.py` | +28 yeni test (toplam 65 dosyada): `TestDecodeValueIterative` (9), `TestRepairMultiEncodedValues` (9), `TestCanonicalTextChain` (7), `TestSettingResponseDecoder` (+3 multi-encode) |
| `docs/QA_LOG.md` | Bu kayıt |

### Test Sonuçları

| Suite | Sonuç |
|---|---|
| Backend (pytest) | 65/65 ✓ |
| Frontend (vitest) | 107/107 ✓ |
| TypeScript (tsc --noEmit) | temiz ✓ |

### Onarılan Gerçek DB Kayıtları

| Key | Eski (bozuk) | Yeni (onarılmış) |
|---|---|---|
| `tts_fallback_order` | `['["edge_tts"', '"openai_tts"]', 'edge_tts']` | `["edge_tts", "openai_tts"]` |
| `llm_fallback_order` | `['["kieai"', '"gemini"', '"openai_llm"]']` | `["kieai", "gemini", "openai_llm"]` |
| `visuals_fallback_order` | `['["pexels"', '"pixabay"]']` | `["pexels", "pixabay"]` |
| `kieai_api_key` | `bc633fe...` (bare) | `"bc633fe..."` (proper JSON) |
| `language` | `de` (bare) | `"de"` (proper JSON) |
| `tts_provider` | `edge_tts` (bare) | `"edge_tts"` (proper JSON) |
| `llm_provider` | `kieai` (bare) | `"kieai"` (proper JSON) |
| `video_format` | `shorts` (bare) | `"shorts"` (proper JSON) |

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| Edge TTS WordBoundary kelime bölümlemesi | Düşük | Edge TTS'in kelime sınırları normalize_narration() output'undan farklı olabilir — ama bu TTS davranışı, kod sorunu değil |
| Yeni bozuk encode oluşması | Çok Düşük | Write path (upsert) doğru çalışıyor; encode zinciri tek katman |
| Startup repair performansı | Düşük | Her başlatmada tüm settings taranıyor; az kayıt olduğu sürece < 1ms |

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — Admin Kontrol Wiring Denetimi ve Düzeltme

### Değişiklik Özeti

Önceki turda eklenen tüm admin panel kontrollerinin gerçek pipeline etkisi statik kod denetimiyle doğrulandı. 4 eksik wiring tespit edildi ve düzeltildi.

#### Denetim Sonuçları

| Kontrol | Durum | Not |
|---|---|---|
| `scene_count` | **WIRED** ✅ | 3 modül pipeline.py'de `config.get("scene_count")` ile okunuyor |
| `category` | **WIRED** ✅ | `script.py:get_category_prompt_enhancement()` ile LLM prompt'a ekleniyor |
| `use_hook_variety` | **WIRED** ✅ | `script.py:select_opening_hook()` ile hook seçimi |
| `script_temperature` | **WIRED** ✅ | 3 modülde LLM API parametresi olarak geçiyor |
| `script_max_tokens` | **WIRED** ✅ | 3 modülde LLM API parametresi olarak geçiyor |
| `tts_voice` | **WIRED** ✅ | `step_tts()` içinde `config.get("tts_voice")` ile okunuyor |
| `tts_speed` | **WIRED (Edge TTS)** ✅ | `edge_tts_provider.py:81` — `config.get("tts_speed", 1.0)` |
| `subtitle_font_size` | **WIRED** ✅ | `subtitles.py:321` okunuyor, subtitle JSON'a yazılıyor, Remotion alıyor |
| `subtitle_use_whisper` | **WIRED** ✅ | `subtitles.py:324` — Whisper fallback toggle |
| `ken_burns_enabled` | **WIRED** ✅ | `composition.py:246` — Remotion prop |
| `ken_burns_intensity` | **WIRED** ✅ | `composition.py:247` — Remotion `kenBurnsZoom` prop |
| `video_fps` | **WIRED** ✅ | `composition.py` 4 yerde okunuyor, Remotion render param |
| `video_resolution` | **WIRED** ✅ | `composition.py` 4 yerde okunuyor, width/height parse ediliyor |
| `standard_video_script_prompt` | **WIRED** ✅ | `standard_video/pipeline.py:step_script` — `script_prompt_template` alias |
| `news_bulletin_script_prompt` | **WIRED** ✅ | `news_bulletin/pipeline.py:step_script_bulletin` |
| `product_review_script_prompt` | **DÜZELTİLDİ** 🔧 | Önceki turda unwired'dı — `step_script_review` içine `script_prompt_template` okuma eklendi |
| `standard_video_metadata_prompt` | **DÜZELTİLDİ** 🔧 | Önceki turda unwired'dı — `step_metadata` içine `metadata_prompt_template` okuma eklendi |
| `news_bulletin_metadata_prompt` | **DÜZELTİLDİ** 🔧 | `step_metadata` shared olduğu için fix otomatik geçerli |
| `product_review_metadata_prompt` | **DÜZELTİLDİ** 🔧 | `step_metadata` shared olduğu için fix otomatik geçerli |

#### Düzeltilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `backend/modules/product_review/pipeline.py` | `step_script_review`: hardcoded `_REVIEW_SYSTEM_INSTRUCTION` yerine `config.get("script_prompt_template")` okuma; boş ise fallback |
| `backend/modules/standard_video/pipeline.py` | `step_metadata`: hardcoded `_METADATA_SYSTEM_INSTRUCTION` yerine `config.get("metadata_prompt_template")` okuma; boş ise fallback |

---

### Çalıştırılan Testler

#### Backend (`python3 -m pytest backend/tests/ -q`)

```
65 passed in 0.58s  ✅
```

#### `npx tsc --noEmit`

```
Çıktı yok — sıfır hata  ✅
```

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| `tts_speed` ElevenLabs/OpenAI TTS için etkisiz | Düşük | Sadece Edge TTS provider `config.get("tts_speed")` okuyor. Diğer provider'lar bu key'i okumuyorlar. |
| Metadata prompt template `{placeholder}` desteği yok | Düşük | `step_metadata` custom template'i olduğu gibi LLM'e gönderiyor; format() çağrısı yok. |
| `product_review` script prompt unknown placeholder silently ignored | Düşük | `KeyError` catch var — bilinmeyen placeholder kullanılırsa template olduğu gibi geçer, hata fırlatılmaz. |

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — Runtime Wiring Doğrulaması (Gerçek API Testleri)

### Test Yöntemi

İzole Python test scriptleri ile gerçek API çağrısı yapıldı. Her test için aynı input farklı config ile iki kez çalıştırıldı (A/B). Kanıt: gerçek LLM/TTS çıktı farkı.

---

### Test A — product_review script_prompt_template

**Soru:** `product_review_script_prompt` admin'de kaydedilince LLM gerçekten farklı script üretiyor mu?

**Yöntem:** Aynı ürün (Sony WH-1000XM5), aynı parametreler. A: hardcoded template. B: "PIRATE reviewer, her narration AHOY MATEY ile başlamalı" custom template.

**Kanıt:**

| | İlk sahne narasyon (ilk 120 karakter) |
|---|---|
| DEFAULT | `Tired of the world's noise? Imagine a sanctuary of sound, where distractions fade away. Today, we're diving into the Sony WH-1000XM5...` |
| CUSTOM  | `AHOY MATEY! Gather 'round, ye landlubbers and sea dogs alike, for I've a tale to spin about a grand piece o' gear – the Sony WH-1000XM5!...` |

```
AHOY in custom output: True
DEFAULT differs from CUSTOM: True
```

**SONUÇ: WIRED ✅ — Custom template LLM çıktısını doğrudan etkiliyor.**

---

### Test B — standard_video metadata_prompt_template (tüm modüller)

**Soru:** `standard_video_metadata_prompt` admin'de kaydedilince üretilen YouTube metadata değişiyor mu?

**Yöntem:** Aynı script, aynı başlık. A: hardcoded template. B: "title MUST start with 'EPIC:', desc must start with 'SPONSORED BY COFFEE INC', tags = ['espresso','beans']" custom template.

**Kanıt:**

| Alan | DEFAULT | CUSTOM |
|---|---|---|
| youtube_title | `The History of Coffee: From Ancient Ethiopia to Your Morning Cup` | `EPIC: THE HISTORY OF COFFEE` |
| youtube_description (ilk 80) | `Embark on a fascinating journey through time...` | `SPONSORED BY COFFEE INC Scene 1: Imagine a discovery...` |
| tags | 12 item (coffee history, origin of coffee...) | `['espresso', 'beans']` |

```
CUSTOM title starts with 'EPIC': True
CUSTOM desc starts with 'SPONSORED': True
CUSTOM tags == ['espresso','beans']: True
Titles differ: True
VERDICT: WIRED - metadata prompt affects output
```

**SONUÇ: WIRED ✅ — Custom metadata template YouTube title, description ve tags'i tamamen değiştiriyor.**

news_bulletin ve product_review modülleri aynı `step_metadata` fonksiyonunu import ettiği için bu düzeltme onlar için de geçerli (ayrı test gerekmedi).

---

### Test C — tts_speed (Edge TTS)

**Soru:** `tts_speed` admin'den değiştirilince ses süresi gerçekten değişiyor mu?

**Yöntem:** Aynı metin (18 kelime), aynı ses. A: speed=0.6. B: speed=1.8.

**Kanıt:**

| Speed | duration_ms | audio_bytes | word_timings |
|---|---|---|---|
| 0.6 (yavaş) | 10374 | 70848 | 16 |
| 1.8 (hızlı) | 3458 | 23760 | 16 |

```
Duration ratio slow/fast: 3.00x (expected ~3.0x)
Slow is longer: True
VERDICT: WIRED - speed affects audio duration
```

Beklenen oran: 1.8/0.6 = 3.0x. Ölçülen: tam 3.00x. Edge TTS lineer hız kontrolü doğrulandı.

**SONUÇ: WIRED ✅ (Edge TTS) — tts_speed ses süresini doğrudan ve orantılı biçimde etkiliyor.**

**Sınır:** ElevenLabs ve OpenAI TTS provider'ları `tts_speed` key'ini okumuyorlar — bu onlar için etkisiz. Edge TTS default provider olduğu sürece sorun yok.

---

### Test D — metadata_prompt_template `{placeholder}` davranışı

**Soru:** Template içinde `{topic}` yazılırsa bu substitution yapılıyor mu?

**Kanıt:** Template `'...about {topic}...'` gönderilince LLM'e giden system_instruction aynen `'...about {topic}...'` içeriyordu. `format()` çağrısı yok, substitution yapılmıyor.

**Kabul edilebilir mi?**

Evet. `step_metadata` LLM'e zaten user prompt'ta title + script summary gönderiyor. LLM `{topic}` literal metnini görerek bağlamdan anlar. Kullanıcı dilerse template'e `{topic}` yazmadan doğrudan instruction yazabilir — bu daha iyi pratik. Placeholder sistemi gerekirse ileriki sürümde eklenebilir.

**SONUÇ: Limitation mevcut, kabul edilebilir, dokümante edildi.**

---

### Test Sonuçları (Statik)

```
python3 -m pytest backend/tests/ -q
65 passed in 0.40s  ✅

npx tsc --noEmit
Çıktı yok — sıfır hata  ✅
```

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — Dashboard ↔ Jobs Etkileşim Modeli Eşitleme

### Jobs ile Dashboard Arasındaki Farklar (Öncesi)

| Davranış | Jobs ekranı | Dashboard (eski) |
|---|---|---|
| Sol tık | `JobDetailSheet` (in-page drawer) | `navigate('/jobs/{id}')` (sayfa geçişi) |
| Sağ tık | `JobQuickLook` (modal önizleme) | Yok |
| Space tuşu | `JobQuickLook` açar | Yok |
| Enter tuşu | `JobDetailSheet` açar | Yok |
| ArrowUp/Down | Satır odaklanması | Yok |
| Home/End | İlk/son satıra git | Yok |
| ESC | Açık paneli kapar | Yok |
| Fare hover → klavye sync | Var | Yok |
| `role="listbox"` / `role="option"` | Var | Yok |
| Roving tabindex | Var | Yok |
| `useFocusRestore` | Var | Yok |
| ESC öncelik yığını | QuickLook>20, Sheet>10 | Yok |
| Klavye kısayol ipuçları | Var | Yok |

### Değiştirilen Dosya

`frontend/src/pages/user/Dashboard.tsx` — tek dosya.

### Nasıl Eşitlendi

1. `useNavigate` kaldırıldı → `JobDetailSheet` + `JobQuickLook` state eklendi
2. `useScopedKeyboardNavigation`, `useRovingTabindex`, `useFocusRestore`, `useDismissOnEsc` import ve çağrıları eklendi (Jobs ekranıyla birebir aynı pattern)
3. `recentJobs` hesabı hook'lardan önce yapılacak şekilde öne alındı (itemCount için)
4. "Son İşler" listbox'ına `ref`, `role="listbox"`, `aria-labelledby`, `aria-activedescendant` eklendi
5. Klavye kısayol ipuçları bandı eklendi
6. `RecentJobRow` tamamen yeniden yazıldı: `onClick` + `onContextMenu (→ QuickLook)` + `onMouseEnter` + `tabIndex` + `role="option"` + `aria-selected/setsize/posinset` + `isFocused` ring stili
7. `<JobQuickLook>` ve `<JobDetailSheet>` panelleri Dashboard render'ına eklendi
8. `pendingSheetJobRef` ile QuickLook → Sheet geçiş akışı eklendi

### Runtime Doğrulama

Statik analiz (tsc) + smoke testler (jsdom render):
- `pageSmoke.test.tsx` Dashboard'u render ediyor — crash yok
- `tsc --noEmit` sıfır hata

Etkileşim doğrulaması (kod incelemesi):
- Sol tık → `setSheetJob(job)` → `JobDetailSheet` açılır ✅
- Sağ tık → `e.preventDefault()` + `setQuickLookJob(job)` → `JobQuickLook` açılır ✅
- Space → `useScopedKeyboardNavigation.onSpace` → `openQuickLook` ✅
- Enter → `onEnter` → `captureForRestore` + `setSheetJob` ✅
- ESC → `useDismissOnEsc` priority stack çalışır (QuickLook=20 > Sheet=10) ✅
- Panel kapanınca → `restoreFocusDeferred(150)` → odak satıra döner ✅
- Fare hover → `onHover` → `setFocusedIdx` → klavye ile sync ✅

### Test Sonuçları

```
python3 -m pytest backend/tests/ -q
65 passed in 0.50s  ✅

npx vitest run
Test Files  4 passed (4)
Tests       107 passed (107)  ✅

npx tsc --noEmit
Çıktı yok — sıfır hata  ✅
```

---

## 2026-03-31 — Kullanıcı Tarafında Görünür 3 Sorun Düzeltmesi

### Root Cause ve Değişiklik Özeti

#### Sorun 1 — JobDetail Süreç Görünürlüğü

**Root Cause:**
- `RenderProgressWidget`'ta `pct > 0` guard → bundling %0'da progress bar tamamen gizliydi
- Bundling başladığında `bundling_pct` null olduğunda "başlatılıyor..." metni yoktu
- `ElapsedTimer` `started_at` null gelirse sessizce gizleniyordu — step çalışıyor ama süre gösterilmiyordu
- 5 dakikayı aşan adımlar için "takılmış olabilir" uyarısı yoktu

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/user/JobDetail.tsx` | `RenderProgressWidget`: `pct=0`'da indeterminate pulse bar gösterilir (blank değil); bundling_pct null → "başlatılıyor..." metni; `overall_pct=0` → "hesaplanıyor" etiketi |
| `frontend/src/pages/user/JobDetail.tsx` | `ElapsedTimer`: `startedAt` null/undefined kabul eder → "çalışıyor" etiketi; 5 dakika (300s) aşılınca amber renk + "uzun!" uyarısı |
| `frontend/src/pages/user/JobDetail.tsx` | `StepRow`: `started_at` null olsa da running step için ElapsedTimer gösterilir (önceki: `step.started_at` truthy guard vardı) |

---

#### Sorun 2 — Output Folder Finder/Explorer Açılışı

**Root Cause:**
- GlobalSettings output_dir alanında "Klasör Seç" (FolderPickerDialog) vardı ama "Finder'da Aç" butonu yoktu
- Backend'de `subprocess` ile sistem dosya gezginini açan endpoint hiç yoktu

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `backend/api/settings.py` | `POST /api/settings/admin/open-folder` yeni endpoint: macOS `open`, Windows `explorer`, Linux `xdg-open` çağırır |
| `frontend/src/pages/admin/GlobalSettings.tsx` | `openFolderInFinder()` helper; `path` tipindeki `SettingRow`'a `ExternalLink` ikonu ile "Klasörü Aç" butonu eklendi; `openingFolder` state ile yükleme ikonu; hata toast |

---

#### Sorun 3 — JobDetail Çıktı Klasörüne Git

**Root Cause:**
- JobDetail tamamlanan iş için `output_path` yalnızca truncate'li text olarak gösteriliyordu
- Tıklanabilir, gerçek klasörü açan bir buton yoktu
- `job.output_path` dosya disk üzerinde yoksa sessiz hata — kullanıcıya mesaj verilmiyordu

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `backend/api/jobs.py` | `POST /api/jobs/{job_id}/open-output` yeni endpoint: output_path'i kontrol eder, macOS `-R` (reveal in Finder), Windows `/select,`, Linux parent dir açar; dosya yoksa 404 döner |
| `frontend/src/pages/user/JobDetail.tsx` | `OutputPathRow` bileşeni: path text + "Klasörü Aç" butonu (`ExternalLink` ikonu); hata durumunda inline error banner gösterir |

---

### Runtime Doğrulama

**Finder open (macOS):**
```
Platform: Darwin
Would use: open
Opening: /Users/.../ContentManager/output
Exists: True
Return code: 0
RUNTIME CHECK: Finder open executed successfully
```

**Import check:**
```
IMPORT CHECK: open_folder_in_explorer and open_job_output_folder imported OK
```

---

### Test Sonuçları

```
python3 -m pytest backend/tests/ -q
65 passed in 0.52s  ✅

npx vitest run
Test Files  4 passed (4)
Tests       107 passed (107)  ✅

npx tsc --noEmit
Çıktı yok — sıfır hata  ✅
```

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| Finder open Linux'ta `xdg-open` gerektirir | Düşük | Headless sunucuda çalışmaz — localhost-first sistem bu riski taşımaz |
| `open-output` endpoint admin PIN gerektirmez | Bilgi | Kasıtlı: normal kullanıcı kendi işinin çıktısını açabilmeli |
| `open-folder` endpoint admin PIN gerektirir | Bilgi | GlobalSettings admin panelinde, PIN zaten mevcut — doğru davranış |
| ElapsedTimer "uzun!" 5dk sabit — tuneable değil | Bilgi | Hardcoded `STALE_THRESHOLD_S = 300` — yeterli başlangıç değeri |

---

## 2026-03-31 — Provider Fallback UI Düzeltmesi + EdgeTTS Voice Resolution Zinciri Fix

### Değişiklik Özeti

#### Problem 1: Provider UI'da gerçekte kayıtlı olmayan provider'lar seçilebiliyordu

**Root Cause:** `ProviderManager.tsx` `FALLBACK_OPTIONS` listesinde `elevenlabs`, `openai_tts`, `gemini`, `openai_llm`, `pixabay` yer alıyordu ve bunlar drag-to-order listesine eklenebiliyordu. Ancak bu provider'ların `backend/providers/` altında implementasyon dosyası yok ve `provider_registry._providers` dict'inde kayıtlı değiller.

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/admin/ProviderManager.tsx` | `FALLBACK_OPTIONS` her provider'a `available: boolean` eklendi. `available: false` olanlar `disabled`, `cursor-not-allowed`, `opacity-60`, `border-dashed` + `(yakında)` suffix ile render ediliyor. Seçilemez. |

Gerçekte kayıtlı (available: true): `edge_tts`, `kieai`, `pexels`
Yakında (available: false): `elevenlabs`, `openai_tts`, `gemini`, `openai_llm`, `pixabay`

---

#### Problem 2: EdgeTTS varsayılan sesi hardcoded `tr-TR-AhmetNeural` (erkek ses)

**Root Cause — 3 katmanlı:**
1. `_GLOBAL_DEFAULTS`'ta `tts_voice` yoktu → resolver `None` döndürüyordu
2. 3 modül `DEFAULT_CONFIG`'de `"tts_voice": "tr-TR-AhmetNeural"` vardı → erkek ses devreye giriyordu
3. `edge_tts_provider.py` son fallback `config.get("tts_voice", "tr-TR-AhmetNeural")` hardcoded

**Fix:**

| Dosya | Değişiklik |
|---|---|
| `backend/config.py` | `default_tts_voice: str = Field(default="tr-TR-EmelNeural", ...)` eklendi |
| `backend/services/settings_resolver.py` | `_GLOBAL_DEFAULTS`'a `"tts_voice": app_settings.default_tts_voice` eklendi |
| `backend/modules/standard_video/config.py` | `"tts_voice": "tr-TR-AhmetNeural"` kaldırıldı |
| `backend/modules/news_bulletin/config.py` | Aynı |
| `backend/modules/product_review/config.py` | Aynı |
| `backend/providers/tts/edge_tts_provider.py` | Son fallback hardcoded string → `_app_settings.default_tts_voice` |

---

### Runtime Doğrulama — `/tmp/test_voice_resolution.py`

```
config.py default_tts_voice: tr-TR-EmelNeural
TEST 1 — Resolved tts_voice (no admin override): 'tr-TR-EmelNeural' → Match: True
TEST 2 — TTS with resolved config: voice_requested='tr-TR-EmelNeural', success=True, duration_ms=3587
TEST 3/4 — Male (AhmetNeural): success=True, duration_ms=3737
         Female (EmelNeural): success=True, duration_ms=3587
VERDICT: FIXED — default voice is now tr-TR-EmelNeural from _GLOBAL_DEFAULTS
```

---

### Test Sonuçları

```
python3 -m pytest backend/tests/ -q
65 passed in 0.48s  ✅

npx tsc --noEmit
Çıktı yok — sıfır hata  ✅
```

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| DB'de `tts_voice: "tr-TR-AhmetNeural"` kayıtlı olabilir | Düşük | Admin geçmişte kaydetmişse DB override olarak kalır. Admin'den değiştirmeli. |

---

## 2026-03-31 — Dashboard Runtime Doğrulama + Final Hardcoded Audit

### Değişiklik Özeti

İki bölümlü görev:
1. Dashboard etkileşim modelinin 8 davranışının statik kod analizi ile doğrulanması
2. Tüm sistemin hardcoded değer envanteri — kalan yanlış hardcode'ların düzeltilmesi + `HARDCODED_FINAL_AUDIT.md` oluşturulması

---

### Bölüm A — Dashboard Runtime Doğrulama (Statik Kod İzleme)

Önceki oturumda yapılan Dashboard eşitleme çalışması için 8 etkileşim davranışı kod yolu izlenerek doğrulandı.

| # | Davranış | Kod Yolu | Sonuç |
|---|----------|----------|-------|
| 1 | Sol tık → JobDetailSheet | `RecentJobRow.onClick` → `setSheetJob(job)` → `<JobDetailSheet open={true}>` | ✅ |
| 2 | Sağ tık → JobQuickLook | `onContextMenu → e.preventDefault() + openQuickLook(job)` → `setQuickLookJob(job)` | ✅ |
| 3 | Enter → JobDetailSheet | `useScopedKeyboardNavigation.onEnter` → `captureForRestore + setSheetJob(recentJobs[idx])` | ✅ |
| 4 | Space → JobQuickLook | `onSpace(idx)` → `openQuickLook(recentJobs[idx])` | ✅ |
| 5 | ESC → en üstteki panel kapanır | `useDismissOnEsc(QuickLook, priority=20)` > `useDismissOnEsc(Sheet, priority=10)` — LIFO sıralı kapatma | ✅ |
| 6 | Panel kapanınca odak geri döner | `closeQuickLook → restoreFocusDeferred(80)`, `closeSheet → restoreFocusDeferred(150)` | ✅ |
| 7 | Hover → klavye odak sync | `onMouseEnter → setFocusedIdx(idx)`, `lastWasKeyboardRef=false` → DOM focus() çağrılmaz | ✅ |
| 8 | ARIA/role davranışı | `role="listbox" + aria-activedescendant`, `role="option" + aria-selected/setsize/posinset` + roving tabindex | ✅ |

**Güvenlik doğrulaması:**
- Panel açıkken (`anyPanelOpen=true`) `disabled=true` → scope pop → `isActive()=false` → klavye handler devre dışı ✅
- `useDismissOnEsc` capture phase listener — Radix'in `defaultPrevented` seti ile çakışmaz ✅

---

### Bölüm B — Final Hardcoded Audit Bulguları

Tam envanter `docs/HARDCODED_FINAL_AUDIT.md` dosyasında.

**Tespit edilen ve düzeltilen sorunlar:**

| Dosya | Eski Değer | Yeni Değer | Açıklama |
|---|---|---|---|
| `backend/modules/standard_video/pipeline.py:289` | `config.get("tts_voice", "tr-TR-AhmetNeural")` | `config.get("tts_voice") or _app_settings.default_tts_voice` | Voice chain'de tek kalan hardcoded erkek ses referansı — önceki oturumda provider ve module config'den kaldırıldı ama bu satır kaçmıştı |
| `frontend/src/lib/constants.ts:333` | `default: "tr-TR-AhmetNeural"` | `default: "tr-TR-EmelNeural"` | UI schema placeholder default'u runtime default ile eşitlendi |
| `docs/ADMIN_CONTROLS_MAP.md` | `tts_voice` default `tr-TR-AhmetNeural` | `tr-TR-EmelNeural` | Stale doküman güncellendi |
| `docs/SYSTEM_CHAINS_MAP.md` | `"tr-TR-AhmetNeural" (when tts_voice absent)` | `app_settings.default_tts_voice → "tr-TR-EmelNeural"` | Stale doküman güncellendi |

**Kabul edilen technical fallback'ler (değiştirilmedi):**
- 6 kategori promptu, 8 hook tipi, 5 altyazı stili — admin'den değiştirilemez, kasıtlı tasarım kararı
- `providers/registry.py:16` health check test voice = `"tr-TR-AhmetNeural"` — yalnızca sağlık kontrolü, pipeline default değil

**Kalan NOT WIRED durum:**
- `video_format` — CreateVideo tarafında `resolveResolution()` ile `video_resolution`'a çevrilir; pipeline doğrudan `video_resolution` okur. Bug değil.

**Kalan VISIBLE BUT DISABLED:**
- UserSettings "Yayın & Ek Özellikler" bölümü (metadata_enabled, thumbnail_enabled, publish_to_youtube, youtube_privacy) — amber banner ile bildirilmiş, YouTube OAuth implemente edilince aktif olacak.

---

### Çalıştırılan Testler

```
python3 -m pytest backend/tests/ -q
65 passed in 0.46s  ✅

npx vitest run
Test Files  4 passed (4)
Tests       107 passed (107)  ✅

npx tsc -p tsconfig.app.json --noEmit
Çıktı yok — sıfır hata  ✅
```

---

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| DB'de `tts_voice: "tr-TR-AhmetNeural"` kayıtlı kalabilir | Düşük | Admin geçmişte kaydetmişse DB override olarak kalır — admin panelden değiştirmeli |
| `video_format` pipeline'da okunmuyor | Bilgi | Tasarım kararı; `CreateVideo.tsx` format → resolution dönüşümünü client-side yapıyor |
| UserSettings etkisiz togglelar | Bilgi | Amber banner ile dürüstçe belgelenmiş; YouTube OAuth implemente edilince aktif olacak |

---

*Bu dosya her görev sonunda güncellenir. Üzerine yazma, sadece ekleme.*

---

## 2026-03-31 — Prompt Mimarisi Birleştirme + Final Sync

### Değişiklik Özeti

**Görev: Prompt yönetim yüzeyini tek yere topla (Master Promptlar sayfası)**

| Dosya | Değişiklik |
|---|---|
| `frontend/src/pages/admin/GlobalSettings.tsx` | `PromptTemplatesCard` + `PromptRow` bileşenleri kaldırıldı; `PROMPT_SETTINGS_SCHEMA`, `PromptSettingDef`, `FileText` import'ları temizlendi; docstring güncellendi |
| `frontend/src/components/layout/AppShell.tsx` | `PAGE_TITLES`'a `/admin/prompts → "Master Promptlar"` ve `/admin/costs → "Maliyet Takibi"` eklendi |

**Mimari kararlar:**

- `category` ve `use_hook_variety` Global Settings Script kategorisinde **kalmaya devam eder** — bunlar davranış kontrolleri (behavior toggles), metin şablonları değil.
- Prompt yönetimi artık **tek yerde**: `/admin/prompts` (PromptManager.tsx), `scope="module"` ile kaydeder.
- GlobalSettings `handleSave` artık yalnızca sistem/pipeline/script/video_audio kategorisi ayarlarını yönetir.
- `runner.py`'daki aliasing mantığı hâlâ geçerli; PromptManager `script_prompt_template` key'i ile `scope=module` kaydeder.

### Mimari Sonuç Durumu

| Yüzey | Yönetilen Alanlar | Scope |
|---|---|---|
| Global Ayarlar (`/admin/global-settings`) | system, pipeline, script (behavior), video_audio | `admin` |
| Master Promptlar (`/admin/prompts`) | script_prompt_template, metadata_prompt_template | `module` |
| Provider Yönetimi (`/admin/providers`) | API anahtarları, fallback sırası | `admin` |

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| DB'de `scope=admin` kayıtlı eski prompt değerleri | Düşük | Eski GlobalSettings üzerinden kaydedilmiş admin-scope prompt'lar DB'de kalır; 5-layer'da module > admin olduğundan PromptManager ile üstüne yazılabilir |

---

## 2026-03-31 — Kategori & Hook Yönetim Sistemi

### Değişiklik Özeti

**Görev: category ve hook sistemlerini Master Prompts ekranında yönetilebilir yap**

| Dosya | Değişiklik |
|---|---|
| `backend/pipeline/steps/script.py` | `_category_overrides` + `_hook_overrides` dict'leri eklendi; `load_overrides_from_db(db)` fonksiyonu; `_get_effective_category()` + `_get_effective_hooks()` override-aware merge fonksiyonları; `get_category_detail()`, `get_all_categories_detail()` yeni API fonksiyonları; `get_available_hooks()` override + enabled bilgisi döndürecek şekilde güncellendi |
| `backend/pipeline/runner.py` | Pipeline başlamadan önce `load_overrides_from_db(db)` çağrısı eklendi |
| `backend/api/admin.py` | `GET /api/admin/categories`, `PUT /api/admin/categories/{key}`, `GET /api/admin/hooks/{lang}`, `PUT /api/admin/hooks/{type}/{lang}` endpoint'leri eklendi |
| `frontend/src/pages/admin/PromptManager.tsx` | Üç sekme mimarisi: "Modül Promptları" | "Kategoriler" | "Açılış Hook'ları"; CategoryEditor + HookEditor bileşenleri |

### Global Settings vs Master Prompts Kesin Ayrımı

| Global Settings'te Kalan | Master Prompts'ta Olan |
|---|---|
| `category` (hangi kategori seçili — behavior) | Kategori ton/odak/stil metin içerikleri |
| `use_hook_variety` (hook sistemi açık/kapalı — behavior) | Hook ad ve talimat şablon metinleri |
| `scene_count`, `script_temperature` vb. sistem davranışları | script_prompt_template, metadata_prompt_template |
| Pipeline provider seçimi, TTS ayarları | Kategori/hook enabled toggle'ları |

### Runtime Wiring Doğrulaması

| Test | Sonuç |
|---|---|
| `GET /api/admin/categories` → 6 kategori | ✅ |
| `GET /api/admin/hooks/tr` → 8 hook | ✅ |
| `PUT /api/admin/categories/science` (tone override) | ✅ `has_override=True` |
| Reset science → hardcoded değer geri geldi | ✅ `has_override=False` |
| `get_category_prompt_enhancement()` override-aware | ✅ (load_overrides_from_db sonrası) |
| `select_opening_hook()` disabled hook filtresi | ✅ (_get_effective_hooks kullanıyor) |
| pipeline runner'da load_overrides_from_db çağrısı | ✅ runner.py:138 |

### Override Saklama Mimarisi

```
category override: scope="admin", scope_id="", key="category_content_{key}"
                   value = JSON: {tone, focus, style_instruction, enabled}

hook override:     scope="admin", scope_id="", key="hook_content_{type}_{lang}"
                   value = JSON: {name, template, enabled}
```

Her ikisi de mevcut `settings` tablosunu kullanır — yeni tablo yok.

### Çalıştırılan Testler

```
python3 -m pytest backend/tests/ -q
65 passed in 0.58s  ✅

npx vitest run
Tests  107 passed (107)  ✅

npx tsc -p tsconfig.app.json --noEmit
Çıktı yok — sıfır hata  ✅
```

### Kalan Riskler

| Risk | Seviye | Açıklama |
|---|---|---|
| Kategori/hook override'ları session-level `_category_overrides` dict'inde | Düşük | Override'lar process restart'ta kaybolmaz (DB'den yüklenir) ancak her pipeline başlamadan önce taze yükleme yapılıyor |
| `general` kategorisinin enabled toggle'ı UI'da var | Bilgi | Pipeline `general` kategorisi için hiçbir zaman enhancement eklemez (`if category != "general"`) — enabled/disabled durumu etkisiz |

---

## 2026-03-31 — Kategori/Hook CRUD Tam Doğrulama Raporu

### Kapsam

Bu rapor aşağıdaki 4 alanın eksiksiz ve dürüst doğrulamasını kapsar:
1. **Kategori CRUD** — oluştur/düzenle/sil/builtin koruma/disabled runtime/yeni kategori pipeline'da
2. **Hook CRUD** — aynı
3. **UI doğrulaması** — gerçek tarayıcı, ağ logu kanıtlı
4. **Dürüst rapor** — sadece kanıtlanmış bulgular, spekülasyon yok

---

### 1. Kategori CRUD — Kanıtlar

#### 1a. Kategori Oluşturma (POST /api/admin/categories → 201)

**Network logu kanıtı:**
```
POST http://localhost:5174/api/admin/categories → 201 Created   [#58732.639]
POST http://localhost:5174/api/admin/categories → 201 Created   [#58732.645]
```
Hem UI formu üzerinden hem direkt API çağrısıyla oluşturma çalışıyor. Duplicate key için 409, geçersiz format için 422 döner (backend test suite'inde kanıtlı).

#### 1b. Kategori Düzenleme (PUT /api/admin/categories/{key} → 200)

**Network logu kanıtı:**
```
PUT http://localhost:5174/api/admin/categories/ui_test_cat → 200 OK   [#58732.641]
```
UI'da genişletip "Ton" alanı değiştirip "Kaydet" tıklandı → PUT 200 döndü → liste yenilendi.

#### 1c. Kategori Silme — custom (DELETE /api/admin/categories/{key} → 200)

**Network logu kanıtı:**
```
DELETE http://localhost:5174/api/admin/categories/ui_test_cat → 200 OK   [#58732.643]
DELETE http://localhost:5174/api/admin/categories/del_test → 200 OK     [#58732.712]
```
UI'da "Sil" butonu tıklandı (window.confirm mock ile), DELETE 200 döndü, öğe listeden kayboldu.

**DOM doğrulaması:** `document.body.innerText.includes('del_test')` → `false` (silme sonrası)

#### 1d. Builtin Kategori Silme Koruması

**UI kanıtı:** Builtin `science` kategorisi genişletildi:
- `"silinemez" text: true` — "Yerleşik — silinemez" metni görünüyor
- `Sil buttons: 0` — hiç "Sil" butonu yok

**Backend koruması:** `DELETE /api/admin/categories/science` → 403 Forbidden (test suite'inde kanıtlı)

#### 1e. Pasif Kategori Runtime'da Atlanıyor

**Unit test kanıtı** (`backend/tests/test_category_hook_crud.py`):
```python
def test_disabled_category_excluded_from_prompt():
    # DB'de science enabled=False yapıldı
    # _get_effective_category("science", db=db) → {"enabled": False}
    # build_enhanced_prompt() → science enhancement eklenmedi
```
19 CRUD testi + 81 mevcut test = 100/100 geçiyor.

#### 1f. Yeni Kategori Pipeline'da Kullanılıyor

`config["_db"] = db` runner.py:137'de inject ediliyor. `build_enhanced_prompt()` `_get_effective_category(key, db=config.get("_db"))` çağırıyor. DB'de yeni kategori oluşturulduğunda bir sonraki job o kategoriyi DB'den okur — config reload gerekmez.

---

### 2. Hook CRUD — Kanıtlar

#### 2a. Hook Oluşturma (POST /api/admin/hooks → 201)

**Network logu kanıtı:**
```
POST http://localhost:5174/api/admin/hooks → 422 Unprocessable Content  [#58732.714]  (lang eksikti)
POST http://localhost:5174/api/admin/hooks → 201 Created                [#58732.715]  (düzeltildi)
```
422 validation hatası beklenen davranış. Doğru payload ile 201 döndü.

#### 2b. Hook Düzenleme (PUT /api/admin/hooks/{type}/{lang} → 200)

Backend test suite'inde kanıtlı:
```python
def test_update_hook_ok()  # PUT → 200
def test_update_hook_not_found()  # PUT → 404
```

#### 2c. Hook Silme — custom (DELETE /api/admin/hooks/{type}/{lang} → 200)

**Network logu kanıtı:**
```
DELETE http://localhost:5174/api/admin/hooks/del_hook_test/tr → 200 OK   [#58732.722]
GET http://localhost:5174/api/admin/hooks/tr → 200 OK                    [#58732.723]
```
UI'da Sil tıklandı → DELETE 200 → GET ile liste yenilendi.

**DOM doğrulaması:** `document.body.innerText.includes('del_hook_test')` → `false`

#### 2d. Builtin Hook Silme Koruması

**UI kanıtı:** Builtin `shocking_fact` genişletildi:
- `silinemez text: true` — "Yerleşik — silinemez" görünüyor
- `Sil buttons: 0` — hiç Sil butonu yok

**Backend koruması:** `DELETE /api/admin/hooks/shocking_fact/tr` → 403 (test suite'inde kanıtlı)

#### 2e. Pasif Hook Seçim Havuzundan Çıkıyor

`_get_effective_hooks(language, db=db)` sadece `enabled=True` hook'ları döndürür:
```python
hooks = db.query(Hook).filter(Hook.lang == language, Hook.enabled == True).all()
```
Test: `test_disabled_hook_excluded_from_selection` — pasif hook `select_opening_hook()`'ta seçilemiyor.

---

### 3. UI Doğrulaması — Özet

| Test | Kanıt | Sonuç |
|---|---|---|
| Kategoriler tab'ı yükleniyor | Screenshot + GET /api/admin/categories 200 | ✓ |
| Yeni Kategori formu açılıyor | Snapshot'ta form alanları görünüyor | ✓ |
| Kategori oluşturuluyor | POST 201, listede göründü | ✓ |
| Kategori düzenleniyor | PUT 200, değişiklik kaydedildi | ✓ |
| Custom kategori siliniyor | DELETE 200, DOM'dan kayboldu | ✓ |
| Builtin kategori "silinemez" gösteriyor | DOM'da text var, Sil butonu yok | ✓ |
| Hook'lar tab'ı yükleniyor | Screenshot + GET /api/admin/hooks/tr 200 | ✓ |
| Custom hook oluşturuluyor | POST 201 | ✓ |
| Custom hook siliniyor | DELETE 200, DOM'dan kayboldu | ✓ |
| Builtin hook "silinemez" gösteriyor | DOM'da text var, Sil butonu yok | ✓ |

**Not:** `window.confirm()` dialog'u preview_eval'i bloke ettiği için Sil tıklamaları
`window.confirm = () => true` mock ile test edildi. Bu production davranışını değiştirmez;
sadece otomasyon için onayı simüle eder. DELETE request'in gerçekten gittiği network
logundan kanıtlanmıştır.

---

### 4. Test Suite Durumu

```
backend/tests/test_category_hook_crud.py   19 test  ✓ PASS
backend/tests/ (tüm)                      100 test  ✓ PASS
frontend tsc                               0 error   ✓ PASS
```

---

### 5. Kalan Riskler / Kısıtlamalar

| Risk | Seviye | Açıklama |
|---|---|---|
| Hook edit UI (PUT) tarayıcıda test edilmedi | Düşük | PUT endpoint unit test'te kanıtlı; UI akışı Kaydet butonuyla category ile aynı pattern |
| `window.confirm` gerçek dialog'u preview araçlarında test edilemiyor | Bilgi | Sadece otomasyon kısıtlaması; üretimde kullanıcı confirm dialog'unu görür |
| Hook "Yeni Hook" UI formu (POST from UI) tarayıcıda test edilmedi | Düşük | POST API kanıtlı; form category formuyla aynı pattern |

---

### Sonuç

Kategori ve Hook CRUD sisteminin **tüm kritik yolları** gerçek network loglarıyla veya unit testlerle kanıtlanmıştır:
- Oluştur: POST 201 ✓
- Düzenle: PUT 200 ✓  
- Sil (custom): DELETE 200 + DOM'dan kayboldu ✓
- Builtin koruma: 403 backend + "silinemez" UI ✓
- Pasif runtime atlanma: unit test ✓
- Pipeline wiring: config["_db"] inject + DB-aware functions ✓

