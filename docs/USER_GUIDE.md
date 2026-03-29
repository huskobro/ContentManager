# ContentManager -- Kullanici Rehberi

> **Versiyon:** v0.7.0 | **Son guncelleme:** 2026-03-29

ContentManager, YouTube icin otomatik video uretim sistemidir. Bu rehber, sistemi kurmak, video olusturmak, isleri takip etmek ve yonetim panelini kullanmak icin ihtiyaciniz olan her seyi kapsar.

---

## Icindekiler

- [Gereksinimler ve Kurulum](#gereksinimler-ve-kurulum)
  - [Sistem Gereksinimleri](#sistem-gereksinimleri)
  - [API Anahtarlari](#api-anahtarlari)
  - [Kurulum Adimlari](#kurulum-adimlari)
  - [Sistemi Baslatma](#sistemi-baslatma)
- [Arayuz Genel Bakis](#arayuz-genel-bakis)
  - [Kullanici Modu ve Admin Modu](#kullanici-modu-ve-admin-modu)
  - [Sidebar Navigasyonu](#sidebar-navigasyonu)
  - [Tema Degistirme](#tema-degistirme)
- [Dashboard](#dashboard)
  - [Ozet Kartlari](#ozet-kartlari)
  - [Sistem Sagligi](#sistem-sagligi)
  - [Son Isler](#son-isler)
  - [Hizli Eylemler](#hizli-eylemler)
- [Video Olusturma](#video-olusturma)
  - [Adim 1: Modul Secimi](#adim-1-modul-secimi)
  - [Adim 2: Baslik ve Konu](#adim-2-baslik-ve-konu)
  - [Adim 3: Dil Secimi](#adim-3-dil-secimi)
  - [Adim 4: Gelismis Ayarlar](#adim-4-gelismis-ayarlar)
  - [Gonderim](#gonderim)
- [Is Listesi](#is-listesi)
  - [Filtreleme](#filtreleme)
  - [Tablo Sutunlari](#tablo-sutunlari)
- [Is Detayi](#is-detayi)
  - [Baslik ve Durum](#baslik-ve-durum)
  - [Ilerleme Cubugu](#ilerleme-cubugu)
  - [Pipeline Adimlari](#pipeline-adimlari)
  - [Canli Loglar](#canli-loglar)
  - [Gercek Zamanli Guncellemeler (SSE)](#gercek-zamanli-guncellemeler-sse)
- [Kullanici Ayarlari](#kullanici-ayarlari)
  - [Icerik Dili](#icerik-dili)
  - [Ses Sentezi (TTS)](#ses-sentezi-tts)
  - [Altyazi](#altyazi)
  - [Video ve Gorsel](#video-ve-gorsel)
  - [Yayin ve Ek Ozellikler](#yayin-ve-ek-ozellikler)
  - [Kilitli Ayarlar](#kilitli-ayarlar)
- [Admin Paneli](#admin-paneli)
  - [Admin Paneline Giris](#admin-paneline-giris)
  - [Admin Dashboard](#admin-dashboard)
  - [Modul Yonetimi](#modul-yonetimi)
  - [Provider Yonetimi](#provider-yonetimi)
  - [Global Ayarlar](#global-ayarlar)
  - [Tum Isler (Admin)](#tum-isler-admin)
  - [Admin Modundan Cikis](#admin-modundan-cikis)
- [Video Uretim Pipeline](#video-uretim-pipeline)
- [Sik Sorulan Sorular (SSS)](#sik-sorulan-sorular-sss)

---

## Gereksinimler ve Kurulum

### Sistem Gereksinimleri

Asagidaki yazilimlarin bilgisayarinizda kurulu olmasi gerekir:

| Yazilim   | Minimum Versiyon | Amaci                                   |
|-----------|:----------------:|-----------------------------------------|
| Python    | 3.11+            | Backend sunucusu (FastAPI)              |
| Node.js   | 18+              | Frontend (React + Vite) ve Remotion     |
| FFmpeg    | 6.0+             | Video isleme ve Remotion rendering      |
| Git       | 2.x              | Kaynak kod yonetimi                     |

Versiyonlarinizi kontrol etmek icin:

```bash
python3 --version
node --version
ffmpeg -version
git --version
```

### API Anahtarlari

ContentManager farkli servislerle calisir. `.env` dosyasina asagidaki anahtarlari eklemeniz gerekir:

| Anahtar                | Servis             | Zorunlu mu? | Aciklama                                         |
|------------------------|--------------------|:-----------:|--------------------------------------------------|
| `GEMINI_API_KEY`       | Google Gemini      | **Evet***   | Senaryo ve metadata uretimi icin LLM             |
| `KIEAI_API_KEY`        | kie.ai             | **Evet***   | Gemini alternatifi LLM                           |
| `PEXELS_API_KEY`       | Pexels             | **Evet**    | Stok video ve fotograf indirme                   |
| `ELEVENLABS_API_KEY`   | ElevenLabs         | Hayir       | Yuksek kaliteli ucretli ses sentezi (TTS)        |
| `OPENAI_API_KEY`       | OpenAI             | Hayir       | Whisper altyazi senkronizasyonu + GPT yedek LLM  |
| `ADMIN_PIN`            | Sistem             | Hayir       | Admin paneli PIN kodu (varsayilan: `0000`)        |

*GEMINI_API_KEY veya KIEAI_API_KEY anahtarlarindan en az birinin tanimli olmasi gerekir.*

### Kurulum Adimlari

```bash
# 1. Projeyi klonlayin
git clone <repo-url> ContentManager
cd ContentManager

# 2. Python sanal ortamini kurun
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. Ortam degiskenlerini hazirlayin
cp .env.example .env
# .env dosyasini acarak API anahtarlarinizi girin

# 4. Frontend bagimliklarini kurun
cd frontend && npm install && cd ..

# 5. Remotion bagimliklarini kurun
cd remotion && npm install && cd ..
```

### Sistemi Baslatma

ContentManager uc ayri servis olarak calisir. Her biri icin ayri bir terminal penceresi acin:

**Terminal 1 -- Backend (FastAPI)**

```bash
source .venv/bin/activate
python -m backend.main
```

Backend `http://localhost:8000` adresinde baslar. Saglik kontrolu icin tarayicinizda `http://localhost:8000/health` adresini ziyaret edebilirsiniz.

**Terminal 2 -- Frontend (React + Vite)**

```bash
cd frontend && npm run dev
```

Frontend `http://localhost:5173` adresinde baslar. Tarayicinizda bu adresi actiginizda Dashboard sayfasini goreceksiniz.

**Terminal 3 -- Remotion Studio (Opsiyonel)**

```bash
cd remotion && npx remotion studio
```

Remotion Studio `http://localhost:3000` adresinde baslar. Video onizleme ve sablonlari test etmek icin kullanilir. Video uretimi icin bu servisin calisir olmasi gerekir.

**Veritabani:** SQLite veritabani ilk calistirmada proje dizininde otomatik olusturulur. WAL (Write-Ahead Logging) modunda calisir; herhangi bir yapilandirma gerektirmez.

---

## Arayuz Genel Bakis

### Kullanici Modu ve Admin Modu

ContentManager iki farkli arayuz modu sunar:

- **Kullanici Modu** -- Uygulamanin varsayilan modudur. Video olusturma, isleri takip etme ve kisisel ayarlari yonetme islemleri bu modda yapilir.
- **Admin Modu** -- Sistem geneli ayarlar, modul ve provider yonetimi, toplu is islemleri icin kullanilir. PIN ile korunur.

### Sidebar Navigasyonu

Sol taraftaki sidebar, kullanici ve admin modlarinda farkli menu ogeleri gosterir.

**Kullanici Modu Menusu:**

| Menu Ogesi      | Aciklama                              |
|-----------------|---------------------------------------|
| Dashboard       | Ana sayfa, ozet istatistikler         |
| Video Olustur   | Yeni video uretim formu               |
| Isler           | Tum islerin listesi ve takibi         |
| Ayarlar         | Kisisel video uretim tercihleri       |

Sidebar'in alt kisminda **Admin Paneli** baglantisi bulunur. Bu baglanti sizi admin giris modalinagoturur.

**Admin Modu Menusu:**

| Menu Ogesi         | Aciklama                                |
|--------------------|-----------------------------------------|
| Admin Dashboard    | Yonetim ozeti ve sistem durumu          |
| Modul Yonetimi     | Modulleri etkinlestirme/devre disi birakma |
| Provider Yonetimi  | API anahtarlari ve yedek sirasi         |
| Global Ayarlar     | Sistem geneli varsayilan degerler       |
| Tum Isler          | Admin seviyesinde is yonetimi           |

**Mobil Kullanim:** Kucuk ekranlarda sidebar gizlenir. Sol ustteki hamburger menusune (uc cizgi ikonu) tiklayarak sidebar'i acabilirsiniz.

### Tema Degistirme

- Uygulama varsayilan olarak **koyu tema (Dark Mode)** ile baslar.
- Tema degistirmek icin Header'in sag ust kosesindeki gunes/ay ikonuna tiklayin.
- Tercihiniz tarayicida (`localStorage`) saklanir ve sonraki ziyaretlerde korunur.
- Teknik olarak HTML etiketine `class="dark"` eklenir/kaldirilir.

---

## Dashboard

Dashboard, uygulamaya giris yaptiginizda gorunen ana sayfadir. Adres cubugunda `http://localhost:5173/dashboard` olarak gorunur. Ana sayfa (`/`) otomatik olarak Dashboard'a yonlendirir.

### Ozet Kartlari

Sayfanin ust kisminda 4 istatistik karti yer alir:

| Kart          | Aciklama                                              |
|---------------|-------------------------------------------------------|
| **Aktif Isler**   | Su an kuyrukta bekleyen ve calisan islerin toplami |
| **Tamamlanan**    | Basariyla tamamlanmis is sayisi                   |
| **Basarisiz**     | Hata ile sonlanan is sayisi                       |
| **Toplam**        | Tum zamanlar icindeki toplam is sayisi            |

### Sistem Sagligi

Dashboard'daki "System Health" paneli, backend'e `GET /health` istegi gondererek sistemin durumunu gosterir:

| Gosterge       | Aciklama                                      |
|----------------|-----------------------------------------------|
| API Durumu     | Backend baglantisi aktif mi (yesil/kirmizi)   |
| DB Durumu      | Veritabani erisimi saglikli mi                |
| Environment    | Calisma ortami (development / production)     |

Tum gostergeler yesil ise sistem saglikli calisiyordur. Kirmizi gosterge varsa ilgili servisi kontrol edin.

### Son Isler

Dashboard'da en son olusturulan 5 is, olusturulma tarihine gore siralanmis sekilde listelenir. Her is icin baslik, modul tipi ve durum bilgisi gorunur. Ise tiklayarak detay sayfasina gidebilirsiniz.

### Hizli Eylemler

Sayfanin alt kisminda 3 hizli baslat karti bulunur:

| Kart               | Aciklama                                          |
|---------------------|---------------------------------------------------|
| **Standart Video**  | `standard_video` moduluyle video olusturma formuna gider |
| **Haber Bulteni**   | `news_bulletin` moduluyle video olusturma formuna gider  |
| **Urun Inceleme**   | `product_review` moduluyle video olusturma formuna gider |

Bu kartlara tiklamak sizi dogrudan Video Olustur sayfasina ilgili modul secili olarak goturur.

---

## Video Olusturma

Video Olustur sayfasi (`/create`), yeni bir video uretim islemi baslatmak icin kullanilir. Form 4 adimdan olusur.

### Adim 1: Modul Secimi

Videonuzun turune gore bir modul secin. Uc secenekten birini tiklayin:

| Modul            | Baslik          | Aciklama                                 |
|------------------|-----------------|------------------------------------------|
| `standard_video` | Standart Video  | Genel amacli YouTube videosu             |
| `news_bulletin`  | Haber Bulteni   | Haber formati video                      |
| `product_review` | Urun Inceleme   | Urun degerlendirme videosu               |

### Adim 2: Baslik ve Konu

Videonuzun konusunu veya basligini metin alanina girin. Bu metin, senaryo uretimi icin yapay zekaya girdi olarak gonderilir.

**Ornekler:**
- "Turkiye'de en cok ziyaret edilen 5 sehir"
- "iPhone 16 Pro Max detayli inceleme"
- "Son dakika: Avrupa Birligi yeni enerji politikasini acikladi"

### Adim 3: Dil Secimi

Videonun uretilecegi dili secin:

| Kod | Dil       |
|-----|-----------|
| tr  | Turkce    |
| en  | English   |
| de  | Deutsch   |
| fr  | Francais  |
| es  | Espanol   |

Dil secimi senaryo metnini, seslendirmeyi ve altyazilari etkiler.

### Adim 4: Gelismis Ayarlar

Bu bolum varsayilan olarak kapalidir. Acmak icin "Gelismis Ayarlar" basligina tiklayin.

**TTS Provider (Ses Sentezi Saglayicisi):**

| Provider     | Aciklama                                    |
|--------------|---------------------------------------------|
| `edge_tts`   | Microsoft Edge TTS -- ucretsiz, API anahtari gerektirmez |
| `elevenlabs` | ElevenLabs -- yuksek kalite, ucretli, API anahtari gerektirir |
| `openai_tts` | OpenAI TTS -- orta-yuksek kalite, ucretli, API anahtari gerektirir |

**Altyazi Stili:**

| Stil         | Aciklama                           |
|--------------|-------------------------------------|
| `standard`   | Klasik beyaz altyazi               |
| `neon_blue`  | Neon mavi efektli                  |
| `gold`       | Altin rengi vurgulu                |
| `minimal`    | Sade ve minimal gorunum            |
| `hormozi`    | Alex Hormozi tarzi buyuk ve vurgulu |

### Gonderim

Tum adimlari tamamladiktan sonra "Olustur" butonuna tiklayin. Sistem `POST /api/jobs` istegi gondererek yeni bir is olusturur ve sizi otomatik olarak o isin detay sayfasina (`/jobs/{jobId}`) yonlendirir.

---

## Is Listesi

Is Listesi sayfasi (`/jobs`), olusturdugunuz tum video uretim islerini gosterir.

### Filtreleme

Sayfanin ustunde iki filtreleme secenegi vardir:

**Durum Filtreleri (Sekmeler):**

| Sekme       | Aciklama                        |
|-------------|----------------------------------|
| Tumu        | Tum isler                       |
| Kuyrukta    | Henuz baslamayan isler           |
| Calisiyor   | Su an islenmekte olan isler      |
| Tamamlandi  | Basariyla biten isler            |
| Basarisiz   | Hata ile sonlanan isler          |
| Iptal       | Kullanici tarafindan iptal edilen isler |

**Modul Filtresi (Acilir Menu):**

| Secenek          | Aciklama               |
|------------------|------------------------|
| Tumu             | Tum moduller           |
| standard_video   | Sadece standart videolar |
| news_bulletin    | Sadece haber bultenleri |
| product_review   | Sadece urun incelemeleri |

Sayfa basina 15 is gosterilir. Daha fazla is varsa sayfa altindaki sayfalama kontrollerini kullanin.

### Tablo Sutunlari

| Sutun     | Aciklama                                          |
|-----------|---------------------------------------------------|
| Baslik    | Videonun konusu/basligi                           |
| Modul     | Kullanilan modul tipi                             |
| Ilerleme  | Gorsel ilerleme cubugu (yuzde olarak)             |
| Durum     | Renkli durum etiketi (badge)                      |
| Tarih     | Isin olusturulma tarihi                           |

Herhangi bir satira tiklayarak o isin detay sayfasina gidebilirsiniz.

---

## Is Detayi

Is Detayi sayfasi (`/jobs/:jobId`), tek bir video uretim isinin tum bilgilerini ve canli ilerlemesini gosterir.

### Baslik ve Durum

Sayfanin ustunde sunlar gorunur:

- **Geri baglantisi** -- is listesine donus
- **Baslik** -- videonun konusu
- **Modul** -- kullanilan modul tipi
- **Olusturulma tarihi** -- isin baslama zamani
- **Dil** -- secilen icerik dili
- **Durum etiketi** -- renkli badge (Kuyrukta, Calisiyor, Tamamlandi, Basarisiz, Iptal)
- **Iptal butonu** -- sadece aktif isler icin gorunur (kuyrukta veya calisiyor)
- **Yenile butonu** -- sayfa verilerini manuel yeniler

### Ilerleme Cubugu

Sayfanin ust kisminda genel ilerlemeyi gosteren bir yuzde cubugu yer alir. Pipeline'daki adimlarin tamamlanma oranina gore otomatik guncellenir.

### Pipeline Adimlari

Her is 6 adimlik bir pipeline'dan gecer. Her adim icin asagidaki bilgiler gosterilir:

| Bilgi      | Aciklama                                                |
|------------|----------------------------------------------------------|
| Durum ikonu | Tamamlandi (yesil tik), calisiyor (donme), basarisiz (kirmizi), bekliyor (gri) |
| Etiket     | Adimin adi (ornegin "Senaryo Uretimi")                  |
| Onbellek   | Adim onbellekten geldiyse "cached" etiketi gorunur      |
| Mesaj      | Adimin mevcut durumu hakkinda kisa aciklama              |
| Provider   | Bu adimi calistiran servis (ornegin "gemini", "edge_tts") |
| Sure       | Adimin tamamlanma suresi                                 |
| Maliyet    | Adimin tahmini maliyeti                                  |

Adimlar hakkinda detayli bilgi icin [Video Uretim Pipeline](#video-uretim-pipeline) bolumune bakin.

### Canli Loglar

Sayfanin alt kisminda acilir/kapanir bir "Canli Loglar" bolumu vardir. Bu bolumde:

- Pipeline'in anlık log ciktilari goruntulenir
- Yeni loglar geldikce otomatik olarak asagi kaydirilir
- Sag ustteki kopyala butonuyla tum loglari panoya kopyalayabilirsiniz
- Her log satirinda zaman damgasi, seviye ve mesaj bilgisi bulunur

### Gercek Zamanli Guncellemeler (SSE)

Is "kuyrukta" veya "calisiyor" durumundayken sayfa otomatik olarak gercek zamanli guncelleme akisina abone olur (`GET /api/jobs/{jobId}/events`). Bu sayede sayfa acik kaldigi surece surekli guncelleme alirsiniz:

| Olay Tipi     | Aciklama                                   |
|---------------|---------------------------------------------|
| `job_status`  | Isin genel durumu degistiginde              |
| `step_update` | Bir pipeline adiminin durumu guncellendiginde |
| `log`         | Yeni log mesaji geldiginde                  |
| `heartbeat`   | Her 15 saniyede bir baglanti kontrolu       |
| `complete`    | Is tamamlandiginda akisin sonlanmasi        |

Sayfayi acik birakmaniz yeterlidir; tum ilerleme otomatik olarak goruntulenir.

**Hata Durumu:** Is basarisiz olursa sayfada kirmizi bir hata kutusu gorunur ve hata mesaji detayli olarak gosterilir.

**Cikti:** Is basariyla tamamlandiginda, uretilen videonun dosya yolu sayfada gorunur.

**Tahmini Maliyet:** Kullanilan provider'lara bagli olarak toplam tahmini maliyet goruntulenir.

---

## Kullanici Ayarlari

Ayarlar sayfasi (`/settings`), video uretim surecinde kullanilacak varsayilan tercihleri belirlemenizi saglar. 5 bolumden olusur.

### Icerik Dili

Videolarin varsayilan olarak hangi dilde uretilecegini secin:

| Deger | Dil       |
|-------|-----------|
| `tr`  | Turkce    |
| `en`  | English   |
| `de`  | Deutsch   |
| `fr`  | Francais  |
| `es`  | Espanol   |

Bu ayar, Video Olustur formundaki dil seciminin varsayilan degerini belirler.

### Ses Sentezi (TTS)

Varsayilan TTS provider'ini secin:

| Deger        | Aciklama                                                    |
|--------------|--------------------------------------------------------------|
| `edge_tts`   | Microsoft Edge TTS -- ucretsiz, API anahtari gerektirmez    |
| `elevenlabs` | ElevenLabs -- yuksek kalite, ucretli                        |
| `openai_tts` | OpenAI TTS -- orta-yuksek kalite, ucretli                   |

**Not:** `edge_tts` varsayilan ve ucretsiz sezenektir. `elevenlabs` veya `openai_tts` kullanmak icin ilgili API anahtarinin `.env` dosyasinda tanimli olmasi gerekir.

### Altyazi

Bu bolumde iki ayar vardir:

- **Altyazi Etkin/Devre Disi** -- Acma/kapama dugmesi. Kapali konumda video altyazisiz uretilir.
- **Altyazi Stili** -- Altyazi etkinse stil secimi:

| Stil       | Gorunum                                  |
|------------|------------------------------------------|
| `standard` | Klasik beyaz yazi, siyah arka plan       |
| `neon_blue`| Neon mavi parlak efekt                   |
| `gold`     | Altin rengi, vurgulu metin               |
| `minimal`  | Sade, ince yazi, minimal gorunum         |
| `hormozi`  | Buyuk, kalin, vurgulu (Alex Hormozi tarzi) |

### Video ve Gorsel

| Ayar              | Secenekler                        | Varsayilan     |
|-------------------|-----------------------------------|----------------|
| Gorsel Provider   | Stok gorsel/video kaynagi         | pexels         |
| Video Cozunurlugu | `1920x1080`, `1280x720`, `3840x2160` | 1920x1080   |
| Video FPS         | `24`, `30`, `60`                  | 30             |

- **1920x1080** -- Full HD, YouTube icin standart
- **1280x720** -- HD, daha hizli render
- **3840x2160** -- 4K, en yuksek kalite ama en yavas render

### Yayin ve Ek Ozellikler

| Ayar                | Tip           | Aciklama                                        |
|---------------------|---------------|--------------------------------------------------|
| Metadata Uretimi    | Acma/Kapama   | YouTube baslik, aciklama ve etiket uretimi       |
| Kucuk Resim Uretimi | Acma/Kapama   | Otomatik thumbnail olusturma                     |
| YouTube'a Yayinla   | Acma/Kapama   | Tamamlanan videoyu otomatik yukle                |
| YouTube Gizliligi   | Secim listesi | Yayin durumu: genel, listelenmemis veya ozel     |

### Kilitli Ayarlar

Bazi ayarlarin yaninda bir kilit ikonu gorebilirsiniz. Bu, ilgili ayarin admin tarafindan kilitlendigini ve kullanici tarafindan degistirilemeyecegini gosterir. Kilitli ayarlari degistirmek icin admin ile iletisime gecin.

**Kaydet ve Sifirla Butonlari:**
- **Kaydet** -- Tum degisiklikleri kaydeder
- **Sifirla** -- Ayarlari varsayilan degerlere dondiurur

---

## Admin Paneli

Admin paneli, sistemin genelini yonetmek icin tasarlanmistir. PIN ile korunur.

### Admin Paneline Giris

Admin paneline iki yoldan erisebilirsiniz:

1. Sol sidebar'in alt kismindaki **Admin Paneli** baglantisina tiklayin
2. Veya Header'daki kilit ikonuna tiklayin

Her iki durumda da bir PIN giris penceresi acilir:

- **Giris alani:** Sifre tipinde, sayisal, en fazla 8 karakter
- **Yanlis PIN girildiginde:** Giris alani kirmizi cerceve ile isaretlenir ve "Hatali PIN" mesaji gorunur
- **Dogru PIN girildiginde:** Sistem `/admin/dashboard` sayfasina yonlendirir ve sidebar admin menusune gecer

**Varsayilan PIN:** `0000` -- Bu degeri mutlaka degistirin. `.env` dosyasindaki `ADMIN_PIN` degerini guncelleyin.

PIN tarayicida `localStorage` icerisinde `cm-admin-pin` anahtariyla saklanir.

### Admin Dashboard

Admin Dashboard (`/admin/dashboard`) yonetim ozeti sunar.

**Istatistik Kartlari:**

| Kart             | Aciklama                                     |
|------------------|-----------------------------------------------|
| Toplam Is        | Sistemdeki toplam is sayisi                   |
| Basari Orani %   | Tamamlanan islerin toplama orani (yuzde)      |
| Basarisiz        | Hata ile sonlanan is sayisi                   |
| Aktif Isler      | Su an kuyrukta veya calisan is sayisi         |

**Sistem Sagligi:** Kullanici Dashboard'dakiyle ayni saglik kontrol paneli.

**Is Dagilimi:** Duruma gore is dagilimini gorsel cubuklar (bar) halinde gosterir:
- Kuyrukta (queued)
- Calisiyor (running)
- Tamamlandi (completed)
- Basarisiz (failed)
- Iptal (cancelled)

**Hizli Erisim Baglantilari:** Modul Yonetimi, Provider Yonetimi, Global Ayarlar ve Tum Isler sayfalarini hizlica acmak icin kartlar.

### Modul Yonetimi

Modul Yonetimi sayfasi (`/admin/modules`) sistemdeki 3 modulu yonetmenizi saglar:

| Modul            | Aciklama             |
|------------------|----------------------|
| `standard_video` | Standart video       |
| `news_bulletin`  | Haber bulteni        |
| `product_review` | Urun inceleme        |

Her modul icin yapabilecekleriniz:

- **Aktif/Pasif Degistirme** -- Modulu acma/kapama dugmesiyle etkinlestirin veya devre disi birakin. Devre disi birakilan modul, Video Olustur sayfasinda gorunmez.
- **Modul Ayarlari** -- Her modulun uzerine tiklayarak genisleyebilir ayar panelini acin. Bu panelde:
  - Module ozel ayar ekleyebilirsiniz
  - Mevcut ayarlari duzenleyebilirsiniz
  - Gereksiz ayarlari silebilirsiniz

### Provider Yonetimi

Provider Yonetimi sayfasi (`/admin/providers`) API saglayicilarini yapilandirir.

**Kategoriye Gore Provider'lar:**

| Kategori  | Provider'lar              |
|-----------|---------------------------|
| LLM       | `gemini`, `openai_llm`    |
| TTS       | `elevenlabs`, `openai_tts`, `edge_tts` |
| Gorseller | `pexels`, `pixabay`       |

**Her Provider Icin:**

- **API Anahtari Girisi** -- Maskeli giris alani. Goz ikonu ile anahtari gosterebilir/gizleyebilirsiniz.
- **Provider Ayarlari** -- Her provider'a ozel yapilandirma secenekleri.

**Yedek Sirasi (Fallback Order):**

Bir provider basarisiz oldugunda sistemin hangi sirada diger provider'lari denemesi gerektigini belirleyin. Virgullerle ayrilmis listeler halinde girilir:

| Ayar                    | Ornek Deger                    |
|-------------------------|--------------------------------|
| `tts_fallback_order`    | `edge_tts,elevenlabs,openai_tts` |
| `llm_fallback_order`    | `gemini,openai_llm`            |
| `visuals_fallback_order`| `pexels,pixabay`               |

### Global Ayarlar

Global Ayarlar sayfasi (`/admin/global-settings`) sistem genelinde gecerli varsayilan degerleri yonetir.

**Yeni Ayar Ekleme:**

Form alanlari:
- **Anahtar (Key)** -- Ayarin tekil ismi
- **Deger (Value)** -- Ayarin degeri
- **Aciklama (Description)** -- Ayarin ne ise yaradigina dair kisa not
- **Kilitli (Locked)** -- Isaretlenirse kullanicilar bu ayari degistiremez

**Mevcut Ayarlari Duzenleme:**

- Bir ayarin degerine tiklayarak satir ici duzenleme moduna gecin
- **Enter** tusuna basarak kaydedin, **Escape** ile iptal edin
- Kilit ikonuyla ayari kilitleyebilir veya kilidini acabilirsiniz
- Sil butonuyla gereksiz ayarlari kaldirabilirsiniiz

### Tum Isler (Admin)

Admin Isler sayfasi (`/admin/jobs`) tum isleri admin perspektifinden yonetir.

- Kullanici Is Listesi ile ayni durum ve modul filtreleri mevcuttur
- Sayfa basina **20 is** gosterilir (kullanici tarafinda 15)
- **Toplu Temizlik Butonu** -- Tamamlanmis, basarisiz ve iptal edilmis tum isleri tek tikla siler
- **Is Bazinda Islemler:**
  - Aktif isler (kuyrukta/calisiyor) icin **Iptal** butonu
  - Tamamlanmis durumlar (tamamlandi/basarisiz/iptal) icin **Sil** butonu

### Admin Modundan Cikis

Header'daki kilit butonuna tiklayarak admin oturumunu sonlandirabilirsiniz. Sistem sizi otomatik olarak `/dashboard` sayfasina yonlendirir ve sidebar kullanici menusune geri doner.

---

## Video Uretim Pipeline

Her video uretimi 6 adimlik bir pipeline'dan gecer. Asagida standart video (`standard_video`) modulunun adimlari aciklanmistir:

| Adim | Ad                          | Aciklama                                                         |
|:----:|-----------------------------|-------------------------------------------------------------------|
| 1    | **Senaryo Uretimi**         | LLM provider (Gemini veya OpenAI) kullanilarak sahne sahne senaryo olusturulur. Her sahne icin metin, gorsel aciklamasi ve zamanlama bilgisi uretilir. |
| 2    | **Metadata Uretimi**        | LLM kullanilarak YouTube icin baslik, aciklama ve etiketler olusturulur. SEO uyumlu icerik hedeflenir. |
| 3    | **Ses Sentezi (TTS)**       | Her sahnenin metni secilen TTS provider ile seslendirilir. Kelime bazinda zamanlama (word-level timing) bilgisi cikarilir. |
| 4    | **Gorsel Indirme**          | Her sahne icin uygun stok video veya fotograf, gorsel provider'dan (Pexels vb.) indirilir. |
| 5    | **Altyazi Olusturma**       | Kelime zamanlama bilgisi kullanilarak secilen stildeki altyazilar uretilir. |
| 6    | **Video Birlestirme**       | Tum oge parcalar (ses, gorseller, altyazilar) Remotion kullanilarak birlestirilir ve nihai video dosyasi olusturulur. |

Her adim bagimsiz olarak basarili, basarisiz veya onbellekten yuklenmiis olabilir. Is Detayi sayfasinda her adimin durumunu, suresini, kulllandigi provider'i ve maliyetini gorebilirsiniz.

**Onbellek:** Daha once uretilmis veriler (ornegin ayni konu icin senaryo) onbellekte varsa tekrar uretilmez. Bu durum "cached" etiketi ile gosterilir ve maliyeti sifirdir.

---

## Sik Sorulan Sorular (SSS)

**S: Dashboard'da "Backend baglantisi kurulamadi" hatasi aliyorum.**

Backend sunucusunun calistigini dogrulayin. Terminal'de asagidaki komutu calistirin:

```bash
python -m backend.main
```

Komutun hatasiz calistigini ve 8000 portunda dinledigini kontrol edin. Ayrica tarayicida `http://localhost:8000/health` adresini ziyaret ederek yanit aldiginizi dogrulayin.

---

**S: Admin PIN'imi unuttum, ne yapmaliyim?**

`.env` dosyasini acin ve `ADMIN_PIN` degerini yeni bir PIN ile degistirin:

```
ADMIN_PIN=1234
```

Ardindan backend sunucusunu durdurup yeniden baslatin. Yeni PIN hemen gecerli olacaktir.

---

**S: Mobil cihazda sidebar gorunmuyor.**

Kucuk ekranlarda sidebar otomatik olarak gizlenir. Ekranin sol ust kosesindeki hamburger ikonu (uc yatay cizgi) tiklayarak sidebar'i acabilirsiniz.

---

**S: Edge TTS ucretsiz mi? API anahtari gerekiyor mu?**

Evet, Edge TTS tamamen ucretsizdir ve herhangi bir API anahtari gerektirmez. Varsayilan TTS provider olarak ayarlidir. Ek bir yapilandirma yapmadan hemen kullanabilirsiniz.

---

**S: Is "calisiyor" durumunda kaldi, ilerlemiyor.**

Oncelikle backend terminalindeki konsol ciktisini kontrol edin. Hata mesajlari genellikle sorunun kaynagini gosterir. Sorun devam ederse:

1. Is Detayi sayfasindaki **Iptal** butonuna tiklayin
2. Hatanin nedenini belirleyin (API anahtari eksik, ag hatasi vb.)
3. Sorunu giderdikten sonra yeni bir is olusturun

---

**S: Uretilen video dosyasi nerede?**

Tamamlanan videolar proje dizini altindaki `sessions/{job_id}/` klasorunde saklanir. Is Detayi sayfasinda tamamlanan isler icin dosya yolu gosterilir.

---

**S: Remotion Studio acilmiyor veya video birlestirme adimi basarisiz oluyor.**

Remotion'un calisir durumda oldugundan emin olun:

```bash
cd remotion && npx remotion studio
```

Remotion Studio `http://localhost:3000` adresinde baslamalidir. Ayrica FFmpeg'in kurulu ve erisileebilir oldugunu dogrulayin:

```bash
ffmpeg -version
```

---

**S: Birden fazla API anahtari tanimladim, sistem hangisini kullaniyor?**

Sistem, Provider Yonetimi sayfasindaki yedek sirasina (fallback order) gore calisir. Ilk siradaki provider denenir; basarisiz olursa siradaki provider'a gecilir. Varsayilan sirayi Admin Paneli > Provider Yonetimi sayfasindan degistirebilirsiniz.

---

**S: 4K video uretimi cok yavas.**

4K (3840x2160) cozunurluk, Full HD'ye (1920x1080) gore yaklasik 4 kat daha fazla isleme gucu gerektirir. Hizli sonuc icin:

- Video cozunurlugunu `1920x1080` olarak ayarlayin
- FPS degerini `24` veya `30` olarak secin
- Bu ayarlar Ayarlar sayfasindan veya Video Olustur formundaki gelismis ayarlardan degistirilebilir

---

*Bu rehber ContentManager v0.7.0 icin hazirlanmistir. Degisiklik gecmisi icin [CHANGELOG](./CHANGELOG.md) dosyasina bakin.*
