# Haber Bülteni — Veri Akışı

> Versiyon: 0.7.0 · Tarih: 2026-03-31

Bu dokuman, News Bulletin modülündeki her görsel bileşenin veri kaynağını, pipeline boyunca nasıl aktığını ve boş/eksik veri durumunda ne olduğunu açıklar.

---

## Pipeline Genel Bakış

```
config (_news_urls, _job_title, bulletin_*)
  └─► step_script_bulletin  (LLM → scenes[])
        └─► step_tts          (ses dosyaları)
              └─► step_visuals  (görsel dosyaları)
                    └─► step_subtitles (Whisper → entries[])
                          └─► step_composition_remotion
                                └─► _build_news_bulletin_props()
                                      └─► NewsBulletin.tsx
```

---

## Bileşen Bazlı Veri Zinciri

### 1. Haber Başlığı (`headline`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| LLM çıktısı | `scene.visual_keyword` | `_BULLETIN_SYSTEM_INSTRUCTION` → `"visual_keyword"` alanı |
| Props builder | `item.headline` | `scene.get("visual_keyword", f"Haber {n}")` |
| Remotion | `NewsBulletin.tsx` `items[n].headline` | Lower-third'de büyük font olarak gösterilir |

**Fallback:** LLM `visual_keyword` üretmezse `"Haber {n}"` gösterilir.
**Boş veri davranışı:** Lower-third görünür ama içerik boş kalır.

---

### 2. Haber Kaynağı (`source`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| LLM çıktısı | `scene.news_source` | `_BULLETIN_SYSTEM_INSTRUCTION` → `"news_source"` alanı |
| Props builder | `item.source` | `scene.get("news_source", scene.get("source", ""))` ← **Fix: 2026-03-31** |
| Remotion | `NewsBulletin.tsx` `items[n].source` | Lower-third'de küçük font, `source` boşsa gizlenir |

**Önceki Bug (düzeltildi):** `scene.get("source", "")` kullanılıyordu. LLM `"news_source"` anahtarı ürettiğinden bu alan daima boştu.
**Fix:** `scene.get("news_source", scene.get("source", ""))` — `news_source` öncelikli, `source` fallback.
**Boş veri davranışı:** `source === ""` ise alt kaynak etiketi gizlenir (normal davranış).

---

### 3. Kategori Rozeti (`category`)

| Aşama | Alan | Kaynak |
|-------|------|--------|
| LLM çıktısı | `scene.category` | `_BULLETIN_SYSTEM_INSTRUCTION` → `"category"` alanı ← **Eklendi: 2026-03-31** |
| Props builder | `item.category` | `scene.get("category", "")` |
| Remotion | `NewsBulletin.tsx` `items[n].category` | Lower-third'de küçük badge, boşsa gizlenir |

**Önceki Durum:** LLM şemasında `category` alanı yoktu → daima boştu.
**Fix:** Sistem talimatına `"category": "Ekonomi"` örneği + açıklama eklendi. LLM artık kategori üretir.
**Geçerli kategoriler:** Ekonomi, Siyaset, Teknoloji, Spor, Sağlık, Kültür, Dünya, Gündem
**Boş veri davranışı:** `category === ""` ise badge gizlenir.

---

### 4. Ticker Bar

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Config | `bulletin_ticker_enabled` | `DEFAULT_CONFIG["bulletin_ticker_enabled"] = True` |
| Props builder | `ticker_items` | `items[].headline` değerlerinden otomatik oluşturulur |
| Remotion | `NewsTicker.tsx` `items[]` | Alt banttan sola doğru kayan metin |

**Veri kaynağı:** Ticker içeriği LLM'den ayrı gelmez; `_build_news_bulletin_props()` içinde `items[]` başlıklarından otomatik üretilir.
**Boş veri davranışı:** `ticker === null` ise `NewsTicker` render edilmez.
**Devre dışı bırakma:** `bulletin_ticker_enabled: false` ile kapatılır.

---

### 5. Breaking News Overlay

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Config | `bulletin_breaking_enabled` | `DEFAULT_CONFIG["bulletin_breaking_enabled"] = False` |
| Config | `bulletin_breaking_text` | Admin/user tarafından girilir, LLM üretmez |
| Remotion | `BreakingNewsOverlay.tsx` | `breakingText` prop varsa render edilir |

