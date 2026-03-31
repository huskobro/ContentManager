# Auto-Save Davranış Rehberi

ContentManager, tüm ayar yüzeylerinde tutarlı bir otomatik kayıt sistemi kullanır.
Bu doküman sistemin nasıl çalıştığını, alan türüne göre tetikleme stratejisini ve
aç/kapat kontrolünü açıklar.

---

## Genel Bakış

Auto-save sistemi `useAutoSave` hook'u üzerine inşa edilmiştir. Her ayar alanı,
kendi türüne göre farklı bir kayıt stratejisi kullanır:

| Alan Türü | Tetikleme | Gecikme |
|---|---|---|
| Toggle (switch, checkbox) | Değer değişir değişmez | Anında |
| Select (dropdown) | Seçim değişir değişmez | Anında |
| Radio | Seçim değişir değişmez | Anında |
| Text / Textarea | Yazarken debounce + odak kaybedince flush | 800 ms |
| Number / Password / Path | Yazarken debounce + odak kaybedince flush | 800 ms |
| Multiselect / Array | Manuel "Kaydet" butonu | — |

---

## `useAutoSave` Hook API

```typescript
import { useAutoSave } from "@/hooks/useAutoSave";

const {
  shouldAutoSave,    // uiStore.autoSaveEnabled — auto-save aktif mi?
  saveState,         // "idle" | "saving" | "saved" | "error"
  triggerSave,       // (fn: () => Promise<void>) => Promise<void>
  onChangeTrigger,   // text/number için: onChange'de 800ms debounce başlat
  onBlurTrigger,     // text/number için: onBlur'da bekleyen save'i hemen flush et
  cancelDebounce,    // input unmount'ta çağır
} = useAutoSave();
```

### `triggerSave(fn)`
Verilen async fonksiyonu çalıştırır, `saveState`'i yönetir:
- `"saving"` → fn çalışır → başarılıysa `"saved"` (2 sn sonra `"idle"`)
- Hata varsa `"error"` (3 sn sonra `"idle"`)

### `onChangeTrigger(fn)`
Toggle/select değil, metin bazlı alanlar için:
- Her onChange'de `pendingFn` güncellenir, 800 ms debounce başlar
- `autoSaveEnabled` false ise hiçbir şey yapmaz

### `onBlurTrigger(fn)`
- Odak kaybolunca debounce iptal edilir, fn hemen çalışır
- `autoSaveEnabled` false ise hiçbir şey yapmaz

---

## Kullanım Örnekleri

### Toggle alanı
```typescript
const { triggerSave, shouldAutoSave } = useAutoSave();

<input
  type="checkbox"
  checked={value}
  onChange={(e) => {
    const next = e.target.checked;
    setValue(next);
    if (shouldAutoSave) triggerSave(() => api.save(key, next));
  }}
/>
```

### Select alanı
```typescript
<select
  value={value}
  onChange={(e) => {
    const next = e.target.value;
    setValue(next);
    if (shouldAutoSave) triggerSave(() => api.save(key, next));
  }}
/>
```

### Text/Number alanı
```typescript
const { onChangeTrigger, onBlurTrigger, cancelDebounce, shouldAutoSave } = useAutoSave();

useEffect(() => cancelDebounce, []); // unmount temizliği

<input
  type="text"
  value={localValue}
  onChange={(e) => {
    setLocalValue(e.target.value);
    onChangeTrigger(() => api.save(key, e.target.value));
  }}
  onBlur={() => onBlurTrigger(() => api.save(key, localValue))}
  onKeyDown={(e) => {
    if (e.key === "Enter") onBlurTrigger(() => api.save(key, localValue));
  }}
/>
```

---

## Aç/Kapat Kontrolü

Auto-save `uiStore.autoSaveEnabled` ile kontrol edilir.

- **Varsayılan:** `true`
- **Persist:** Tarayıcı localStorage'a yazılır (`cm-ui` key altında)
- **Toggle UI:** GlobalSettings ve UserSettings sayfa başlıklarında "Otomatik kayıt" butonu

```typescript
const autoSaveEnabled = useUIStore((s) => s.autoSaveEnabled);
const setAutoSaveEnabled = useUIStore((s) => s.setAutoSaveEnabled);
```

Auto-save **kapalıyken**:
- `shouldAutoSave` = `false` döner
- `onChangeTrigger` / `onBlurTrigger` hiçbir şey yapmaz
- Bileşen `dirty` durumu + manuel "Kaydet" butonu göstermeli

---

## Kapsam — Hangi Yüzeyler Auto-Save Kullanıyor

| Yüzey | Auto-Save | Toggle | Text/Number | Notlar |
|---|---|---|---|---|
| `ModuleManager` → `AdminSettingRow` | ✅ `useAutoSave` | Anında | 800ms debounce + blur | `autoSaveEnabled` tarafından kontrol edilir |
| `GlobalSettings` → `SettingRow` | ✅ `useAutoSave` | Anında | 800ms debounce + blur | multiselect = her zaman manuel |
| `UserSettings` | ✅ `useAutoSave` | Anında | 800ms debounce + blur | `autoSaveEnabled` tarafından kontrol edilir |
| `PromptManager` → Prompt textarea | ❌ Manuel | — | Manuel Kaydet butonu | Kasıtlı: büyük textarea, kısmi değişiklik riski |
| `PromptManager` → Kategori toggle | ✅ Anında | **Anında** | — | `autoSaveEnabled`'dan bağımsız, her zaman anında |
| `PromptManager` → Hook toggle | ✅ Anında | **Anında** | — | `autoSaveEnabled`'dan bağımsız, her zaman anında |
| `PromptManager` → Kategori/Hook metin | ❌ Manuel | — | Manuel Kaydet butonu | Kasıtlı: entity edit formu |
| `ModuleManager` → NewsSource/Mapping CRUD | ✅ (toggle only) | Anında | Manuel Kaydet | Form submit = manuel; toggle = anında |

**`autoSaveEnabled` toggle'ının etkilediği yüzeyler:**
- `GlobalSettings` → `SettingRow`
- `ModuleManager` → `AdminSettingRow`
- `UserSettings`

**`autoSaveEnabled`'dan bağımsız (her zaman anında):**
- `PromptManager` Kategori/Hook `enabled` toggle'ları
- `ModuleManager` NewsSource/Mapping `enabled` toggle'ları

---

## `saveState` Görsel Gösterimi

Bileşenler `saveState` değerine göre durum göstergesi çizebilir:

```typescript
const { saveState } = useAutoSave();
const saving = saveState === "saving";
const saved  = saveState === "saved";
const hasErr = saveState === "error";

{saving && <Loader2 size={12} className="animate-spin" />}
{saved  && <CheckCircle2 size={12} className="text-emerald-400" />}
{hasErr && <AlertCircle size={12} className="text-red-400" />}
```

---

## Mimari Notlar

- **Debounce süresi:** 800 ms (sabit, `DEBOUNCE_MS` sabiti ile `useAutoSave.ts`'de)
- **Blur flush:** `onBlurTrigger` pending debounce'u iptal edip hemen çalıştırır — kullanıcı Tab veya Enter ile geçişte kayıp olmaz
- **Enter key:** Text/number alanlarda `onKeyDown` → `Enter` → `onBlurTrigger` çağrımı önerilir
- **Unmount:** Bileşen DOM'dan kaldırılmadan önce `cancelDebounce()` çağrılmalı (useEffect cleanup)
- **Race condition yok:** `triggerSave` her çağrıda önceki debounce'u iptal eder
