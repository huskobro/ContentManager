# ContentManager -- Mimari Karar Kayitlari (ADR)

> **Versiyon:** v0.7.0
> **Tarih:** 2026-03-29
> **Durum:** Aktif -- her yeni mimari karar bu dokumana eklenir.

Bu dokuman, ContentManager projesinde alinan her teknoloji ve tasarim kararini
**Architecture Decision Record (ADR)** formatinda kayit altina alir.

Her ADR su sorulari yanitlar:
- Neden bu yolu sectik?
- Alternatifleri neydi ve neden eledik?
- Hangi kosullarda bu karari tekrar degerlendirmemiz gerekir?

---

## Icerik

- [ADR-001: Backend Framework -- FastAPI](#adr-001-backend-framework--fastapi)
- [ADR-002: Veritabani -- SQLite WAL](#adr-002-veritabani--sqlite-wal)
- [ADR-003: Frontend Framework -- React + Vite](#adr-003-frontend-framework--react--vite)
- [ADR-004: CSS Framework -- Tailwind CSS + Radix UI](#adr-004-css-framework--tailwind-css--radix-ui)
- [ADR-005: State Management -- Zustand](#adr-005-state-management--zustand)
- [ADR-006: Video Composition -- Remotion](#adr-006-video-composition--remotion)
- [ADR-007: Job Queue -- In-Process asyncio + SQLite State](#adr-007-job-queue--in-process-asyncio--sqlite-state)
- [ADR-008: API Client -- Native Fetch](#adr-008-api-client--native-fetch)
- [ADR-009: Ayar Sistemi -- 5 Katmanli Override Hiyerarsisi](#adr-009-ayar-sistemi--5-katmanli-override-hiyerarsisi)
- [ADR-010: Pipeline Mimarisi -- Adim Tabanli Cache Idempotency](#adr-010-pipeline-mimarisi--adim-tabanli-cache-idempotency)
- [ADR-011: Modul Sistemi -- ABC + Registry Pattern](#adr-011-modul-sistemi--abc--registry-pattern)
- [ADR-012: Provider Sistemi -- Fallback Zinciri](#adr-012-provider-sistemi--fallback-zinciri)
- [ADR-013: Varsayilan TTS -- Edge TTS](#adr-013-varsayilan-tts--edge-tts)
- [ADR-014: Canli Guncelleme -- SSE (Server-Sent Events)](#adr-014-canli-guncelleme--sse-server-sent-events)
- [ADR-015: Loglama -- Yapilandirilmis JSON Logging](#adr-015-loglama--yapilandirilmis-json-logging)

---

## ADR-001: Backend Framework -- FastAPI

**Karar:** FastAPI (Python 3.13+)
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 1

### Baglam

ContentManager, 4 referans projenin (YTRobot, youtube_video_bot, YouTubeStoryGenerator,
YouTubeNewsGenerator) en iyi yonlerini birlestirmek uzere sifirdan tasarlandi. Bu 4 projeden
2'si Python tabanli (YTRobot, youtube_video_bot), 2'si JavaScript tabanli (YouTubeStoryGenerator,
YouTubeNewsGenerator). Ancak kritik farklilastirici faktor su: projenin dayandigi TTS, LLM ve
gorsel arama SDK'larinin buyuk cogunlugu Python ekosisteminde yasir. `google-generativeai`,
`edge-tts`, `openai`, `elevenlabs`, `pexels-api` gibi kutuphanelerin hepsi Python-first.

Backend dilini secerken temel kriter, **provider entegrasyonlarinin tek dilde yapilabilmesi**
ve async I/O'nun dogal olarak desteklenmesiydi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Express.js (Node.js)** | YouTubeStoryGenerator zaten JS; Remotion ile ayni runtime | Provider SDK'larinin cogu Python -- ikili dil yuku olusur. Her yeni provider entegrasyonunda "Python wrapper mi, JS re-implementation mi?" ikilemiyle karsilasirdik. |
| **Django** | Tam ozellikli admin paneli dahili, guclu ORM, `django-rest-framework` ile REST | Bu proje icin fazla agir. Django'nun ORM + template + admin + middleware yuku gereksiz. REST endpoint odakli bir yapiyi minimal tutmak istiyorduk. Django'nun senkron dogasi async pipeline isleri icin ek `channels` veya `asgiref` bagimliligi gerektirir. |
| **Flask** | Hafif, minimal, genis ekosistem | Async destegi zayif (Flask 2.x'te async view var ama native degil). FastAPI'nin Pydantic v2 ile otomatik validasyon, OpenAPI spec uretimi ve dependency injection sistemi Flask'in sunduklarindan ust. |

### Sonuc

FastAPI secildi. Temel gerekceleri:

- **Async native:** `async def` endpoint'leri ve `asyncio.create_task()` ile pipeline
  background job'lari dogal olarak desteklenir. Thread pool'a dusmeden I/O-bound islemleri
  verimli yonetiriz.
- **Pydantic v2 entegrasyonu:** Request/response modelleri `BaseModel` ile tanimlanir;
  hem runtime validasyonu hem de otomatik OpenAPI (Swagger UI) dokumantasyonu saglanir.
  Endpoint'lere gelen JSON otomatik olarak tip kontrolunden gecer.
- **Minimal boilerplate:** Bir CRUD endpoint 10-15 satirda tamamlanir. Django'daki
  serializer + view + url + model dongusu yok.
- **Dependency injection:** `Depends(get_db)` ile veritabani session'i, `Depends(verify_admin)`
  ile yetkilendirme temiz bir sekilde ayristirilir.
- **Tip guvenligi:** Python type hint'leri ile IDE (PyCharm, VS Code) tam destek saglar;
  refactoring guvenligi yuksek.

### Uygulama Detaylari

Backend'in giriS noktasi `backend/main.py`'dir. Pydantic Settings (`backend/config.py`)
`.env` dosyasindan ortam degiskenlerini okur ve `Settings` singleton'ini olusturur. CORS,
uvicorn konfigurasyonu ve router mount islemleri `main.py` lifespan event'inde yapilir.

```
backend/
  main.py              -- FastAPI app, lifespan, router mount
  config.py            -- Pydantic BaseSettings (Settings singleton)
  database.py          -- SQLAlchemy engine, SessionLocal, Base
  api/                 -- Router'lar (jobs, settings)
  models/              -- SQLAlchemy ORM modelleri
  services/            -- Is mantigi (JobManager, SettingsResolver)
  pipeline/            -- Pipeline runner, cache manager
  modules/             -- Icerik modulleri (standard_video, news_bulletin)
  providers/           -- Harici servis saglayicilari (LLM, TTS, Visuals)
  utils/               -- Logger, yardimci fonksiyonlar
```

### Tekrar Degerlendirme Kosullari

- Eger gelecekte Node.js-only bir provider kritik hale gelirse (ornegin Remotion'in
  server-side rendering'i dogal entegrasyon gerektirirse), Node.js microservice eklenmesi
  degerlendirilir. Ancak backend tamamiyla degistirilmez.

---

## ADR-002: Veritabani -- SQLite WAL

**Karar:** SQLite 3.x, WAL (Write-Ahead Logging) modu
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 1

### Baglam

ContentManager bir localhost-first uygulamadir. Kullanicinin kendi bilgisayarinda calisir;
dis sunucuya bagimlilik minimumda tutulur. Ayni anda en fazla 2 pipeline job'u esanli calisir
(`max_concurrent_jobs=2`). Bu kosullarda PostgreSQL veya MongoDB gibi ayri bir veritabani
sunucusu kurmak ve yonetmek gereksiz karmasiklik olusturur.

YTRobot'taki `stats.json` deneyimi de yol gostericiydi: JSON dosyalarina concurrent yazma
veri bozulmasina neden oldu. Yapisal bir veritabani zorunluydu ama agir bir cozum istemiyorduk.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **PostgreSQL** | Tam ACID, JSON/JSONB sutunlari, guclu SQL | Ayri sunucu kurulumu ve yonetimi gerektirir. Localhost-first prensibine aykiri; kullanicidan `brew install postgresql` beklemek UX'i bozar. |
| **Redis** | Hizli KV store, pub/sub, TTL | Kalici iliskisel veri icin uygun degil. Job steps, settings gibi tablolar gerekiyor. Ek process (`redis-server`) bagimliligi. |
| **JSON dosyalari** | Sifir bagimlilik, okunabilir | Concurrent yazma corrupsiyonu (YTRobot'ta stats.json ile kanitlandi). Transaction yok, ACID yok. |
| **MongoDB** | Esnek sema, dokumanlar | Ayri sunucu (`mongod`), localhost-first ihlali. Iliskisel sorgular (job -> steps -> settings) icin MongoDB uygun degil. |
| **DuckDB** | Analitik sorgularda hizli, embedded | OLAP odakli; OLTP (sik INSERT/UPDATE) kullanim icin optimize degil. Concurrent write destegi sinirli. |

### Sonuc

SQLite WAL modu secildi. Gerekceleri:

- **Sifir kurulum:** Tek `.db` dosyasi. Kullanicidan ekstra bir sey kurmasini istemiyoruz.
  `pip install` ile gelen SQLAlchemy + built-in `sqlite3` modulu yeterli.
- **Concurrent read/write:** WAL modu, bir writer calisirken birden fazla reader'in
  ayni anda okuma yapabilmesini saglar. 2 esanli job icin yeterli.
- **FastAPI uyumlulugu:** `check_same_thread=False` ve `pool_pre_ping=True` ile
  SQLAlchemy engine'i FastAPI'nin async worker'lariyla sorunsuz calisir.
- **Tek dosya yedekleme:** Veritabani dosyasini kopyalamak = tam yedekleme. Dump/restore
  gereksiz.

### PRAGMA Konfigurasyonu

Her yeni baglantida asagidaki PRAGMA'lar uygulanir (`backend/database.py`):

```
PRAGMA journal_mode=WAL      -- Write-Ahead Logging: concurrent read/write
PRAGMA synchronous=NORMAL    -- Performans/guvenlik dengesi (WAL ile yeterli)
PRAGMA foreign_keys=ON       -- Referans butunlugu zorunlu
PRAGMA cache_size=-64000     -- ~64 MB sayfa cache'i (varsayilan 2 MB'dan yuksek)
PRAGMA temp_store=MEMORY     -- Gecici tablolari RAM'de tut
```

### Sema Yapisi

```
jobs               -- Pipeline is kayitlari (id, module_key, status, title, ...)
job_steps          -- Her isin pipeline adimlari (job_id FK, key, status, ...)
settings           -- 5 katmanli ayar tablosu (scope, scope_id, key, value, locked)
```

### Tekrar Degerlendirme Kosullari

- Eger kullanici sayisi 1'den fazlaya cikar (multi-user senaryo) veya concurrent job
  sayisi 10+'a ulasirsa, PostgreSQL'e gecis degerlendirilir. SQLAlchemy ORM katmani
  bu gecisi kolaylastirir -- sadece engine URL'si degisir.

---

## ADR-003: Frontend Framework -- React + Vite

**Karar:** React 18 + Vite 5 + TypeScript (strict mode)
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 2

### Baglam

ContentManager'in video kompozisyon motoru Remotion'dur. Remotion React tabanlidir --
video sahneleri React bilesenleri olarak tanimlanir. Frontend ile Remotion arasinda tip
tanimlari, bilesenler ve genel React ekosistemine asinalik paylasimi icin ayni framework
kullanmak mantiklidir.

YTRobot'un en buyuk zayifligi, 5300+ satirlik monolitik `index.html` dosyasiydi. Vanilla JS
ile baslayip buyuyen projelerin bakimi ve genisletilmesi imkansiz hale geliyor. ContentManager
bu hatadan ders alarak basindan itibaren bilesen tabanli mimariye gecildi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Vue 3 + Vite** | Daha dusuk ogrenme egrisi, Composition API | Remotion sadece React destekliyor. Iki farkli UI framework tutmak (Vue dashboard + React Remotion) gereksiz karmasiklik. |
| **Svelte / SvelteKit** | Mukemmel performans, minimal bundle, derleyici odakli | Remotion ile uyumsuz. Daha kucuk ekosistem; UI bilesen kutuphaneleri sinirli. |
| **Next.js** | SSR, dosya tabanli routing, API routes | Localhost uygulamasi icin SSR gereksiz. Backend zaten FastAPI; Next.js'in API route'lari kullanilmayacak. Gereksiz karmasiklik eklerdik. |
| **Vanilla JS** (YTRobot yaklas.) | Sifir bagimlilik, aninda baslangic | YTRobot'un 5300 satirlik monolitik HTML'i bu yaklasiMin olceklenemeyecegini kanitladi. Bilesen ayristirmasi, state yonetimi ve tip guvenligi sifir. |

### Sonuc

React 18 + Vite 5 + TypeScript secildi:

- **Remotion uyumu:** Remotion bilesenleri React'tir. Ayni JSX/TSX syntax'i, ayni hook'lar,
  ayni tip sistemi. Frontend gelistiricisi Remotion sablonlarini yazmak icin framework
  degistirmez.
- **Vite HMR:** Hot Module Replacement ile degisiklikler <100ms'de tarayiciya yansir.
  Webpack'e gore cok daha hizli gelistirme dongusu.
- **TypeScript strict mode:** `strict: true`, `noUncheckedIndexedAccess: true` ile
  runtime hatalarinin buyuk kismi derleme zamaninda yakalanir. API response tipleri
  backend'in Pydantic modelleriyle eslestirilir.
- **Zengin ekosistem:** Radix UI, Tailwind CSS, Zustand, React Router -- hepsi
  React-first kutuphaneler.

### Dizin Yapisi

```
frontend/src/
  main.tsx             -- React root, router mount
  App.tsx              -- Route tanimlari, layout
  api/client.ts        -- Fetch wrapper + SSE helper
  components/layout/   -- AppShell, Sidebar, Header
  pages/user/          -- Dashboard, CreateVideo, JobList, JobDetail, UserSettings
  pages/admin/         -- AdminDashboard, GlobalSettings, ModuleManager, ProviderManager
  stores/              -- Zustand store'lari (uiStore, jobStore, settingsStore, adminStore)
  lib/utils.ts         -- Yardimci fonksiyonlar
```

### Tekrar Degerlendirme Kosullari

- Eger Remotion React destegini durursa (cok dusuk olasilik) veya framework-agnostik
  bir video motoru cikip ustun avantajlar saglasa, frontend framework secimi gozden gecirilir.

---

## ADR-004: CSS Framework -- Tailwind CSS + Radix UI

**Karar:** Tailwind CSS 3 + CSS degisken tabanli tema + Radix UI headless primitives
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 2

### Baglam

ContentManager'in UI gereksinimleri: dark mode zorunlu, modern minimalist tasarim, erisilebilir
bilesenler (dropdown, dialog, tooltip), hizli stil iterasyonu. Agir bir bilesen kutuphanesi
yerine "utility-first CSS + headless primitives" yaklasimi tercih edildi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Material UI (MUI)** | Kapsamli bilesen seti, Google tasarim dili | Agir bundle (~300 KB gzipped), opinionated tasarim dili (Material), ozellestirme maliyeti yuksek. CSS-in-JS runtime maliyeti var. |
| **Ant Design** | Enterprise UI, kapsamli form bilesenleri | Bundle boyutu buyuk. Cin ekosistemi odakli. Dark mode gecmiste sorunluydu (v5 ile iyilesti ama hala runtime theme degisimi agir). |
| **Chakra UI** | Tailwind'e benzer utility yaklasim, erisilebilirlik | Tailwind kadar esnek degil, daha buyuk runtime. Style props yaklasiMi buyuk projelerde performans sorunlari yaratabilir. |
| **Saf CSS / CSS Modules** | Tam kontrol, sifir bagimlilik | Bakimi cok pahali. Dark mode, responsive tasarim, tutarli renk paleti icin buyuk miktar el yazimi CSS gerekir. |

### Sonuc

Tailwind CSS 3 + Radix UI + Shadcn "kopyala-sahiplen" yaklasimi:

- **Tailwind -- sifir runtime:** Tum stil class'lari build-time'da cikarilir. Bundle'a
  eklenen sadece kullanilan class'lardir (PurgeCSS entegrasyonu). Dark mode: `class`
  stratejisi ile CSS degisken toggle'i.
- **Radix UI -- headless primitives:** `Dialog`, `DropdownMenu`, `Tooltip`, `Select` gibi
  erislebilir (WAI-ARIA uyumlu) bilesenler, gorunumden bagimsiz. Stil tamamen Tailwind
  class'lariyla kontrol edilir.
- **Shadcn yaklasimi:** Bilesenler npm paketi olarak indirilmez, projeye **kopyalanir ve
  sahiplenilir**. Bu, tam ozellestirme ozgurlugu saglar ve bagimlilik zincirini kirar.
- **CSS degiskenleri ile tema:** `:root` ve `.dark` scope'larinda `--background`, `--foreground`,
  `--primary` gibi degiskenler tanimlanir. Tema degisikligi tek bir CSS class toggle'i ile yapilir.

### Tekrar Degerlendirme Kosullari

- Eger tasarim sistemi cok karmasik hale gelir ve tutarlilik sorunlari baslarsa,
  daha opinionated bir kutuphanele (Ark UI, Park UI) degerlendirilebilir.

---

## ADR-005: State Management -- Zustand

**Karar:** Zustand 5 + persist middleware
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 2

### Baglam

Frontend'de 4 ayri state alani var: UI state (sidebar acik/kapali, tema, bildirimler),
job state (aktif is listesi, ilerleme), settings state (kullanici ayarlari, form degerleri),
admin state (admin paneli verileri, provider durumu). Bunlar birbirinden bagimsiz; karmasik
normalized state veya middleware zinciri gerekmiyor.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Redux Toolkit** | Endustri standardi, guclu DevTools | Bu olcek icin fazla boilerplate. Slice tanimla, reducer yaz, action cagir, selector tanimla... 4 basit store icin asiri muhendislik. |
| **Jotai** | Atom bazli, minimal API, React Suspense uyumu | Persist kaliplari daha az olgun. Birden fazla atom'un birleste koordinasyonu icin ek soyutlama gerekiyor. |
| **React Context + useReducer** | Sifir dis bagimlilik | Re-render optimizasyonu zor. Her context degisiminde tuketici bilesenlerin tamami yeniden cizilir. Provider cehennemli (`<ThemeProvider><AuthProvider><JobProvider>...`). |
| **MobX** | Otomatik reaktivite, dekorator syntax | Proxy tabanli; debugging'de "neden bu degisti?" sorusunu yanıtlamak zor. Bundle boyutu daha buyuk. |
| **Valtio** | Proxy tabanli, minimal | MobX ile ayni proxy sorunlari. TypeScript tip cikarimi bazi durumlarda zayif. |

### Sonuc

Zustand secildi:

- **Minimal API:** Bir store tanimlamak icin `create()` fonksiyonu ve bir obje yeterli.
  Redux'in slice/action/reducer seremoni yok.
- **Selector tabanli re-render:** `useJobStore(state => state.activeJob)` ile sadece
  ilgili state degistiginde bilesen yeniden cizilir. Context'teki "her sey degisiyor"
  sorunu yok.
- **Persist middleware:** `persist(...)` ile localStorage'a otomatik senkronizasyon.
  Kullanici ayarlari ve UI tercihleri sayfa yenilenmelerinde korunur.
- **DevTools:** Redux DevTools'a baglanti destegi -- state degisimlerini zaman
  yolculuguyla inceleme imkani.
- **TypeScript guvenligi:** Store tipi `create<StoreType>()` ile tanimlanir;
  selector'lar ve action'lar tip kontrolunden gecer.

### Store Yapisi

```
stores/
  uiStore.ts        -- Tema, sidebar, bildirimler, modal state
  jobStore.ts       -- Aktif isler, ilerleme, SSE baglantisi
  settingsStore.ts  -- Kullanici ayarlari, form state
  adminStore.ts     -- Admin paneli state, provider durumu
```

### Tekrar Degerlendirme Kosullari

- Eger store sayisi 8+'a cikar ve store'lar arasi bagimliliklar karmasiklasirsa,
  Redux Toolkit veya daha yapisal bir cozum degerlendirilebilir.

---

## ADR-006: Video Composition -- Remotion

**Karar:** Remotion 4.0.290
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 1

### Baglam

YTRobot'ta Remotion zaten kullaniliyor ve sofistike animasyonlar (Ken Burns zoom/pan,
karaoke altyazi) sagliyor. youtube_video_bot'ta MoviePy kullaniliyor ama rendering suresi
uzun ve animasyon secenekleri sinirli. ContentManager icin en iyi video motoru secilmeliydi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **MoviePy** | Saf Python, basit API, FFmpeg wrapper | Yavas rendering (CPU-intensive Python dongusu). Ken Burns, paralaks gibi karmasik animasyonlari yapmak zor. Her karede piksel manipulasyonu -- 1080p video icin dakikalar suruyor. |
| **FFmpeg dogrudan** | En hizli, tam kontrol, sifir overhead | `filter_complex` chain'leri cok karmasik ve bakim gotu. Ken Burns animasyonu icin 200+ satirlik filtre dizisi gerekiyor. Hata ayiklama neredeyse imkansiz. |
| **Shotstack API** | Bulut rendering, olceklenebilir | Localhost-first prensibine aykiri. Her render icin API maliyeti var. Offline calisma imkani yok. |
| **Remotion + AWS Lambda** | Dagitik rendering | Maliyet ve karmasiklik. Localhost kullanimi icin gereksiz. Ama gelecekte opsiyonel olarak eklenebilir. |

### Sonuc

Remotion secildi:

- **React tabanli:** Video sahneleri React bilesenleri olarak yazilir. Frontend ile ayni
  JSX/TSX syntax'i, ayni tip sistemi. `calculateMetadata()` ile dinamik video suresi
  hesaplanir.
- **Programatik animasyon:** `useCurrentFrame()` ve `interpolate()` ile her kare icin
  CSS transform, opacity, scale degerleri hesaplanir. Ken Burns, karaoke highlight,
  fade-in/out gibi animasyonlar deklaratif.
- **Headless rendering:** `npx remotion render` komutu ile CLI'dan video uretilir.
  Tarayici gerektirmez (Chromium headless). Backend'in `composition` pipeline adimindan
  subprocess olarak cagrilir.
- **Konfigurasyonla kontrol:** Codec (H.264), CRF (18), FPS (30), cozunurluk (1920x1080)
  ayarlari config'den okunur. ANGLE OpenGL renderer ile GPU hizlandirma.
- **Tip paylasimi:** Video sahnesi props'lari TypeScript ile tanimlanir;
  backend'den gelen JSON verisiyle tip guvenligi saglanir.

### Dizin Yapisi

```
remotion/
  src/
    compositions/     -- Video sablonlari (StandardVideo, NewsBulletin, ...)
    components/       -- Paylasilan bilesen parcalari (KenBurns, SubtitleOverlay, ...)
    types/            -- Props ve config tip tanimlari
  remotion.config.ts  -- Remotion build konfigurasyonu
```

### Tekrar Degerlendirme Kosullari

- Eger rendering suresi kritik hale gelir ve bulut rendering zorunlu olursa,
  Remotion Lambda entegrasyonu eklenebilir (Remotion'in destekledigi bir ozellik).

---

## ADR-007: Job Queue -- In-Process asyncio + SQLite State

**Karar:** asyncio background task'lari + SQLite state persistence (harici broker yok)
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 3

### Baglam

Video pipeline'i 6 adimdan (script, metadata, TTS, visuals, subtitles, composition)
olusur ve bir is 10-30 dakika surebilir. Bu sure zarfinda uygulama kapanabilir, cokebilir
veya yeniden baslayabilir. Yarim kalan islerin kaybolmamasi gerekiyor.

Ancak kullanici Redis, Celery veya RabbitMQ gibi harici broker'lar istemiyordu. Localhost-first
felsefesine uygun, sifir dis bagimlilikla calisan bir cozum gerekiyordu.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Celery + Redis** | Dagitik, olceklenebilir, retry/dead letter | 2 ekstra process gerektirir (`redis-server` + `celery worker`). Localhost-first icin asiri karmasiklik. Kurulum proseduru kullaniciyi kaybeder. |
| **Dramatiq + Redis** | Celery'den hafif, basit API | Yine Redis bagimliligi. Tek kullanici, 2 concurrent job icin Redis overhead gereksiz. |
| **asyncio.Queue (YTRobot yaklasimi)** | Basit, sifir bagimlilik | Uygulama kapaninca tum is durumu kaybolur. Yarim kalan is recovery imkani yok. YTRobot'ta bu sorunla karsilasildiktan sonra elenmiS. |
| **APScheduler** | Zamanlama destegi, SQLite backend | Job state persistence sinirli. Karmasik pipeline adim yonetimi icin yeterli soyutlama yok. |
| **Huey** | SQLite backend destekli kuyruk | Daha olgun ama async destegi sinirli. FastAPI'nin async yapilanmasiyla uyumsuzluk potansiyeli. |

### Sonuc

Hibrit yaklasim secildi: **asyncio in-process + SQLite persistence**.

- **Is baslama:** `asyncio.create_task(run_pipeline(job_id))` ile pipeline background'da
  baslatilir. Ayri worker process yok; FastAPI'nin event loop'u icerisinde calisir.
- **State persistence:** Her adimin durumu SQLite `job_steps` tablosunda guncellenir
  (`pending` -> `running` -> `completed`/`failed`/`skipped`). Uygulama kapanip acildiginda
  `running` durumdaki isler tespit edilir.
- **Crash recovery:** Yeniden baslamada `running` durumdaki job'lar bulunur. Her adim cache
  kontrolu yapildigi icin (ADR-010), tamamlanmis adimlar atlanir ve kalan adimlardan devam edilir.
- **Durum gecis kurallari:** `_VALID_TRANSITIONS` dict'i ile gecersiz durum gecisleri (ornegin
  `completed` -> `running`) reddedilir. Bu, veri tutarliligini saglar.
- **SSE entegrasyonu:** `_SSEHub` sinifi her job icin subscriber kuyruklari tutar. Durum
  degisiklikleri aninda frontend'e SSE event olarak yayinlanir.

### Durum Makine Diyagrami

```
  queued -----> running -----> completed
    ^            |   |
    |            |   +-------> failed
    |            |                |
    +------------+                |
    |                             |
    +-----------------------------+
    |
    +--- cancelled <--- running
    +--- cancelled <--- queued
```

### Tekrar Degerlendirme Kosullari

- Eger concurrent job sayisi 5+'a cikar veya dagitik calisma gerekirse (birden fazla
  makinede rendering), Celery + Redis veya Dramatiq + Redis degerlendirilebilir.

---

## ADR-008: API Client -- Native Fetch

**Karar:** Native `fetch` API etrafinda ozel wrapper (`api/client.ts`, ~196 satir)
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 2

### Baglam

Frontend'in backend ile iletisimi tamamen ayni origin uzerinden gerceklesir (Vite dev server
proxy veya production'da ayni sunucu). Tum istekler `/api` prefix'i ile yapilir. Karmasik
interceptor zincirleri, request retry veya cache mekanizmalari gerekmiyor.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Axios** | Interceptor'lar, request/response transform, timeout, iptal | 15 KB ek bundle. Bu projedeki basit GET/POST kaliplari icin gereksiz agirlik. Interceptor'lara ihtiyacimiz yok. |
| **ky** | Fetch ustu hafif wrapper, retry, hook'lar | Ek bagimlilik. Fetch uzerine wrapper yazmak zaten cok kisa (<200 satir). |
| **tRPC** | End-to-end tip guvenligi, otomatik client uretimi | Sadece TypeScript backend'lerle calisir. Backend'imiz FastAPI (Python). |
| **openapi-typescript-fetch** | OpenAPI spec'ten client uretimi | Ek build adimi ve bagimlilik. FastAPI'nin OpenAPI spec'i basit ve degisken; otomatik uretim bakim yuku olusturur. |

### Sonuc

Ozel fetch wrapper secildi:

- **`APIError` sinifi:** HTTP 4xx/5xx yanitlari `APIError` exception'ina donusur.
  `status`, `message` ve `body` alanlariyla hata ayiklama kolaydir.
- **`openSSE()` helper:** Server-Sent Events icin native `EventSource` API'si kullanilir.
  Named event listener'lari (`job_status`, `step_update`, `log`, `heartbeat`, `complete`)
  ile backend'in SSE event tiplerini dinler. Baglanti kapandiginda otomatik temizlik yapar.
- **Admin PIN header:** `X-Admin-Pin` header'i `options.adminPin` parametresiyle eklenir.
  Admin endpoint'lerine erisim icin PIN dogrulamasi saglanir.
- **Tip guvenligi:** `request<T>()` generic fonksiyonu ile response tipi derleme zamaninda
  belirlenir: `api.get<Job[]>("/jobs")`.
- **Sifir bagimlilik:** Bundle'a ekstra KB eklenmez.

### Tekrar Degerlendirme Kosullari

- Eger API'nin karmasikligi artar (retry, cache, interceptor ihtiyaci) veya birden fazla
  backend servisiyle iletisim gerekirse, ky veya openapi-typescript-fetch degerlendirilir.

---

## ADR-009: Ayar Sistemi -- 5 Katmanli Override Hiyerarsisi

**Karar:** Global -> Admin -> Module -> Provider -> User override hiyerarsisi
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 3

### Baglam

YTRobot'ta 5 katmanli ama **kirik** bir ayar sistemi vardi. `config.py` + `.env` +
channel settings + presets + request params katmanlari vardi ama birbirleriyle nasil
etkilestikleri tanimlanmamisti. Bilinen sorunlar:

- **Preset bug'lari:** Bir preset uygulanadiginda onceki ayarlarin bir kismi kaliyordu.
- **`.env` uzerine yazma:** Admin panelinden yapilan degisiklikler `.env` dosyasini
  dograda modify ediyordu; yeniden baslamada bazi ayarlar kaybediliyordu.
- **Izlenebilirlik yok:** Hangi ayarin hangi katmandan geldigini anlama imkani yoktu.

ContentManager bu sorunlari yapısal olarak cozmek icin tasarlandi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Duz .env + config.py** | Basit, anlasilir | YTRobot'ta kanitlanan sorunlar: katman etkilesimi tanimlanmamis, .env uzerine yazma veri kaybi, izlenebilirlik yok. |
| **YAML konfigurasyonu** | Insanlar tarafindan okunabilir, hiyerarSik | Dinamik degisiklikler (admin panelinden) icin dosya yazmak gerekiyor. Concurrent erisim sorunu. Veritabani kadar guvenli degil. |
| **Consul / etcd** | Dagitik konfigurasyonu yonetimi, watch mekanizmasi | Harici servis. Localhost-first ihlali. Tek kullanici icin asiri muhendislik. |
| **Tek seviye DB ayarlari** | Basit CRUD | Farkli baglamlarda (modul, provider) farkli varsayilanlarin tanimlanamamasi. "news_bulletin icin TTS sesi farkli olsun" gibi ihtiyaclari karsilamaz. |

### Sonuc

5 katmanli SQLite-backed override sistemi secildi.

**Katman Hiyerarsisi (dusuk -> yuksek oncelik):**

```
Katman 1: _GLOBAL_DEFAULTS (config.py hardcoded)
    |  language="tr", tts_provider="edge_tts", video_fps=30, ...
    v
Katman 2: Admin (scope="admin", scope_id="")
    |  Admin panelinden girilen sistem geneli varsayimlar
    v
Katman 3: Module (scope="module", scope_id="standard_video")
    |  Module ozgu ayarlar (news_bulletin farkli TTS sesi kullanabilir)
    v
Katman 4: Provider (scope="provider", scope_id="elevenlabs")
    |  Provider'a ozgu ayarlar (ElevenLabs'in ozel ses ayarlari)
    v
Katman 5: User (scope="user", scope_id="")
    |  Kullanici override'lari (en yuksek oncelik)
```

**Uygulama Detaylari:**

- **Tek tablo:** `settings` tablosu `(scope, scope_id, key)` uclusuyle benzersiz constraint.
  Tum katmanlar ayni tabloda saklanir; scope ile filtrelenir.
- **SettingsResolver:** `resolve(module_key, provider_key, user_overrides)` metodu 5 katmani
  sirasiyla uygular ve nihai `dict[str, Any]` dondurur.
- **Kilitleme:** Admin tarafindan `locked=True` isaretlenen anahtarlar kullanici tarafindan
  override edilemez. Kilitleme denemesi loglanir ve reddedilir.
- **JSON encoding:** Tum degerler `Setting.value` sutununda JSON-encoded string olarak
  saklanir. `_decode_value()` ile Python nesnesine cevirilir.
- **Snapshot:** Job olusturulurken resolved settings JSON olarak `job.resolved_settings_json`'a
  yazilir. Pipeline calisirken ayar degisiklikleri mevcut isi etkilemez.

### Tekrar Degerlendirme Kosullari

- Eger multi-user senaryoya gecilirse, "user" katmaninin kullanici bazli (scope_id=user_id)
  olarak genisletilmesi gerekir. Mevcut yapi bunu destekleyecek sekilde tasarlandi.

---

## ADR-010: Pipeline Mimarisi -- Adim Tabanli Cache Idempotency

**Karar:** Sirali adim yurutme, adim bazli onbellekleme, fatal/non-fatal ayrimi
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 5

### Baglam

Video pipeline'i 6 adimdan olusur: script (senaryo uretimi), metadata (baslik/aciklama/tag),
TTS (ses sentezi), visuals (gorsel indirme), subtitles (altyazi olusturma), composition
(video birlesturme). Bazi adimlar birbagimli (composition icin TTS ve visuals tamamlanmis
olmali), bazi adimlar opsiyoneldir (metadata uretimi basarisiz olursa video hala uretilebiilir).

Pipeline'in crash recovery desteklemesi gerekiyordu: uygulama 4. adimda cokerse, yeniden
basladiginda 1-3. adimlari tekrarlamadan 4. adimdan devam edebilmeliydi.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **DAG tabanli (Airflow stili)** | Paralel yurutme, karmasik bagimlilik grafigi | 6 sirali adim icin asiri muhendislik. Bagimliliklarin cogu lineer. Airflow'un scheduler + database + web UI overhead'i localhost icin gereksiz. |
| **Event-driven (pub/sub)** | Gevsek baglasim, olceklenebilirlik | 6 sirali adim icin pub/sub karmasiklik ekler. Event kaybi riski, siralama garantisi ek caba gerektirir. |
| **Monolitik fonksiyon** | Basit, tek async fonksiyon | Crash recovery yok. Bir adim basarisiz olursa basindan baslamak gerekir. Partial retry imkansiz. |
| **Makefile / Task Runner** | Deklaratif bagimlilik, shell komutu yurutme | Python ekosistemiyle entegrasyon zayif. Async I/O, SSE guncelleme, veritabani state yonetimi icin uygun degil. |

### Sonuc

Sirali adim yurutme + cache idempotency secildi.

**Calisma Prensibi:**

1. `run_pipeline(job_id)` fonksiyonu `asyncio.create_task()` ile background'da baslar.
2. Modülden `get_pipeline_steps()` ile adim tanimlari (`PipelineStepDef`) alinir.
3. Her adim icin:
   - **Cache kontrolu:** `CacheManager.has_output(step_key)` ve DB'deki step durumu kontrol edilir.
     Tamamlanmis adim atlanir (`duration_ms=0`, `cached=True`).
   - **Yurutme:** `step_def.execute(job_id, step_key, config, cache)` cagirilir.
   - **Basari:** DB'de step durumu `completed` yapilir, SSE event yayinlanir.
   - **Hata:** Fatal adim ise job `failed` olur. Non-fatal ise adim `skipped` yapilir ve
     pipeline devam eder.
4. Tum adimlar basarili ise job `completed` yapilir.

**Fatal vs Non-Fatal Adimlar:**

| Adim | Fatal? | Aciklama |
|------|--------|----------|
| script | Evet | Senaryo olmadan video uretilemez |
| metadata | Hayir | Baslik/aciklama sonradan eklenebilir |
| tts | Evet | Ses olmadan video kompozisyon yapilamaz |
| visuals | Evet | Gorsel olmadan video kompozisyon yapilamaz |
| subtitles | Hayir | Altyazisiz video kabul edilebilir |
| composition | Evet | Video birlesturme basarisiz = is basarisiz |

**Cache Dosya Yapisi:**

```
sessions/{job_id}/
  step_script.json          -- Senaryo verisi (sahneler, diyaloglar)
  step_metadata.json        -- Baslik, aciklama, etiketler
  step_tts/                 -- Sahne bazli ses dosyalari
    scene_01.mp3
    scene_02.mp3
  step_visuals/             -- Sahne bazli gorsel/video dosyalari
    scene_01.mp4
    scene_02.jpg
  step_subtitles.json       -- Kelime zamanlamali altyazi verisi
  step_composition/         -- Final video
    final.mp4
```

**Idempotency Garantisi:** Her adim fonksiyonu `(job_id, step_key, config, cache)` imzasina
sahiptir. Ayni girdiyle tekrar cagrildiginda cache'den donus yapar. Bu sayede partial retry
guvenlidir -- tamamlanmis adimlar tekrarlanmaz.

### Ilgili Dosyalar

- `backend/pipeline/runner.py` -- PipelineRunner (run_pipeline, _execute_step)
- `backend/pipeline/cache.py` -- CacheManager (save_json, load_json, save_binary, has_output)

### Tekrar Degerlendirme Kosullari

- Eger adim sayisi 10+'a cikar ve bazi adimlar paralel calisabilir hale gelirse,
  DAG-tabanli yurutme degerlendirilir. Mevcut mimaride paralel adim destegi eklemek
  icin `_execute_step` yapisi korunarak `asyncio.gather()` ile grup yurutme eklenebilir.

---

## ADR-011: Modul Sistemi -- ABC + Registry Pattern

**Karar:** `ContentModule` abstract base class + explicit `ModuleRegistry`
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 5

### Baglam

ContentManager birden fazla icerik tipi destekler: `standard_video` (standart YouTube videosu),
`news_bulletin` (haber bulteni), `product_review` (urun incelemesi). Her icerik tipi farkli
pipeline adimlari, farkli varsayilan ayarlar ve farkli capability'lere sahip olabilir.

Ornegin `news_bulletin` modulu 10 haber kaynagindan scraping + ozet uretimi adimlari icerebilir;
`standard_video` bunlara ihtiyac duymaz. Bu cesitliligi yonetmek icin genisletilebilir bir
modul sistemi gerekiyordu.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Plugin autodiscovery (`entry_points`, `importlib`)** | Otomatik bulma, loose coupling | "Sihirli" calisma mekanizmasi -- hata ayiklama zor. Bir modul bulunamazsa sessizce atlanir mi, hata mi verir? IDE navigasyonu kirilir (Go to Definition calismaz). |
| **Konfigurasyaon tabanli (YAML/JSON)** | Deklaratif, kod-disi tanimlama | Tip guvenligi kaybolur. Pipeline step fonksiyonlari string olarak referans edilmek zorunda kalir. IDE destegi (otomatik tamamlama, refactoring) sifir. |
| **Tek modul hardcoded** | Basit, anlasilir | Genisletilebilir degil. Her yeni icerik tipi icin runner kodunu degistirmek gerekir. |
| **Dekorator tabanli kayit** | `@register_module` ile otomatik | Import sirasina bagimlilik. Circular import riski. Explicit olmamasi hata ayiklamayi zorlastirir. |

### Sonuc

ABC + explicit registry secildi:

- **ContentModule ABC:** Her modul `name`, `display_name`, `description`, `capabilities`
  class-level alanlari ve `get_pipeline_steps()`, `get_default_config()` abstract metotlarini
  implement etmek zorundadir. Tip guvenligi saVlanir.

- **Capability enum:** 8 capability tipi tanimlanmistir:

  | Capability | Aciklama |
  |-----------|----------|
  | `SCRIPT_GENERATION` | Senaryo uretimi (LLM) |
  | `METADATA_GENERATION` | Baslik/aciklama/tag uretimi |
  | `TTS` | Ses sentezi |
  | `VISUALS` | Gorsel/video indirme |
  | `SUBTITLES` | Altyazi olusturma |
  | `COMPOSITION` | Video birlestirme |
  | `THUMBNAIL` | Kucuk resim olusturma |
  | `PUBLISH` | YouTube'a yukleme |

- **PipelineStepDef dataclass:** Her adim `key`, `label`, `order`, `capability`,
  `execute` (async callable), `is_fatal`, `default_provider` alanlariyla tanimlanir.
  Pipeline runner bu dataclass'lari okur ve sirasiyla calistirir.

- **ModuleRegistry:** Dict tabanli, explicit import ile kayit. Yeni modul eklemek icin:
  1. `backend/modules/<modul_adi>/` dizini olustur
  2. `ContentModule` alt sinifini yaz
  3. `backend/modules/registry.py`'ye import ve register satiri ekle

- **IDE navigasyonu:** "Go to Definition" ile modul sinifina, step fonksiyonuna, capability
  enum'una hizla ulasılabilir. Sihirli autodiscovery yok.

### Dizin Yapisi

```
backend/modules/
  base.py                    -- ContentModule ABC, Capability enum, PipelineStepDef
  registry.py                -- ModuleRegistry, get_module()
  standard_video/
    __init__.py              -- StandardVideoModule sinifi
    config.py                -- Modul-ozgu varsayilan ayarlar
    pipeline.py              -- Pipeline step fonksiyonlari
  news_bulletin/
    __init__.py              -- NewsBulletinModule sinifi
  product_review/
    __init__.py              -- ProductReviewModule sinifi
```

### Tekrar Degerlendirme Kosullari

- Eger ucuncu parti gelistiriciler modul eklemesi gerekirse (plugin marketplace senaryosu),
  entry_points veya dinamik import mekanizmasi degerlendirilir. Mevcut yapiyla bu ihtiyac yok.

---

## ADR-012: Provider Sistemi -- Fallback Zinciri

**Karar:** `BaseProvider` ABC + `ProviderRegistry` + `execute_with_fallback()` ile 3 yonlu siralama
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 6

### Baglam

ContentManager birden fazla harici servisi destekler: LLM (Gemini, OpenAI), TTS (Edge TTS,
ElevenLabs, OpenAI TTS), Visuals (Pexels, Pixabay). Her kategori icin birden fazla provider
olabilir ve birincil provider basarisiz olursa sıradakinin denenmesi (fallback) gerekir.

Ornegin kullanici ElevenLabs'i tercih eder ama API anahtari gecersizse veya kota asildiysa,
sistem otomatik olarak Edge TTS'e dusmelidir. Bu gecis kullanici mudahalesi olmadan,
pipeline'i durdurmadan yapilmalidir.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **Kategori basina tek provider** | Basit, belirleyici | Resilience yok. Provider kapandiginda tum pipeline durur. Kullanici her defasinda ayar degistirmek zorunda kalir. |
| **Paralel yurutme (race)** | En hizli sonuc | API cagrilarini ve parayi israf eder. Her denemede tum provider'lara istek gider. ElevenLabs + OpenAI + Edge TTS ayni anda cagrilir -- gereksiz maliyet. |
| **Circuit breaker pattern** | Sofistike hata yonetimi, otomatik recovery | 2-3 provider icin asiri muhendislik. Circuit state yonetimi, half-open denemeler, reset timeout'lari -- karmasiklik/fayda orani dusuk. |
| **Manuel fallback (kullanici secer)** | Tam kontrol | Pipeline durur, kullanici mudahalesi gerekir. 3 dakikalik TTS adiminda hata olunca kullaniciyi bekletmek kotu UX. |

### Sonuc

Sirali fallback + 3 yonlu siralama secildi:

**BaseProvider ABC:**

```python
class BaseProvider(ABC):
    name: str                          # "gemini", "edge_tts", "pexels"
    category: ProviderCategory         # LLM, TTS, VISUALS, COMPOSITION, SUBTITLES

    async def execute(input_data, config) -> ProviderResult
    async def health_check(config) -> bool  # Opsiyonel
```

**ProviderResult Pydantic modeli:**

```python
class ProviderResult(BaseModel):
    success: bool                      # Islem basarili mi?
    provider_name: str                 # Hangi provider kullanildi
    data: Any                          # Cikti verisi (audio_bytes, images, text, ...)
    error: str | None                  # Hata mesaji
    cost_estimate_usd: float           # Tahmini API maliyeti
    metadata: dict[str, Any]           # Provider'a ozgu ek bilgi
```

**3 Yonlu Siralama (`get_ordered_providers`):**

| Oncelik | Kaynak | Ornek |
|---------|--------|-------|
| 1 (en yuksek) | `config["{category}_fallback_order"]` | Admin panelinden: `"edge_tts,elevenlabs"` |
| 2 | `config["{category}_provider"]` | Kullanici tercihi: `"elevenlabs"` |
| 3 (en dusuk) | Kayit sirasi | Registry'ye ilk eklenen |

**Fallback Akisi:**

1. `execute_with_fallback(category, input_data, config)` cagirilir.
2. `get_ordered_providers()` ile siralı provider listesi alinir.
3. Birinci provider denenir. Basarili ise sonuc dondurulur.
4. Basarisiz ise (exception veya `ProviderResult.success=False`) log yazilir ve
   sira dakine gecer.
5. Tum provider'lar basarisiz olursa, son hatayi iceren `ProviderResult(success=False)` doner.

**Mevcut Provider'lar:**

| Kategori | Provider | Durum |
|----------|----------|-------|
| LLM | `GeminiProvider` | Aktif |
| TTS | `EdgeTTSProvider` | Aktif (varsayilan) |
| Visuals | `PexelsProvider` | Aktif |

### Ilgili Dosyalar

- `backend/providers/base.py` -- BaseProvider, ProviderCategory, ProviderResult
- `backend/providers/registry.py` -- ProviderRegistry, execute_with_fallback, _register_all_providers

### Tekrar Degerlendirme Kosullari

- Eger provider sayisi 10+'a cikar veya bir kategoride 5+ provider olursa, circuit breaker
  pattern degerlendirilir. 2-3 provider icin sirali fallback yeterli ve anlasılir.

---

## ADR-013: Varsayilan TTS -- Edge TTS

**Karar:** Edge TTS (Microsoft Edge ucretsiz TTS servisi) varsayilan provider olarak
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 6

### Baglam

ContentManager'in cogu icerigi Turkce olacak. Gelistirme surecinde yuzlerce test video'su
uretilecek. Ucretli TTS servisleri (ElevenLabs: ~$0.30/1K karakter, OpenAI TTS: ~$15/1M
karakter) kullanmak hem gelistirme maliyetini arttirir hem de API anahtari olmadan sistemi
test etmeyi imkansiz kilar.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **ElevenLabs varsayilan** | En iyi ses kalitesi, gercekci tonlama | Karakter basina ucret (~$0.30/1K). Gelistirme ve gunluk kullanim icin pahali. API anahtari zorunlu -- ilk kurulumda engel olusturur. |
| **OpenAI TTS varsayilan** | Iyi kalite, guclu dil destegi | Karakter basina ucret (~$15/1M). Kelime seviyesi zamanlama bilgisi dondurmuyor -- altyazi senkronizasyonu icin ek islem gerekir. |
| **Google Cloud TTS** | Iyi kalite, genis dil destegi | Faturalama hesabi zorunlu. Ucretsiz katman sinirli. API kurulumu karmasik (credentials JSON). |
| **Mozilla TTS (Coqui)** | Tamamen yerel, ucretsiz | Model boyutu buyuk (~1 GB). Turkce ses kalitesi dusuk. Kurulum karmasik (PyTorch bagimliligi). |

### Sonuc

Edge TTS varsayilan TTS provider olarak secildi:

- **Tamamen ucretsiz:** $0.00/istek. API anahtari gerektirmez. Ilk kurulumda sifir engel.
  `pip install edge-tts` ile hazir.
- **Kelime seviyesi zamanlama:** `boundary="WordBoundary"` parametresiyle her kelimenin
  baslangic/bitis zamani 100-nanosaniye hassasiyetiyle dondurulur. Bu veri dogrudan
  altyazi senkronizasyonunda kullanilir (karaoke efekti icin kritik).
- **Turkce sesler:** `tr-TR-AhmetNeural` (erkek) ve `tr-TR-EmelNeural` (kadin) sesleri
  mevcut. Kalite, ucretsiz bir servis icin yeterli.
- **Async streaming:** `Communicate.stream()` ile ses verisi ve zamanlama bilgisi
  non-blocking olarak toplanir. Pipeline'in async yapisinla dogal uyum.
- **Ucretli provider'lar fallback olarak mevcut:** ElevenLabs, OpenAI TTS gibi yuksek
  kaliteli provider'lar ADR-012'deki fallback mekanizmasiyla kolayca eklenebilir ve
  uretim kalitesi gereken icerikler icin kullanilabilir.

### Edge TTS Akisi

```
1. input_data["text"] alinir (senaryo metni)
2. voice, rate, volume, pitch ayarlari config'den okunur
3. edge_tts.Communicate() nesnesi olusturulur (boundary="WordBoundary")
4. Async streaming ile:
   - type="audio" chunk'lari toplanir -> MP3 bytes
   - type="WordBoundary" event'leri toplanir -> word_timings listesi
5. ProviderResult dondiurulur:
   - data.audio_bytes: MP3 ses verisi
   - data.word_timings: [{word, start_ms, end_ms, duration_ms}, ...]
   - data.duration_ms: Toplam sure
   - cost_estimate_usd: 0.0
```

### Ilgili Dosyalar

- `backend/providers/tts/edge_tts_provider.py` -- EdgeTTSProvider sinifi

### Tekrar Degerlendirme Kosullari

- Eger Edge TTS servisi kapanir veya kalitesi duserse, ElevenLabs varsayilan yapilabilir.
  Fallback mekanizmasi sayesinde degisiklik tek bir config degisikligidir.

---

## ADR-014: Canli Guncelleme -- SSE (Server-Sent Events)

**Karar:** Server-Sent Events (SSE) ile server-to-client tek yonlu real-time iletisim
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 5

### Baglam

Frontend'in pipeline ilerlemesini, adim guncellemelerini ve log mesajlarini gercek zamanli
olarak gostermesi gerekiyor. Bir video pipeline'i 10-30 dakika surer; kullanici bu sure
boyunca hangi adimin calıstigini, yuzde kacin tamamlandigini ve hatalari aninda gormek ister.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **WebSocket** | Cift yonlu iletisim, dusuk latency | Sadece server -> client iletisim gerekiyor (ilerleme, loglar). Cift yonlu iletisim gereksiz karmasiklik ekler. WebSocket baglanti yonetimi (reconnect, heartbeat) daha karmasik. |
| **Polling (setInterval)** | Basit implementasyon, evrensel destek | Gereksiz HTTP istekleri. 1 saniye aralikla polling = dakikada 60 gereksiz istek. Gecikme (1 saniyeye kadar). Sunucu yuku. |
| **Long polling** | Polling'den iyi, gercek zamanli his | Baglanti yonetimi karmasik. Her yanit sonrasi yeni istek acmak gerekiyor. HTTP overhead her dongude tekrarlanir. |
| **gRPC streaming** | Tip guvenligi, verimli binary | Frontend tarayicida native destek yok (gRPC-web gerekir). Ek proxy katmani. Bu olcek icin gereksiz karmasiklik. |

### Sonuc

SSE secildi:

- **Native tarayici destegi:** `EventSource` API'si tum modern tarayicilarda var.
  Ek kutuphane gerekmiyor.
- **Tek yonlu (server -> client):** Pipeline ilerlemesi, adim guncellemeleri ve log
  mesajlari sadece server'dan client'a akar. Client'dan server'a veri gonderme ihtiyaci
  yok (is baslama/iptal gibi islemler REST API ile yapilir).
- **Otomatik yeniden baglanti:** `EventSource` baglanti kopuldugunda otomatik olarak
  tekrar baglanir. Ozel reconnect mantigi yazmak gerekmiyor.
- **Named event'ler:** Farkli veri tipleri icin ayri event adlari kullanilir:

  | Event | Aciklama | Frontend Handler |
  |-------|----------|-----------------|
  | `job_status` | Is durumu degisti (queued, running, completed, ...) | `onJobStatus` |
  | `step_update` | Pipeline adimi guncellendi (running, completed, ...) | `onStepUpdate` |
  | `log` | Canli log mesaji (INFO, WARN, ERROR) | `onLog` |
  | `heartbeat` | Baglanti canlilik sinyali (15 sn aralik) | `onHeartbeat` |
  | `complete` | Stream tamamlandi, baglanti kapatilabilir | `onComplete` |
  | `error` | Is bulunamadi vb. hata | `onError` |

**Backend Implementasyonu:**

- `_SSEHub` sinifi: Her `job_id` icin `asyncio.Queue` tabanlı subscriber listesi tutar.
- Event yayinlama: `manager.emit_log()`, `manager.update_step()` gibi metotlar
  ilgili job'un subscriber'larina event gonderir.
- `StreamingResponse`: FastAPI'nin streaming response mekanizmasiyla SSE event'leri
  `text/event-stream` content-type ile gonderilir.
- Heartbeat: 15 saniye aralikla `heartbeat` event'i gonderilir. Proxy timeout'larini
  onler ve baglanti canliligini saglar.

**Frontend Implementasyonu:**

- `openSSE(path, handlers)`: `EventSource` oluşturur, named event listener'lari baglar.
  Donus degeri olarak `close()` fonksiyonu verir -- bilesen unmount'ta baglanti temizlenir.

### Ilgili Dosyalar

- `backend/services/job_manager.py` -- _SSEHub sinifi, emit_log(), subscriber yonetimi
- `frontend/src/api/client.ts` -- openSSE() helper, SSEHandlers interface

### Tekrar Degerlendirme Kosullari

- Eger client -> server real-time iletisim gerekirse (ornegin canli video onizleme
  sirasinda kullanicinin parametreleri degistirmesi), WebSocket eklenebilir. SSE
  ve WebSocket birlikte kullanilabilir.

---

## ADR-015: Loglama -- Yapilandirilmis JSON Logging

**Karar:** Python built-in `logging` modulu + ozel JSON formatter + context logger
**Tarih:** 2026-03-29
**Durum:** Kabul edildi
**Faz:** 1

### Baglam

Pipeline islemleri uzun surer (10-30 dakika) ve birden fazla provider, adim ve is esanli
calisabilir. Hata ayiklama icin her log kaydinin hangi is'e, hangi adima ve hangi provider'a
ait oldugunu gostermesi gerekiyor. Ayrica SSE uzerinden canli log streaming yapilacagindan,
loglarin makine tarafindan parse edilebilir olmasi zorunluydu.

### Degerlendirilen Alternatifler

| Alternatif | Avantajlari | Neden Elendi |
|-----------|------------|--------------|
| **structlog** | Zengin ozellikli, zincirleme yapilandirma | Ek bagimlilik. Built-in logging'in ustune ince bir katman yeterli. structlog'un ogrenme egrisi ve konfigurasyonu bu olcek icin gereksiz. |
| **loguru** | Basit API, otomatik rotation, renkli cikti | Daha az kontrol. Custom formatter ve handler yapilandirmasi sinirli. SSE streaming ile entegrasyon icin built-in logging'in esnekligi gerekiyor. |
| **print()** | Sifir kurulum | Seviye yok (DEBUG/INFO/ERROR ayrimi), yapilandirilmamis cikti, dosyaya yazma yok, SSE streaming uyumsuz. |
| **Sentry** | Hata izleme, alerting | Harici servis bagimliligi. Localhost-first ihlali. Tum loglar icin degil, sadece hata izleme icin uygundur. |

### Sonuc

Built-in `logging` + ozel JSON formatter + context logger secildi:

**`_JSONFormatter`:**
Her log kaydini tek satirlik JSON olarak uretir. Temel alanlar: `timestamp` (ISO-8601 UTC),
`level`, `logger` (modul adi), `message`. Ek alanlar (job_id, step, provider, duration_ms)
LogRecord'a eklenir.

**`_ContextLogger`:**
`logging.LoggerAdapter` uzerine ince bir sarmalayici. Log metotlarina keyword arguman
olarak context bilgisi gecirmeye izin verir:

```python
log.info("TTS tamamlandi", job_id="abc123", step="tts", provider="edge_tts", duration_ms=1240)
```

Bu ciktiyi uretir:
```json
{"timestamp":"2026-03-29T12:00:00Z","level":"INFO","logger":"pipeline.tts",
 "message":"TTS tamamlandi","job_id":"abc123","step":"tts",
 "provider":"edge_tts","duration_ms":1240}
```

**`_LOGRECORD_RESERVED` korunma:**
Python'un LogRecord sinifinin dahili alanlari (filename, lineno, module, vb.) ile kullanicinin
gectigi keyword'ler cakisabilir. Ornegin `log.info("...", filename="scene.wav")` LogRecord'un
kendi `filename` alanini ezer. `_ContextLogger` bu cakilarin `ctx_` on ekiyle yeniden
adlandirir (ornegin `ctx_filename`).

**Handler'lar:**
- **stdout:** Uvicorn/systemd tarafindan yakalanir. Gelistirme sirasinda terminalde gorunur.
- **RotatingFileHandler:** `logs/contentmanager.log` dosyasina yazar. 10 MB esiginde
  rotasyon, 5 yedek dosya.

**SSE Entegrasyonu:**
JSON formati sayesinde log mesajlari dogrudan SSE event data'si olarak frontend'e
gonderilebilir. Frontend `onLog` handler'inda JSON'i parse eder ve gorsel log akisinda gosterir.

### Ilgili Dosyalar

- `backend/utils/logger.py` -- _JSONFormatter, _ContextLogger, get_logger(), log_exception()

### Tekrar Degerlendirme Kosullari

- Eger loglarin merkezi bir sisteme gonderilmesi gerekirse (ELK, Datadog), JSON formati
  bu entegrasyonu kolaylastirir. Sadece yeni bir handler eklemek yeterlidir.

---

## Mimari Genel Bakis

### Katmanli Yapi

```
+------------------------------------------------------------------+
|                        Frontend (React + Vite)                    |
|  stores/ (Zustand)  |  api/client.ts  |  pages/  |  components/  |
+----------+---+---------------------------------------------------+
           |   |
     REST API  SSE (EventSource)
           |   |
+----------v---v---------------------------------------------------+
|                      Backend (FastAPI + Python)                   |
|                                                                   |
|  api/ (Router'lar)                                                |
|    |                                                              |
|  services/ (JobManager, SettingsResolver)                         |
|    |                                                              |
|  pipeline/ (PipelineRunner, CacheManager)                         |
|    |                                                              |
|  modules/ (ContentModule ABC, StandardVideo, NewsBulletin, ...)   |
|    |                                                              |
|  providers/ (BaseProvider, ProviderRegistry, Fallback Chain)      |
|                                                                   |
+---+---------------------------+----------------------------------+
    |                           |
    v                           v
+--------+            +------------------+
| SQLite |            | Dosya Sistemi    |
| (WAL)  |            | sessions/{id}/   |
| jobs   |            | step_*.json      |
| steps  |            | step_*/          |
| settings|           | logs/            |
+--------+            +------------------+
```

### Veri Akisi (Video Olusturma)

```
Kullanici "Video Olustur" tiklar
        |
        v
Frontend: POST /api/jobs (CreateVideo formu)
        |
        v
Backend: JobManager.create_job()
  -> SettingsResolver.resolve() ile 5 katman merge
  -> Job + JobSteps SQLite'a yazilir
  -> Session dizini olusturulur
  -> asyncio.create_task(run_pipeline(job_id))
        |
        v
PipelineRunner.run_pipeline()
  -> Modul'den pipeline adimlari alinir
  -> Her adim icin:
     1. Cache kontrolu (tamamlanmissa atla)
     2. execute() cagir (provider_registry.execute_with_fallback)
     3. Sonucu cache'e yaz
     4. DB'de step durumu guncelle
     5. SSE event yayinla
        |
        v
Frontend: SSE ile canli guncelleme
  -> Job durumu, adim ilerlemesi, log mesajlari
  -> Tamamlandiginda video path gosterilir
```

---

*Bu dokuman yasayan bir referanstir. Her yeni mimari karar `ADR-XXX` formatinda eklenir.
Mevcut kararlar yeni bilgiler isiginda guncellenir ve "Tekrar Degerlendirme Kosullari"
bolumu tetiklendiginde revize edilir.*