**Veri kaynağı:** Tamamen config-driven. LLM breaking overlay içeriği üretmez.
**Boş veri davranışı:** `breakingText` prop geçilmezse component render edilmez.
**Varsayılan:** Kapalı (`False`). Admin panelden aktive edilip metin girilmesi gerekir.

---

### 6. Altyazı

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Whisper | `subtitle_entries` | Ses dosyalarından kelime-bazlı zamanlama |
| Props builder | `subtitle_chunks` | `_build_subtitle_chunks()` → sahne başlangıç zamanlarına göre bölünür |
| Remotion | `Subtitles.tsx` | Zamanlama eşleşirse ekranda gösterilir |

**Boş veri davranışı:** `subtitles: []` ise altyazı görünmez. Ses dosyası yoksa veya Whisper başarısız olursa boş kalır.

---

### 7. Network Name

| Aşama | Alan | Kaynak |
|-------|------|--------|
| Config | `bulletin_network_name` | Admin/user girişi |
| Props builder | `networkName` | `config.get("bulletin_network_name", "")` |
| Remotion | `NewsBulletin.tsx` sol üst köşe | Boşsa gösterilmez |

---

### 8. Tarih Damgası

| Kaynak | Değer |
|--------|-------|
| Props builder çalışma zamanı | `datetime.now().strftime("%Y-%m-%d")` |

---

## Eksik / Tasarım Gereği Boş Alanlar

| Alan | Durum | Açıklama |
|------|-------|----------|
| `category` | ✅ Artık LLM üretiyor | Prompt şemasına eklendi (2026-03-31) |
| `source` | ✅ Düzeltildi | `news_source` key mapping fix (2026-03-31) |
| `breakingText` | 🔧 Config-driven | LLM üretmez, admin aktif etmeli |
| `ticker` | ✅ Otomatik | Başlıklardan otomatik oluşturulur |

---

## Fallback Davranış Özeti

```
headline   → "Haber N"       (LLM üretmezse)
source     → ""              (gizlenir)
category   → ""              (badge gizlenir)
ticker     → null            (NewsTicker render edilmez)
breakingOverlay → görünmez   (breakingText yoksa)
subtitles  → []              (Whisper başarısız olursa)
```

---

## Haber Kaynağı (NewsSource) Gerçek Kullanımı

> Doğrulama tarihi: 2026-03-31 — kaynak: `backend/modules/news_bulletin/pipeline.py`

### NewsSource Sadece CRUD mu?

**Hayır.** `NewsSource` tablosu aktif olarak pipeline'da kullanılır.

### Akış

```
step_script_bulletin()
  1. config["_news_urls"] var mı?
     ├── Evet → bu URL'leri kullan
     └── Hayır → DB'den NewsSource sorgula:
           db.query(NewsSource).filter(NewsSource.enabled == True).all()
           → her kaynağın url'ini listeye ekle

  2. Her URL için:
     httpx.AsyncClient (timeout=15s) → GET isteği
     BeautifulSoup → HTML tag'lerini sıyır
     → düz metin içerik

  3. Tüm içerik + job_title + konfigürasyon parametreleri
     → LLM'e prompt olarak gönderilir
     → scenes[] döner
```

### Önemli Detaylar

| Parametre | Değer |
|---|---|
| HTTP timeout | 15 saniye (hard limit) |
| HTML stripping | `BeautifulSoup` ile tüm tag'ler kaldırılır |
| Hata yönetimi | URL fetch başarısız olursa o URL atlanır, diğerleri denenir |
| Fallback | Hiçbir URL fetch edilemezse LLM sadece `job_title` ile çalışır (boş içerik) |
| Filtre | `NewsSource.enabled == True` — pasif kaynaklar kullanılmaz |

### config["_news_urls"] Nereden Gelir?

`CreateVideo.tsx`'te "Haber bülteni" modülü seçildiğinde kullanıcının girdiği URL'ler `job_params["_news_urls"]` olarak backend'e gönderilir. Kullanıcı URL girmezse `_news_urls` boştur ve DB'deki aktif NewsSource'lar devreye girer.

### Sonuç

- NewsSource yönetimi (`/admin/news-sources`) işlevsel bir CRUD'dur — backend pipeline tarafından gerçekten okunur.
- Kaynaklar devre dışı bırakılırsa (`enabled=False`) pipeline onları görmez.
- Kaynaklar silinirse, o kaynaktan haber çekilmez.
- Admin'in "Haber Kaynakları" sayfası, News Bulletin'in içerik kalitesini doğrudan etkiler.
