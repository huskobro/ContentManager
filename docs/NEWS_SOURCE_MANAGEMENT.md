# Haber Kaynağı Yönetim Sistemi

## Genel Bakış

Haber Bülteni modülü, video senaryosu oluştururken gerçek haber kaynaklarından içerik çeker.
Bu sistem; admin panelden yönetilen bir RSS/URL kaynak veritabanını, iş başlatma sırasında
sağlanan URL listesini ve haber kategorisi bilgisini entegre ederek çalışır.

---

## Mimari Özet

```
Admin Panel
  ↓  (CRUD: /api/admin/news-sources)
news_sources tablosu (SQLite)
  ↓  (pipeline fallback)
step_script_bulletin()
  ↓  (HTTP GET her URL'e)
LLM Prompt (haber içeriği + topic)
  ↓
Script JSON (scene[], source_urls[])
  ↓
TTS + Visuals + Subtitles + Composition
```

---

## Kaynak Öncelik Zinciri

`news_bulletin/pipeline.py` şu sırayla URL kaynağı arar:

```
1. config._news_urls  (iş başlatılırken kullanıcının sağladığı URL listesi)
       ↓ (boşsa)
2. config.news_sources  (admin ayarı üzerinden gelen URL listesi)
       ↓ (boşsa)
3. DB'deki aktif kaynaklar  (news_sources tablosu, sort_order ASC)
       ↓ (hiçbiri yoksa)
4. Sadece başlık ile senaryo üretilir (kaynak URL'siz)
```

---

## Veritabanı Modeli

**Tablo:** `news_sources`

| Kolon         | Tip          | Açıklama                                              |
|---------------|--------------|-------------------------------------------------------|
| `id`          | INTEGER PK   | Otomatik artan birincil anahtar                       |
| `name`        | VARCHAR(128) | Kaynak görünen adı (ör. "TRT Haber")                  |
| `url`         | VARCHAR(1024)| RSS feed veya haber sitesi URL'si (benzersiz)         |
| `category_key`| VARCHAR(64)  | Soft FK → CategoryStyleMapping (opsiyonel)            |
| `lang`        | VARCHAR(8)   | Dil kodu: tr, en, de, fr, es, ar (varsayılan: "tr")   |
| `enabled`     | BOOLEAN      | Pasif kaynaklar pipeline'a dahil edilmez              |
| `sort_order`  | INTEGER      | Öncelik sırası — düşük sayı = yüksek öncelik          |
| `created_at`  | VARCHAR(32)  | ISO8601 UTC zaman damgası                             |
| `updated_at`  | VARCHAR(32)  | Son güncelleme zaman damgası                          |

**Kısıtlar:**
- `url` benzersiz (UNIQUE constraint)
- `url` http:// veya https:// ile başlamalı (API tarafında doğrulanır)
- `category_key` opsiyonel; CategoryStyleMapping tablosuyla soft FK (JOIN yapılmaz)

---

## Kategori ile Stil Zinciri Entegrasyonu

Her kaynak bir `category_key` taşıyabilir. Bu alan;
sahne bazlı `category_style_mapping_enabled` sistemi ile şu şekilde etkileşir:

1. **Birincil:** Sahne `category` alanı dominant kategori hesabına girer.
2. **Yedek (gelecek geliştirme):** Tüm sahnelerin category değeri boşsa, kaynak `category_key`
   dominant kategori olarak kullanılabilir.

> **Not:** Bu yedek mantık şu anda composition.py'de uygulanmamaktadır.
> Dominant kategori belirleme yalnızca sahne category alanlarına dayanır.
> Kaynak category_key'i stil zincirinde gösterim amaçlıdır ve admin'in
> kaynakları organize etmesine yardımcı olur.

---

## URL İçerik Çekme

`news_bulletin/pipeline.py` → `_fetch_url_content()`:

- `httpx.AsyncClient` ile async HTTP GET
- Timeout: 15 saniye
- User-Agent: `ContentManager/0.7.0 NewsBulletin`
- HTML içerikten script/style kaldırılır, tag'ler temizlenir
- RSS/XML ham metin olarak kullanılır
- Karakter limiti: varsayılan 2000 karakter (ayarlanabilir: `_MAX_CONTENT_PER_URL`)
- Başarısız URL'ler atlanır (log uyarısı), kritik hata üretmez

**Ayarlanabilir config parametreleri:**

| Parametre              | Varsayılan | Açıklama                           |
|------------------------|------------|------------------------------------|
| `news_max_articles`    | 5          | Çekilecek maksimum URL sayısı       |
| `news_summary_max_chars`| 500       | URL başına maksimum karakter sayısı |

---

## Admin API

