# ContentManager -- Ozellik ve Aksiyon Haritasi

> Versiyon: v0.8.0 | Tarih: 2026-03-30

Bu dokuman, ContentManager arayuzundeki her bilesenin, her butonun, her form elemaninin arka plandaki API endpoint ve Zustand store metodu ile iliskisini birebir haritalandirir. Hicbir placeholder veya TODO icermez; her satir gercek koda karsilik gelir.

---

## Icindekiler

1. [Genel Layout Bilesenleri](#1-genel-layout-bilesenleri)
   - [AppShell](#11-appshell)
   - [Sidebar](#12-sidebar)
   - [Header](#13-header)
2. [Kullanici Sayfalari](#2-kullanici-sayfalari)
   - [Dashboard](#21-dashboard)
   - [CreateVideo](#22-createvideo)
   - [JobList](#23-joblist)
   - [JobDetail](#24-jobdetail)
   - [UserSettings](#25-usersettings)
3. [Admin Sayfalari](#3-admin-sayfalari)
   - [AdminDashboard](#31-admindashboard)
   - [GlobalSettings](#32-globalsettings)
   - [ModuleManager](#33-modulemanager)
   - [ProviderManager](#34-providermanager)
   - [AdminJobs](#35-adminjobs)
4. [Zustand Store -> API Haritasi](#4-zustand-store---api-haritasi)
5. [SSE Event Tipleri](#5-sse-event-tipleri)

---

## 1. Genel Layout Bilesenleri

### 1.1 AppShell

**Dosya:** `components/layout/AppShell.tsx`

AppShell, tum sayfalari saran ust duzey layout bilesenidir. Sol tarafta Sidebar, ustte Header ve ortada React Router `<Outlet />` icerir.

| Ozellik | Aciklama |
|---------|----------|
| `mode` prop | `"user"` veya `"admin"` -- React Router parent route tarafindan belirlenir |
| Responsive davranisin | Sidebar kapali iken `lg:ml-[60px]`, acik iken `lg:ml-[220px]` margin uygular |
| Yapisal bilesenler | `<Sidebar />` + `<Header />` + `<Outlet />` |

---

### 1.2 Sidebar

**Dosya:** `components/layout/Sidebar.tsx`

#### Kullanici Menusu (mode = "user")

| Menu Ogesi | Ikon | Yol | Aciklama |
|------------|------|-----|----------|
| Dashboard | LayoutDashboard | `/dashboard` | Istatistik ozeti sayfasi |
| Video Olustur | PlusCircle | `/create` | Yeni video pipeline baslatma |
| Isler | ListVideo | `/jobs` | Is listesi ve takip |
| Ayarlar | Settings | `/settings` | Kullanici tercihleri |
| Admin Paneli | ShieldCheck | (sidebar alt kismi) | Admin giris linki |

#### Admin Menusu (mode = "admin")

| Menu Ogesi | Ikon | Yol |
|------------|------|-----|
| Admin Dashboard | LayoutDashboard | `/admin/dashboard` |
| Modul Yonetimi | Boxes | `/admin/modules` |
| Provider Yonetimi | Plug | `/admin/providers` |
| Global Ayarlar | Sliders | `/admin/global-settings` |
| Tum Isler | ListVideo | `/admin/jobs` |

#### Sidebar Aksiyonlari

| Aksiyon | Tetikleyici | Store Metodu | Etki |
|---------|-------------|--------------|------|
| Daralt/Genislet | "Daralt" butonu | `uiStore.toggleSidebar()` | Genislik 220px ile 60px arasi gecis yapar, localStorage'da saklanir |
| Mobil acma | Hamburger ikonu | `uiStore.setMobileSidebarOpen(true)` | Overlay olarak sidebar acar |
| Mobil kapatma | Arka plan (backdrop) tiklamasi | `uiStore.setMobileSidebarOpen(false)` | Overlay sidebar'i kapatir |
| Logo tiklama | Logo | React Router `navigate` | `mode=user` ise `/dashboard`, `mode=admin` ise `/admin/dashboard` sayfasina yonlendirir |

---

### 1.3 Header

**Dosya:** `components/layout/Header.tsx`

#### Header Elemanlari

| Eleman | Ikon | Tetikleyici | Store / API | Sonuc |
|--------|------|-------------|-------------|-------|
| Hamburger | Menu | Tiklama (yalnizca mobil) | `uiStore.setMobileSidebarOpen(true)` | Mobil sidebar'i acar |
| Sayfa basligi | -- | Otomatik | React Router `location` -> `PAGE_TITLES` map | Mevcut sayfa adini gosterir |
| Admin rozeti | ShieldCheck | -- (yalnizca admin modu) | `uiStore.adminUnlocked` | Sari "Admin Modu" metni gosterir |
| Tema degistirme | Sun / Moon | Tiklama | `uiStore.toggleTheme()` | Dark ile light tema arasi gecis, localStorage'a kaydeder |
| Admin kilit acma | KeyRound | Tiklama (kullanici modu) | PIN modalini acar | PIN giris diyalogu gosterir |
| Admin kilitleme | ShieldOff | Tiklama (admin modu) | `uiStore.lockAdmin()` | Admin'i kilitler, `/dashboard` sayfasina yonlendirir |

#### PIN Modali

| Eleman | Tipi | Davranis |
|--------|------|----------|
| PIN girisi | `password`, numeric, `maxLength=8` | Ortali, `tracking-widest` stilinde |
| Gonder butonu | button | localStorage'daki `"cm-admin-pin"` ile karsilastirir, eslesirse `uiStore.unlockAdmin()` cagrilir ve `/admin/dashboard` sayfasina yonlendirilir |
| Iptal butonu | button | Modali kapatir, state'i sifirlar |
| Hatali PIN | -- | Kirmizi kenarlık, "Hatali PIN" metni gorunur, giris alani temizlenir |

---

## 2. Kullanici Sayfalari

### 2.1 Dashboard

**Dosya:** `pages/user/Dashboard.tsx`

> **Faz 10.5 degisikligi:** Batch is gonderimi sonrasi Dashboard'daki "Aktif Isler" sayacinin otomatik guncellenmesi icin 5 saniye araliklarla `fetchStats()` cagrisi ekleniyor. Kullanici sayfayi yenilemeden kuyruktaki yeni islerin istatistiklere yansıdigini gorebilir.

#### Sayfa Yuklenirken ve Periyodik Yapilan API Cagirilari

| Cagri | API Endpoint | Store Metodu | Canlilik |
|-------|-------------|--------------|---------|
| Is listesi | `GET /api/jobs?page=1&page_size=10` | `jobStore.fetchJobs({page:1, page_size:10})` | Sayfa yuklenirken + 5 sn polling (Faz 10.5) |
| Istatistikler | `GET /api/jobs/stats` | `jobStore.fetchStats()` | Sayfa yuklenirken + 5 sn polling (Faz 10.5) |
| Sistem sagligi | `GET /health` | Dogrudan `fetch("/health")` | Yalnizca sayfa yuklenirken |

#### UI Elemanlari

| Eleman | Veri Kaynagi | Backend Eslesmesi |
|--------|-------------|-------------------|
| StatCard: Aktif Isler | `stats.queued + stats.running` | `GET /api/jobs/stats` |
| StatCard: Tamamlanan | `stats.completed` | `GET /api/jobs/stats` |
| StatCard: Basarisiz | `stats.failed` | `GET /api/jobs/stats` |
| StatCard: Toplam | `stats.total` | `GET /api/jobs/stats` |
| System Health: API | `/health` yaniti -> `response.status` | `GET /health` |
| System Health: DB | `/health` yaniti -> `response.database` | `GET /health` |
| System Health: Env | `/health` yaniti -> `response.environment` | `GET /health` |
| Son Isler listesi | `jobStore.jobs` (ilk 5 kayit) | `GET /api/jobs` |
| Yenile butonu | Tiklama | `jobStore.fetchJobs()` + `jobStore.fetchStats()` |
| Yeni Video butonu | Tiklama | `navigate("/create")` |
| Hizli islem: Standart Video | Tiklama | `navigate("/create")` |
| Hizli islem: Haber Bulteni | Tiklama | `navigate("/create")` |
| Hizli islem: Urun Inceleme | Tiklama | `navigate("/create")` |

---

### 2.2 CreateVideo

**Dosya:** `pages/user/CreateVideo.tsx`

> **Faz 10.5 degisiklikleri:** Tek satir metin girisi cok satirli `<textarea>`'ya donusturuldu (batch uretim). Video Formati secimi eklendi. Gonderim mantigi tek istek gondermek yerine satirlari parcalayan bir dongüye donusturuldu.

#### Form Elemanlari

| Eleman | Tipi | Secenekler / Aciklama | Backend Eslesmesi |
|--------|------|-----------------------|-------------------|
| Modul secimi | 3 kart | `standard_video`, `news_bulletin`, `product_review` | `POST /api/jobs` -> `module_key` alani |
| Konu textarea | `<textarea>` (5 satir, yeniden boyutlanabilir) | Her satir = bagimsiz bir video konusu. Bos satirlar filtrelenir. Birden fazla satir varsa sag ustte "X video" rozeti gosterilir. | Her gecerli satir icin ayri `POST /api/jobs` -> `title` alani |
| Video Formati | 2 buton kart | `long` (Uzun Video, 16:9, MonitorPlay ikonu) / `shorts` (Shorts/Dikey, 9:16, Smartphone ikonu). Varsayilan deger `settingsStore.userDefaults.videoFormat`'tan gelir; sayfa ilk yuklendiginde backend'in admin ayarindan okur. | `POST /api/jobs` -> `settings_overrides.video_format` + `settings_overrides.video_resolution` |
| Dil secimi | dropdown | `tr`, `en`, `de`, `fr`, `es` | `POST /api/jobs` -> `language` alani |
| TTS Provider | select (gelismis ayar) | `edge_tts`, `elevenlabs`, `openai_tts` | `POST /api/jobs` -> `settings_overrides.tts_provider` |
| Altyazi Stili | select (gelismis ayar) | `standard`, `neon_blue`, `gold`, `minimal`, `hormozi` | `POST /api/jobs` -> `settings_overrides.subtitle_style` |
| Gonder butonu | submit | Tek satir: "Isi Baslat". Cok satir: "X Video Isini Baslat". Gonderim sirasinda "Olusturuluyor... (N/M)" ilerleme metni gosterilir. | Tek is -> `navigate(/jobs/{id})`. Batch -> `navigate(/jobs)` |

#### Video Formati -> Cozunurluk Eslesmesi

| Format degeri | Gonderilen `video_resolution` | Aciklama |
|--------------|-------------------------------|----------|
| `long` | `1920x1080` | YouTube yatay (16:9) |
| `shorts` | `1080x1920` | YouTube Shorts / Reels (9:16) |

Cozunurluk, `settings_overrides` icine otomatik eklenir. Kullanici ayrıca elle girmez.

#### Batch Gonderim Akisi

```
textarea.split("\n")
  -> filter(line => line.trim().length > 0)
  -> topics[]  // Gecerli satir listesi

for (let i = 0; i < topics.length; i++) {
  await createJob({ title: topics[i], ..., settings_overrides: { video_format, video_resolution, ... } })
  setSubmitProgress({ done: i+1, total: topics.length })
  if (i < topics.length - 1) await sleep(150ms)  // SQLite kilit onleme
}

if (successCount === 1) -> navigate(/jobs/{lastJobId})
else                    -> navigate(/jobs)
```

#### POST /api/jobs Istek Govdesi (Guncellenmis)

```json
{
  "module_key": "standard_video",
  "title": "Yapay Zekanin Gelecegi",
  "language": "tr",
  "settings_overrides": {
    "video_format": "long",
    "video_resolution": "1920x1080",
    "tts_provider": "edge_tts",
    "subtitle_style": "standard"
  }
}
```

---

### 2.3 JobList

**Dosya:** `pages/user/JobList.tsx`

> **Faz 10.5 degisikligi:** Batch is gonderimi sonrasi kullanici bu sayfaya yonlendirilir. Yeni worker loop mimarisinde isler once QUEUED gorunur, ardından siralarinı bekler. Sayfa, manuel yenileme gerektirmeden kuyruktaki islerin durumu degistikce otomatik guncellenir (5 saniye araliklarla `fetchJobs()` cagrisi -- ADR-016).

#### Otomatik Canli Guncelleme (Faz 10.5)

| Mekanizma | Aciklama |
|-----------|----------|
| `useInterval(fetchJobs, 5000)` | Sayfa acikken her 5 saniyede bir `GET /api/jobs` cagrisi yapar. Kullanici sayfayi yenilemek zorunda kalmaz. |
| Tetikleyici kosul | Aktif is varsa (`queued` veya `running` sayisi > 0) polling devrede kalir. Tum isler terminal durumda ise polling duraklatilabilir. |
| Manuel yenile | Mevcut "Yenile" butonu hala calisir; polling'e ek olarak anlik guncelleme saglar. |

#### Filtre ve Sayfalama

| Eleman | Tipi | Secenekler | Backend Eslesmesi |
|--------|------|-----------|-------------------|
| Durum filtre tablari | 6 sekme | `all`, `queued`, `running`, `completed`, `failed`, `cancelled` | `GET /api/jobs?status=X` |
| Modul filtresi | dropdown | `all`, `standard_video`, `news_bulletin`, `product_review` | `GET /api/jobs?module_key=X` |
| Sayfalama | onceki/sonraki butonlari | `page_size=15` | `GET /api/jobs?page=X&page_size=15` |
| Is satiri | tiklanabilir satir | -- | `navigate(/jobs/{id})` |

#### Tablo Sutunlari

| Sutun | Veri Kaynagi | Backend Alani |
|-------|-------------|---------------|
| Baslik | `job.title` | `jobs.title` |
| Modul | `job.module_key` -> `MODULE_INFO` etiketi | `jobs.module_key` |
| Ilerleme | Tamamlanan adim sayisi / toplam adim sayisi | `job_steps` tablasundaki durum degerleri |
| Durum | `job.status` -> `STATUS_CONFIG` | `jobs.status` |
| Tarih | `job.created_at` formatli | `jobs.created_at` |

---

### 2.4 JobDetail

**Dosya:** `pages/user/JobDetail.tsx`

#### Veri Cekme

| Cagri | API | Store Metodu |
|-------|-----|--------------|
| Is detayi | `GET /api/jobs/{jobId}` | `jobStore.fetchJobById(jobId)` |
| SSE akisi | `GET /api/jobs/{jobId}/events` | `jobStore.subscribeToJob(jobId)` |

#### SSE Event Isleyicileri

| Event Tipi | Store Metodu | UI Guncelleme |
|-----------|--------------|---------------|
| `job_status` | `jobStore.updateJobStatus(id, data.status)` | Durum rozeti ve ilerleme cubugu guncellenir |
| `step_update` | `jobStore.updateStep(id, data.key, data)` | Adim durum ikonu, sure ve provider bilgisi guncellenir |
| `log` | `jobStore.appendLog(id, entry)` | Log goruntuleyiciye yeni satir eklenir |
| `heartbeat` | -- | Baglanti canli tutma (keepalive) |
| `complete` | `unsubscribe()` | SSE dinleme durdurulur |

#### UI Elemanlari

| Eleman | Aksiyon | Backend |
|--------|---------|---------|
| Geri butonu | `navigate(-1)` | -- |
| Iptal butonu | `jobStore.cancelJob(id)` | `PATCH /api/jobs/{id}` -> `{status:"cancelled"}` |
| Yenile butonu | `jobStore.fetchJobById(id)` | `GET /api/jobs/{id}` |
| Ilerleme cubugu | Tamamlanan/toplam adim yuzdesi | Adimlardan hesaplanir |
| Hata kutusu | `job.error_message` gosterimi | `jobs.error_message` |
| Cikti linki | `job.output_path` | `sessions/{id}/` dizini |
| Maliyet gosterimi | `job.cost_estimate_usd` formatli | `jobs.cost_estimate_usd` |
| Adim listesi | `order` alanina gore sirali | `job_steps` tablosu |
| Log goruntuleyici | Otomatik kaydir, kopyala butonu | SSE log event'leri |
| Log kopyala | Tum log metnini panoya kopyalar | -- (istemci tarafi) |

#### Pipeline Adimlari

| Adim Anahtari | Etiket | Yetenek (Capability) | Olumcul (Fatal) |
|---------------|--------|---------------------|-----------------|
| `script` | Senaryo Uretimi | `SCRIPT_GENERATION` | Evet |
| `metadata` | Metadata Uretimi | `METADATA_GENERATION` | Hayir |
| `tts` | Ses Sentezi | `TTS` | Evet |
| `visuals` | Gorsel Indirme | `VISUALS` | Hayir |
| `subtitles` | Altyazi Olusturma | `SUBTITLES` | Hayir |
| `composition` | Video Birlestirme | `COMPOSITION` | Evet |

---

### 2.5 UserSettings

**Dosya:** `pages/user/UserSettings.tsx`

#### Veri Cekme

Sayfa yuklendiginde: `GET /api/settings/resolved?module_key=standard_video` -> `settingsStore.fetchResolvedSettings()`

#### Ayar Alanlari

| Bolum | Ayar Anahtari | Tipi | Secenekler | Store Metodu | Kilitlenebilir |
|-------|--------------|------|-----------|--------------|----------------|
| Icerik Dili | `language` | select | `tr`, `en`, `de`, `fr`, `es` | `settingsStore.patchUserDefault` | Evet |
| TTS Provider | `ttsProvider` | select | `edge_tts`, `elevenlabs`, `openai_tts` | `settingsStore.patchUserDefault` | Evet |
| Altyazi Toggle | `subtitleEnabled` | switch | acik/kapali | `settingsStore.patchUserDefault` | Evet |
| Altyazi Stili | `subtitleStyle` | select | `standard`, `neon_blue`, `gold`, `minimal`, `hormozi` | `settingsStore.patchUserDefault` | Evet |
| Gorsel Provider | `visualsProvider` | select | `pexels`, `pixabay` | `settingsStore.patchUserDefault` | Evet |
| Video Cozunurluk | `videoResolution` | select | `1920x1080`, `1280x720`, `3840x2160` | `settingsStore.patchUserDefault` | Evet |
| Video FPS | `videoFps` | select | `24`, `30`, `60` | `settingsStore.patchUserDefault` | Evet |
| Metadata | `metadataEnabled` | switch | acik/kapali | `settingsStore.patchUserDefault` | Evet |
| Thumbnail | `thumbnailEnabled` | switch | acik/kapali | `settingsStore.patchUserDefault` | Evet |
| YouTube Yayin | `publishToYoutube` | switch | acik/kapali | `settingsStore.patchUserDefault` | Evet |
| YouTube Gizlilik | `youtubePrivacy` | select | `private`, `unlisted`, `public` | `settingsStore.patchUserDefault` | Evet |

#### Butonlar

| Buton | Aksiyon | Store Metodu |
|-------|---------|--------------|
| Kaydet | Tum degisiklikleri kaydeder | `settingsStore.setUserDefaults(formState)` |
| Sifirla | Varsayilanlara dondurur | `settingsStore.setUserDefaults(initialDefaults)` |

#### Kilit Gostergesi

Eger bir ayar anahtari `resolvedSettings.lockedKeys` icinde yer aliyorsa, o alanin yaninda kilit ikonu gorunur ve alan devre disi (disabled) olur. Bu kilit admin tarafindan uygulanir.

---

## 3. Admin Sayfalari

### 3.1 AdminDashboard

**Dosya:** `pages/admin/AdminDashboard.tsx`

#### UI Elemanlari

| Eleman | Veri Kaynagi | Backend |
|--------|-------------|---------|
| StatCard: Toplam Is | `stats.total` | `GET /api/jobs/stats` |
| StatCard: Basari Orani | `completed / total * 100` | Hesaplanan deger |
| StatCard: Basarisiz | `stats.failed` | `GET /api/jobs/stats` |
| StatCard: Aktif Isler | `stats.queued + stats.running` | `GET /api/jobs/stats` |
| Sistem Sagligi | `/health` yaniti | `GET /health` |
| Is Dagilimi cubuk grafigi | Duruma gore istatistikler | `GET /api/jobs/stats` |
| Hizli Link: Moduller | Tiklama | `/admin/modules` sayfasina yonlendirir |
| Hizli Link: Providerlar | Tiklama | `/admin/providers` sayfasina yonlendirir |
| Hizli Link: Ayarlar | Tiklama | `/admin/global-settings` sayfasina yonlendirir |
| Hizli Link: Isler | Tiklama | `/admin/jobs` sayfasina yonlendirir |

---

### 3.2 GlobalSettings

**Dosya:** `pages/admin/GlobalSettings.tsx`

> **Faz 10.5 degisiklikleri:** Sayfanin ustune iki yeni sabit yonetim karti eklendi: "Varsayilan Video Formati" ve (Faz 10.5 kodlama asamasinda eklenecek) "Esmanli Is Limiti". Bu kartlar genel ayar listesinin uzerinde, her zaman gorunur sekilde konumlandirildi.

#### Yeni Sabit Yonetim Kartlari (Faz 10.5)

| Kart | UI Elemani | Kaydetme Islemi | Backend |
|------|-----------|-----------------|---------|
| **Varsayilan Video Formati** | 2 radyo buton kart: "Uzun Video (16:9) / 1920x1080" ve "Shorts/Dikey (9:16) / 1080x1920". Sayfa acildiginda `GET /api/settings/resolved` ile mevcut `video_format` degeri okunarak secili hale getirilir. | "Kaydet" butonu -> `POST /api/settings` ile `scope="admin", key="video_format"` olarak yazar. Kullanicinin bu tercihe sahip olmasi icin kilitli (locked=false) bırakılır; kullanici iş bazında geçersiz kılabilir. | `POST /api/settings` -> `{scope:"admin", scope_id:"", key:"video_format", value:"long"\|"shorts"}` |
| **Esmanli Is Limiti** *(Kodlama asamasinda)* | 1-10 arasi sayisal giris. `max_concurrent_jobs` ayarini gosterir. Degistirmek icin "Uygula" butonu. | `POST /api/settings` ile `scope="admin", key="max_concurrent_jobs"` olarak yazar ve runtime `app_settings.max_concurrent_jobs`'i gunceller. | `POST /api/settings` -> `{scope:"admin", key:"max_concurrent_jobs", value:N, locked:true}` |

#### Genel Ayar Listesi Aksiyonlari

| Aksiyon | API Endpoint | Store Metodu | Yetkilendirme |
|---------|-------------|--------------|---------------|
| Ayarlari yukle | `GET /api/settings?scope=admin&scope_id=` | `adminStore.fetchSettings("admin", "")` | `X-Admin-Pin` header |
| Ayar olustur | `POST /api/settings` | `adminStore.createSetting(payload)` | `X-Admin-Pin` header |
| Deger duzenle | `PUT /api/settings/{id}` | `adminStore.updateSetting(id, payload)` | `X-Admin-Pin` header |
| Kilit ac/kapat | `PUT /api/settings/{id}` | `adminStore.updateSetting(id, {locked})` | `X-Admin-Pin` header |
| Ayar sil | `DELETE /api/settings/{id}` | `adminStore.deleteSetting(id)` | `X-Admin-Pin` header |

#### Form Alanlari (Yeni Ayar Ekleme)

| Alan | Tipi | Aciklama |
|------|------|----------|
| `key` | text | Ayar anahtari |
| `value` | text / JSON | Ayar degeri |
| `description` | text | Aciklama |
| `locked` | checkbox | Kullanici tarafindan degistirilemez yapar |

---

### 3.3 ModuleManager

**Dosya:** `pages/admin/ModuleManager.tsx`

#### Moduller

- `standard_video` -- Standart Video
- `news_bulletin` -- Haber Bulteni
- `product_review` -- Urun Inceleme

#### Aksiyonlar

| Aksiyon | API Endpoint | Store Metodu | Yetkilendirme |
|---------|-------------|--------------|---------------|
| Modul ayarlarini yukle | `GET /api/settings?scope=module&scope_id={module}` | `adminStore.fetchSettings("module", module)` | `X-Admin-Pin` header |
| Aktif/Pasif degistir | `POST /api/settings` -> `scope=module`, `key=active`, `value=true/false` | `adminStore.createSetting()` | `X-Admin-Pin` header |
| Modul ayari ekle | `POST /api/settings` -> `scope=module`, `scope_id={module}` | `adminStore.createSetting()` | `X-Admin-Pin` header |
| Modul ayari duzenle | `PUT /api/settings/{id}` | `adminStore.updateSetting()` | `X-Admin-Pin` header |
| Modul ayari sil | `DELETE /api/settings/{id}` | `adminStore.deleteSetting()` | `X-Admin-Pin` header |

---

### 3.4 ProviderManager

**Dosya:** `pages/admin/ProviderManager.tsx`

#### Provider Kategorileri ve Providerlar

| Kategori | Providerlar |
|----------|-------------|
| LLM | `gemini`, `openai_llm` |
| TTS | `elevenlabs`, `openai_tts`, `edge_tts` |
| Visuals | `pexels`, `pixabay` |

#### Aksiyonlar

| Aksiyon | API Endpoint | Store Metodu | Yetkilendirme |
|---------|-------------|--------------|---------------|
| Provider ayarlarini yukle | `GET /api/settings?scope=provider&scope_id={provider}` | `adminStore.fetchSettings("provider", provider)` | `X-Admin-Pin` header |
| API anahtari kaydet | `POST /api/settings` -> `scope=provider`, `key=api_key` | `adminStore.createSetting()` | `X-Admin-Pin` header |
| Ayar duzenle | `PUT /api/settings/{id}` | `adminStore.updateSetting()` | `X-Admin-Pin` header |
| Ayar sil | `DELETE /api/settings/{id}` | `adminStore.deleteSetting()` | `X-Admin-Pin` header |
| Fallback siralamasi kaydet | `POST /api/settings` -> `scope=admin`, `key={kategori}_fallback_order` | `adminStore.createSetting()` | `X-Admin-Pin` header |

#### Hassas Alanlar

`api_key` alanlari `type=password` olarak render edilir. Yaninda Eye/EyeOff ikon butonu ile sifre gosterme/gizleme islevi saglanir.

---

### 3.5 AdminJobs

**Dosya:** `pages/admin/AdminJobs.tsx`

#### Aksiyonlar

| Aksiyon | API Endpoint | Store Metodu | Yetkilendirme |
|---------|-------------|--------------|---------------|
| Isleri yukle | `GET /api/jobs?page=X&page_size=20&status=Y&module_key=Z` | `jobStore.fetchJobs()` | -- |
| Is iptal et | `PATCH /api/jobs/{id}` -> `{status:"cancelled"}` | `jobStore.cancelJob(id)` | -- |
| Is sil | `DELETE /api/jobs/{id}` | `adminStore.deleteJob(id)` | `X-Admin-Pin` header |
| Toplu temizlik | Her terminal durumundaki is icin `DELETE` | `adminStore.deleteJob(id)` (her is icin) | `X-Admin-Pin` header |

---

## 4. Zustand Store -> API Haritasi

### useJobStore

| Metot | API Cagrisi | HTTP Metodu |
|-------|------------|-------------|
| `fetchJobs(params?)` | `/api/jobs?...` | `GET` |
| `fetchJobById(id)` | `/api/jobs/{id}` | `GET` |
| `fetchStats()` | `/api/jobs/stats` | `GET` |
| `createJob(payload)` | `/api/jobs` | `POST` |
| `cancelJob(id)` | `/api/jobs/{id}` | `PATCH` |
| `subscribeToJob(id)` | `/api/jobs/{id}/events` | SSE (`EventSource`) |

### useAdminStore

| Metot | API Cagrisi | HTTP Metodu | Yetkilendirme |
|-------|------------|-------------|---------------|
| `fetchSettings(scope, scopeId?)` | `/api/settings?scope=X&scope_id=Y` | `GET` | `X-Admin-Pin` header |
| `createSetting(payload)` | `/api/settings` | `POST` | `X-Admin-Pin` header |
| `updateSetting(id, payload)` | `/api/settings/{id}` | `PUT` | `X-Admin-Pin` header |
| `deleteSetting(id)` | `/api/settings/{id}` | `DELETE` | `X-Admin-Pin` header |
| `deleteJob(id)` | `/api/jobs/{id}` | `DELETE` | `X-Admin-Pin` header |

### useSettingsStore

| Metot | API Cagrisi | HTTP Metodu |
|-------|------------|-------------|
| `fetchResolvedSettings(moduleKey?)` | `/api/settings/resolved?module_key=X` | `GET` |

### useUIStore

| Metot | API Cagrisi | Kalicilik |
|-------|------------|-----------|
| `toggleTheme()` | -- | localStorage `"cm-ui"` |
| `toggleSidebar()` | -- | localStorage `"cm-ui"` |
| `unlockAdmin()` | -- | Yalnizca bellekte (in-memory) |
| `lockAdmin()` | -- | Yalnizca bellekte (in-memory) |
| `addToast(toast)` | -- | Yalnizca bellekte (in-memory) |

---

## 5. SSE Event Tipleri

### 5.1 Tekil Is SSE Kanali

**Endpoint:** `GET /api/jobs/{job_id}/events`

| Event | Veri Formati | Isleyici | Gorsel Etki |
|-------|-------------|----------|-------------|
| `job_status` | `{job_id, status, error_message?}` | `jobStore.updateJobStatus()` | Durum rozeti, ilerleme cubugu |
| `step_update` | `{job_id, key, status, message?, provider?, duration_ms?, cost_estimate_usd?, cached?}` | `jobStore.updateStep()` | Adim ikonu, sure, provider bilgisi |
| `log` | `{job_id, level, message, step?, timestamp}` | `jobStore.appendLog()` | Canli Log Viewer satiri |
| `render_progress` | `{phase, bundling_pct?, rendered_frames, total_frames, encoded_frames?, overall_pct, eta}` | `jobStore.updateRenderProgress()` | Composition adimi altinda `RenderProgressWidget` (yuzde + ETA cubugu) |
| `heartbeat` | `{}` | Islem yok | -- (keepalive) |
| `complete` | `{job_id}` | `jobStore.fetchJobById()` + SSE aboneligi sona erdirilir | -- |

### 5.2 Liste Ekranlari Canli Guncelleme (Faz 10.5)

Batch is senaryosunda JobList ve Dashboard, worker loop tarafından isletilen islerin durumunu yenileme yapılmadan gosterir.

| Sayfa | Mekanizma | Araliği | Tetiklenen Store Metotlari |
|-------|-----------|---------|--------------------------|
| Dashboard | `useInterval` polling | 5 sn | `jobStore.fetchStats()` + `jobStore.fetchJobs({page:1, page_size:10})` |
| JobList | `useInterval` polling | 5 sn | `jobStore.fetchJobs(mevcutFiltreler)` |
| JobDetail | SSE (`/api/jobs/{id}/events`) | Gercek zamanli | `updateJobStatus`, `updateStep`, `appendLog`, `updateRenderProgress` |

---

> Bu dokuman, ContentManager v0.8.0 kod tabani ile birebir eslesecek sekilde yazilmistir. Her UI elemani, ilgili API endpoint'i ve Zustand store metodu ile haritalandirilmistir. Faz 10.5 kapsaminda guncellenmistir.
