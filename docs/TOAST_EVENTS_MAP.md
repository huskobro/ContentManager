# Toast Olayları Haritası

ContentManager'da hangi olayların toast bildirimi tetiklediğini, tip/başlık/açıklama
formatını ve spam önleme kurallarını belgeler.

**Son Güncelleme:** 2026-03-31

---

## Toast Tipleri

| Tip | Renk | Kullanım |
|---|---|---|
| `success` | Yeşil | İşlem başarıyla tamamlandı |
| `error` | Kırmızı | İşlem başarısız oldu, kullanıcı müdahalesi gerekiyor |
| `warning` | Sarı | Dikkat gerektiren durum, işlem devam etti |
| `info` | Mavi | Bilgi niteliğinde geri bildirim (silme, sıfırlama) |

**Varsayılan süre:** 4000 ms (uiStore addToast default)

---

## Yüzey Bazlı Toast Olayları

### UserSettings

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Manuel kayıt başarılı | `success` | "Ayarlar kaydedildi" | — |
| Manuel kayıt başarısız | `error` | "Kayıt başarısız" | hata mesajı |
| Sıfırlama (reset) | `info` | "Ayarlar sıfırlandı" | "Backend varsayılanları yüklendi." |

**Not:** Auto-save modunda toast yok — `saveState` (saving/saved/error) inline gösterilir.

---

### GlobalSettings

Auto-save modunda toast yok — `SettingRow` içindeki `saveState` göstergesi kullanılır:
- `saving`: Loader spinner
- `saved`: CheckCircle2 (2 sn sonra idle)
- `error`: AlertCircle (3 sn sonra idle)

Manuel save (multiselect/array alanlar) için SettingRow parent üzerinden toast tetiklenir.

---

### ModuleManager — AdminSettingRow

Auto-save modunda toast yok — `saveState` göstergesi kullanılır.
Manuel save (multiselect) sonrası parent `addToast` çağırır.

---

### ModuleManager — NewsSource CRUD

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Kaynak oluşturuldu | `success` | "Kaynak oluşturuldu." | — |
| Kaynak güncellendi | `success` | "Kaynak güncellendi." | — |
| Kaynak silindi | `info` | "Kaynak silindi." | — |
| Validation hatası (alan eksik) | `error` | "Ad ve URL zorunludur." | — |
| Validation hatası (URL format) | `error` | "URL http:// veya https:// ile başlamalı." | — |
| API hatası | `error` | "Kayıt başarısız." | `res.json().detail` veya HTTP status |

---

### ModuleManager — CategoryStyleMapping CRUD

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Eşleşme oluşturuldu | `success` | "Eşleşme oluşturuldu." | — |
| Eşleşme güncellendi | `success` | "Eşleşme güncellendi." | — |
| Eşleşme silindi | `info` | "Eşleşme silindi." | — |
| Validation hatası | `error` | "Kategori anahtarı boş olamaz." | — |
| API hatası | `error` | "Kayıt başarısız." | `res.json().detail` veya HTTP status |

---

### PromptManager — Modül Promptları

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Prompt güncellendi | `success` | "Prompt güncellendi" | `def.label` |
| Prompt oluşturuldu | `success` | "Prompt kaydedildi" | `def.label` |
| Prompt sıfırlandı (boş bırakıldı) | `info` | "Prompt sıfırlandı" | `${def.label} — sistem varsayılanı kullanılacak.` |
| Güncelleme başarısız | `error` | "Güncellenemedi" | `def.label` |
| Oluşturma başarısız | `error` | "Kaydedilemedi" | `def.label` |
| Silme başarısız | `error` | "Silinemedi" | `def.label` |

---

### PromptManager — Kategoriler

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Kategori güncellendi | `success` | "Kategori güncellendi" | `cat.name_tr` |
| Kategori oluşturuldu | `success` | "Kategori oluşturuldu" | `newCategory.name_tr` |
| Kategori silindi | `info` | "Kategori silindi" | `cat.name_tr` |
| Eksik alan (create) | `error` | "Eksik alan" | "key, Türkçe ad ve İngilizce ad zorunludur." |
| Güncelleme başarısız | `error` | "Güncellenemedi" | `err.detail` veya `cat.name_tr` |
| Oluşturma başarısız | `error` | "Oluşturulamadı" | `err.detail` veya "Hata oluştu" |
| Silme başarısız | `error` | "Silinemedi" | `err.detail` veya `cat.name_tr` |
| Bağlantı hatası | `error` | "Bağlantı hatası" | `cat.name_tr` |

**Not:** `enabled` toggle — anında kayıt yapar, toast "Kategori güncellendi" çıkar.

---

### PromptManager — Açılış Hook'ları

| Olay | Tip | Başlık | Açıklama |
|---|---|---|---|
| Hook güncellendi | `success` | "Hook güncellendi" | `hook.name` |
| Hook oluşturuldu | `success` | "Hook oluşturuldu" | `newHook.name` |
| Hook silindi | `info` | "Hook silindi" | `hook.name` |
| Eksik alan (create) | `error` | "Eksik alan" | "type, ad ve şablon zorunludur." |
| Güncelleme başarısız | `error` | "Güncellenemedi" | `err.detail` veya `hook.name` |
| Oluşturma başarısız | `error` | "Oluşturulamadı" | `err.detail` veya "Hata oluştu" |
| Silme başarısız | `error` | "Silinemedi" | `err.detail` veya `hook.name` |
| Bağlantı hatası | `error` | "Bağlantı hatası" | `hook.name` |

**Not:** `enabled` toggle — anında kayıt yapar, toast "Hook güncellendi" çıkar.

---

## Spam Önleme Kuralları

1. **Auto-save yüzeylerinde toast yok** — `saveState` inline gösterilir (Loader/CheckCircle/AlertCircle).
   Toast sadece manuel save butonlu yüzeylerde ve CRUD işlemlerinde çıkar.

2. **Her işlem için en fazla 1 toast** — birden fazla alan değişse de tek bir kayıt işlemi = tek toast.

3. **CRUD toggle'ları** — `enabled` toggle her tıklamada 1 toast çıkarır.
   Hızlı arka arkaya tıklama durumunda her toggle kendi toast'ını alır (4s auto-dismiss).

4. **Bağlantı hatası** — `catch` bloğu her zaman `"Bağlantı hatası"` toast'ı çıkarır, tekrarlama yok.

5. **Validation hataları** — submit öncesi kontrol edilir, toast çıkar ve fetch yapılmaz.

---

## uiStore Toast API

```typescript
addToast({
  type: "success" | "error" | "warning" | "info",
  title: string,
  description?: string,
  duration?: number,  // ms, default 4000
})
```

Toast'lar FIFO kuyruğunda birikir. Her birinin `id`'si vardır ve `duration` ms sonra
otomatik kaldırılır. Manuel kapatma butonu her toast'ta bulunur.
