# Kategori → BulletinStyle Eşleşme Sistemi

## Genel Bakış

Haber Bülteni modülü, video kompozisyonunda otomatik görsel stil (BulletinStyle) belirleyebilir.
Bu sistem; LLM'in ürettiği sahne kategorileri ile admin panelinden yönetilen bir eşleşme tablosunu
kullanarak, her bülten için en uygun görsel temanın otomatik seçilmesini sağlar.

---

## BulletinStyle Enum Değerleri

| Değer           | Açıklama                   | Renk Teması                 |
|-----------------|----------------------------|-----------------------------|
| `breaking`      | Son Dakika / Acil          | Kırmızı, dinamik ticker     |
| `tech`          | Teknoloji                  | Mavi, modern, minimal       |
| `corporate`     | Kurumsal / Genel           | Gri-lacivert, resmi         |
| `sport`         | Spor                       | Turuncu-sarı, enerjik       |
| `finance`       | Finans / Ekonomi           | Yeşil, grafik odaklı        |
| `weather`       | Hava Durumu                | Açık mavi, pastel           |
| `science`       | Bilim / Sağlık             | Mor-lacivert, akademik      |
| `entertainment` | Eğlence / Kültür / Sanat   | Pembe-mor, renkli           |
| `dark`          | Koyu Tema (genel amaçlı)   | Siyah/koyu gri, beyaz metin |

Geçerli değerler `backend/models/category_style_mapping.py` dosyasındaki
`VALID_BULLETIN_STYLES` frozenset ile tanımlanır.
Remotion bileşeni (`remotion/src/types.ts`) ile senkron tutulmalıdır.

---

## Öncelik Zinciri

```
1. Kullanıcı override (settings_overrides.bulletin_style)
       ↓ (yoksa)
2. CategoryStyleMapping tablosu  ← bu sistem
       ↓ (eşleşme yoksa veya sistem kapalıysa)
3. Global default bulletin_style (admin ayarı, varsayılan: "corporate")
```

Uygulama yeri: `backend/pipeline/steps/composition.py` → `_resolve_bulletin_style_for_category()`

---

## Dominant Kategori Belirleme

Pipeline adımı şu mantığı uygular:

1. Script çıktısındaki tüm sahnelerin `category` alanı toplanır.
2. Her kategori kaç sahnede geçtiği sayılır.
3. En çok geçen kategori "dominant kategori" olarak seçilir.
4. Dominant kategori ile `category_style_mappings` tablosunda arama yapılır.
5. Eşleşen ve `enabled=True` olan kayıt bulunursa `bulletin_style` o değere ayarlanır.

Örnek:
```
scenes:
  1 → category: "Ekonomi"
  2 → category: "Siyaset"
  3 → category: "Ekonomi"
  4 → category: "Ekonomi"
  5 → category: "Teknoloji"

dominant_category = "Ekonomi"  (3/5 sahne)
CategoryStyleMapping["ekonomi"].bulletin_style = "finance"
→ bulletinStyle = "finance"
```

---

## Veritabanı Modeli

**Tablo:** `category_style_mappings`

| Kolon           | Tip          | Açıklama                                       |
|-----------------|--------------|------------------------------------------------|
| `id`            | INTEGER PK   | Otomatik artan birincil anahtar                |
| `category_key`  | VARCHAR(64)  | Kategori anahtarı (lowercase, unique)          |
| `bulletin_style`| VARCHAR(32)  | Hedef BulletinStyle değeri                     |
| `description`   | VARCHAR(256) | Admin için açıklama notu (opsiyonel)           |
| `enabled`       | BOOLEAN      | Pasif kayıtlar pipeline'a dahil edilmez        |
| `created_at`    | VARCHAR(32)  | ISO8601 UTC zaman damgası                      |
| `updated_at`    | VARCHAR(32)  | Son güncelleme zaman damgası                   |

**Kısıtlar:**
- `category_key` benzersiz (UNIQUE constraint)
- `bulletin_style` geçerli enum değerlerinden biri olmalı (API tarafında doğrulanır)
- Karşılaştırma `category_key.strip().lower()` normalize edilmiş değerle yapılır

---

## Varsayılan Tohumlar

Sistem ilk başlatıldığında `backend/main.py` içindeki `_seed_category_style_mappings()`
fonksiyonu aşağıdaki eşleşmeleri otomatik oluşturur (zaten varsa atlar):