**Base URL:** `/api/admin/`
**Auth:** `X-Admin-Pin: <pin>` header gereklidir.

### Listeleme
```
GET /api/admin/news-sources
→ 200: [{ id, name, url, category_key, lang, enabled, sort_order, created_at, updated_at }, ...]
Sıralama: sort_order ASC, id ASC
```

### Oluşturma
```
POST /api/admin/news-sources
Body: {
  name: string,          // zorunlu
  url: string,           // zorunlu, benzersiz, http(s)://
  category_key?: string, // opsiyonel
  lang?: string,         // varsayılan: "tr"
  enabled?: boolean,     // varsayılan: true
  sort_order?: number    // varsayılan: 0
}
→ 201: { id, ... }
→ 409: URL zaten kayıtlı
→ 422: Geçersiz URL formatı
```

### Güncelleme
```
PUT /api/admin/news-sources/{id}
Body: { name?, url?, category_key?, lang?, enabled?, sort_order? }
→ 200: güncel kayıt
→ 404: kayıt bulunamadı
→ 409: URL çakışması
```

### Silme
```
DELETE /api/admin/news-sources/{id}
→ 200: { deleted: true }
→ 404: kayıt bulunamadı
```

---

## İş Oluşturma — Kullanıcı URL Girişi

Kullanıcı iş oluştururken Haber Bülteni modülünü seçtiğinde, şu iki alanı girebilir:

- **Haber Kaynağı URL'leri** (opsiyonel): Virgülle ayrılmış URL listesi.
  Bu alan doldurulursa DB kaynakları atlanır.
- **Ağ/Kanal Adı** (`bulletin_network_name`): Kompozisyonda alt köşe logosunda gösterilir.

**Payload yolu:**
```
POST /api/jobs
Body: {
  module: "news_bulletin",
  title: "...",
  settings_overrides: {
    _news_urls: ["https://...", "https://..."],  // kullanıcı girdisi
    bulletin_network_name: "TRT Haber",
    ...
  }
}
```

---

## Admin UI

**Yol:** `/admin/news-sources`
**Bileşen:** `frontend/src/pages/admin/NewsSourceManager.tsx`

Özellikler:
- Tüm kaynakları sort_order sırasıyla listele
- Yeni kaynak ekleme formu (inline)
- Ad, URL, kategori, dil, sıralama alanları
- Satır içi düzenleme (edit genişlemesi)
- Etkin/pasif toggle (tek tıkla)
- Silme (onay adımıyla)
- Pipeline entegrasyonu hakkında bilgi kutusu

---

## Kullanım Senaryoları

### Senaryo 1: Sabah haber bülteni otomasyonu

Admin şu kaynakları ekler:
```
sort_order=0: TRT Haber Ana Sayfası (tr, kategori: gundem)
sort_order=1: BBC Türkçe RSS (tr, kategori: dunya)
sort_order=2: Sabah Ekonomi (tr, kategori: ekonomi)
```

Kullanıcı iş oluştururken URL girmez. Pipeline:
1. DB'den 3 aktif kaynağı alır (sort_order'a göre)
2. Her URL'den maksimum 500 karakter içerik çeker
3. LLM'e topic + çekilen içerikler gönderilir
4. "Gündem" dominant kategori → `corporate` stil uygulanır

### Senaryo 2: Kullanıcı kendi kaynağını giriyor

Kullanıcı CreateVideo formunda:
```
Haber URL'leri: https://www.milliyet.com.tr/rss/rssnew/sondakikahaber.xml
```

Pipeline: DB'yi atlar, yalnızca kullanıcının URL'sini kullanır.

### Senaryo 3: Kaynak yok, sadece başlık

Ne DB kaynağı var ne kullanıcı URL girmiş.
Pipeline: "Kaynak sağlanmadı, genel bilgilerle bülten oluştur" mesajıyla LLM çağırır.

---

## İlgili Dosyalar

| Dosya | Rol |
|-------|-----|
| `backend/models/news_source.py` | ORM modeli |
| `backend/modules/news_bulletin/pipeline.py` | DB fallback + URL çekme |
| `backend/api/admin.py` | CRUD endpoint'leri |
| `backend/database.py` | Tablo oluşturma (model import) |
| `frontend/src/pages/admin/NewsSourceManager.tsx` | Admin UI |
| `frontend/src/pages/user/CreateVideo.tsx` | Kullanıcı URL giriş alanı |
| `frontend/src/App.tsx` | `/admin/news-sources` route |
| `frontend/src/components/layout/Sidebar.tsx` | "Haber Kaynakları" nav linki |
| `docs/NEWS_STYLE_MAPPING.md` | Kategori→Stil entegrasyonu |
