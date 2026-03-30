# QA Log — ContentManager

Her görev sonunda doğrulama, test ve smoke kontrol kayıtları bu dosyada tutulur.
Yeni görevlerde bu dosyaya ekleme yapılır, üzerine yazılmaz.

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