| Kategori Anahtarı | BulletinStyle    |
|-------------------|------------------|
| spor              | sport            |
| teknoloji         | tech             |
| ekonomi           | finance          |
| siyaset           | corporate        |
| son_dakika        | breaking         |
| bilim             | science          |
| eglence           | entertainment    |
| saglik            | science          |
| dunya             | corporate        |
| gundem            | corporate        |
| sport             | sport            |
| tech              | tech             |
| finance           | finance          |
| politics          | corporate        |
| breaking          | breaking         |
| science           | science          |
| entertainment     | entertainment    |
| health            | science          |
| world             | corporate        |

---

## Admin API

**Base URL:** `/api/admin/`
**Auth:** `X-Admin-Pin: <pin>` header gereklidir.

### Listeleme
```
GET /api/admin/category-style-mappings
→ 200: [{ id, category_key, bulletin_style, description, enabled, created_at, updated_at }, ...]
```

### Oluşturma
```
POST /api/admin/category-style-mappings
Body: { category_key, bulletin_style, description?, enabled? }
→ 201: { id, ... }
→ 409: category_key zaten var
→ 400: geçersiz bulletin_style değeri
```

### Güncelleme
```
PUT /api/admin/category-style-mappings/{id}
Body: { category_key?, bulletin_style?, description?, enabled? }
→ 200: güncel kayıt
→ 404: kayıt bulunamadı
→ 409: category_key çakışması
```

### Silme
```
DELETE /api/admin/category-style-mappings/{id}
→ 200: { deleted: true }
→ 404: kayıt bulunamadı
```

---

## Global Toggle

Tüm eşleşme sistemi tek bir ayarla devre dışı bırakılabilir:

**Ayar adı:** `category_style_mapping_enabled`
**Varsayılan:** `true`
**Kapsam:** `admin`

```
PUT /api/admin/settings
Body: { key: "category_style_mapping_enabled", value: false, scope: "admin" }
```

Bu ayar `false` olduğunda, dominant kategori bulunsa bile stil eşleşmesi yapılmaz;
global default `bulletin_style` değeri kullanılır.

---

## Admin UI

**Yol:** `/admin/category-style-mappings`
**Bileşen:** `frontend/src/pages/admin/CategoryStyleMappingManager.tsx`

Özellikler:
- Tüm eşleşmeleri alfabetik sırayla listele
- Yeni eşleşme ekleme formu (inline / modal-benzeri)
- Satır içi düzenleme (edit genişlemesi)
- Etkin/pasif toggle (tek tıkla)
- Silme (onay adımıyla)
- Global toggle kartı (sayfanın üstünde)
- Öncelik zinciri açıklaması (bilgi kutusu)

---

## Entegrasyon Notları

### Pipeline'a `_db` enjeksiyonu

`composition.py`'deki `_resolve_bulletin_style_for_category()` fonksiyonu DB erişimi için
`config.get("_db")` kullanır. `_db`, pipeline runner tarafından config'e enjekte edilir.
DB erişimi başarısız olursa veya `_db` yoksa sessizce global default'a düşer.

### LLM Kategori Üretimi

`news_bulletin/pipeline.py`'deki sistem talimatı, LLM'den her sahne için `category` alanı
üretmesini ister. Örnek değerler: "Ekonomi", "Siyaset", "Teknoloji", "Spor", "Sağlık", "Dünya".

Eşleşme karşılaştırması `strip().lower()` uygulandıktan sonra yapıldığından,
"Ekonomi" → "ekonomi" dönüşümü otomatik gerçekleşir.

### Hata Yönetimi

- DB sorgusunda istisna oluşursa: global default'a düşer, iş durdurmaz
- `VALID_BULLETIN_STYLES` dışında değer: API 400 döner
- `category_style_mapping_enabled = False`: tablo atlanır, hata yok
- Eşleşme bulunamazsa: global default `bulletin_style` config değeri kullanılır

---

## İlgili Dosyalar

| Dosya | Rol |
|-------|-----|
| `backend/models/category_style_mapping.py` | ORM modeli + VALID_BULLETIN_STYLES |
| `backend/pipeline/steps/composition.py` | `_resolve_bulletin_style_for_category()` |
| `backend/api/admin.py` | CRUD endpoint'leri |
| `backend/main.py` | `_seed_category_style_mappings()` |
| `frontend/src/pages/admin/CategoryStyleMappingManager.tsx` | Admin UI |
| `frontend/src/App.tsx` | `/admin/category-style-mappings` route |
| `frontend/src/components/layout/Sidebar.tsx` | "Kategori→Stil" nav linki |
