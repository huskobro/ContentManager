# ContentManager -- Gelistirici Teknik Rehberi

> Son guncelleme: 2026-03-29 | Versiyon: v0.7.0

## Icindekiler

- [Mimari Ozet](#mimari-ozet)
- [Teknoloji Yigini](#teknoloji-yigini)
- [Dizin Yapisi](#dizin-yapisi)
- [Backend Gelistirme](#backend-gelistirme)
  - [Ayaga Kaldirma](#ayaga-kaldirma)
  - [main.py](#mainpy)
  - [config.py -- Settings Sinifi](#configpy----settings-sinifi)
  - [database.py](#databasepy)
  - [ORM Modelleri](#orm-modelleri)
  - [Pydantic Semalari](#pydantic-semalari)
  - [API Endpoint'leri](#api-endpointleri)
  - [Servisler](#servisler)
- [Pipeline Sistemi](#pipeline-sistemi)
  - [PipelineRunner](#pipelinerunner)
  - [CacheManager](#cachemanager)
- [Modul Sistemi](#modul-sistemi)
  - [ContentModule ABC](#contentmodule-abc)
  - [ModuleRegistry](#moduleregistry)
  - [StandardVideoModule](#standardvideomodule)
- [Provider Sistemi](#provider-sistemi)
  - [BaseProvider ABC](#baseprovider-abc)
  - [ProviderRegistry](#providerregistry)
  - [GeminiProvider](#geminiprovider)
  - [EdgeTTSProvider](#edgetssprovider)
  - [PexelsProvider](#pexelsprovider)
- [5-Katmanli Ayar Sistemi](#5-katmanli-ayar-sistemi)
- [Frontend Gelistirme](#frontend-gelistirme)
  - [Zustand Store'lari](#zustand-storelari)
  - [API Client](#api-client)
  - [Vite Proxy](#vite-proxy)
  - [Layout Yapisi](#layout-yapisi)
  - [Sayfa Blesenleri](#sayfa-bilesenleri)
- [Remotion Gelistirme](#remotion-gelistirme)
- [Veritabani](#veritabani)
- [Log Sistemi](#log-sistemi)
- [Yeni Modul Ekleme Rehberi](#yeni-modul-ekleme-rehberi)
- [Yeni Provider Ekleme Rehberi](#yeni-provider-ekleme-rehberi)
- [Kodlama Standartlari](#kodlama-standartlari)

---

## Mimari Ozet

ContentManager uc bagimsiz katmandan olusur. Her katman kendi portunda calisir ve birbirleriyle HTTP/SSE veya subprocess uzerinden iletisim kurar.

```
+----------------+     HTTP/SSE       +----------------+     subprocess      +----------------+
|   Frontend     | <================> |   Backend      | =================> |   Remotion     |
|                |                    |                |                    |                |
| React 18       |   localhost:5173   | FastAPI        |   npx remotion     | Remotion 4.0   |
| Vite 5         |   proxy -> :8000   | SQLAlchemy 2.0 |   render ...       | React 18       |
| Tailwind CSS 3 |                    | Pydantic v2    |                    | H.264 MP4      |
| Zustand 5      |                    | SQLite WAL     |                    |                |
+----------------+                    +----------------+                    +----------------+
   Port 5173                             Port 8000                            Port 3000
```

**Tasarim Ilkeleri:**

- **Localhost-first:** Docker, Redis, Celery gibi harici altyapi gerektirmez. Tek makinede, tek surecte calisir.
- **Tek surec:** Backend tek bir Uvicorn sureci olarak ayaga kalkar. Pipeline adimlarini `asyncio.create_task()` ile arka planda calistirir.
- **Moduler ama sisirmemis:** Her modulun tek ve net sorumlulugu var. Gereksiz soyutlama katmanlari eklenmez.
- **Genisletilebilir:** Yeni modul veya provider eklemek, ABC'yi implement edip registry'ye kaydetmekle yapilir.

---

## Teknoloji Yigini

| Katman | Teknoloji | Versiyon | Neden Secildi |
|--------|-----------|----------|---------------|
| Backend framework | FastAPI | 0.115+ | Async native, tip guvenli, otomatik OpenAPI dokumantasyonu |
| ASGI sunucu | Uvicorn | 0.32+ | Hafif, hizli, hot-reload destegi |
| ORM | SQLAlchemy | 2.0+ | Python standardi, deklaratif model tanimlama |
| Validation | Pydantic v2 | 2.10+ | Hizli, BaseSettings entegrasyonu, JSON schema |
| Veritabani | SQLite (WAL) | 3.x | Sifir kurulum, concurrent read/write destegi |
| Frontend framework | React | 18.3+ | Genis ekosistem, Remotion uyumu |
| Build tool | Vite | 5.4+ | Hizli HMR, ESM native |
| Type system | TypeScript | 5.6+ | Strict mod, compile-time hata yakalama |
| CSS framework | Tailwind CSS | 3.4+ | Utility-first, dark mode, sifir calisma-ani bagimliligi |
| State management | Zustand | 5.0+ | Minimal API, persist middleware, React 18 uyumu |
| UI primitives | Radix UI | -- | Erisilebilir, headless bilesenler |
| Ikonlar | Lucide React | 0.468+ | Hafif, tree-shakeable |
| Video composition | Remotion | 4.0.290 | React-tabanli programatik video uretimi |
| LLM SDK | google-generativeai | -- | Gemini API erisimi |
| TTS | edge-tts | 7+ | Ucretsiz, kelime-seviye zamanlama destegi |
| HTTP client (Python) | httpx | -- | Async destekli HTTP istemci |
| Ortam degiskenleri | python-dotenv | -- | .env dosyasindan ayar yuklemesi |

---

## Dizin Yapisi

```
ContentManager/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, CORS, /health
│   ├── config.py                # Pydantic BaseSettings: tum ortam degiskenleri
│   ├── database.py              # SQLite WAL engine, Base, get_db(), create_tables()
│   ├── models/
│   │   ├── __init__.py
│   │   ├── job.py               # Job + JobStep ORM (jobs, job_steps tablolari)
│   │   ├── settings.py          # Setting ORM (settings tablosu)
│   │   └── schemas.py           # Pydantic: JobCreate, JobResponse, SettingCreate, vb.
│   ├── api/
│   │   ├── __init__.py
│   │   ├── jobs.py              # POST/GET/PATCH/DELETE /api/jobs, SSE events
│   │   └── settings.py          # GET/POST/PUT/DELETE /api/settings, resolved
│   ├── modules/
│   │   ├── __init__.py
│   │   ├── base.py              # ContentModule ABC, Capability enum, PipelineStepDef
│   │   ├── registry.py          # ModuleRegistry singleton
│   │   └── standard_video/
│   │       ├── __init__.py      # standard_video_module export
│   │       ├── config.py        # DEFAULT_CONFIG dict (30+ ayar)
│   │       └── pipeline.py      # 6 adim fonksiyonu + StandardVideoModule sinifi
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py              # BaseProvider ABC, ProviderResult, ProviderCategory
│   │   ├── registry.py          # ProviderRegistry singleton
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   └── gemini.py        # GeminiProvider: google-generativeai async
│   │   ├── tts/
│   │   │   ├── __init__.py
│   │   │   └── edge_tts_provider.py  # EdgeTTSProvider: kelime-seviye zamanlama
│   │   ├── visuals/
│   │   │   ├── __init__.py
│   │   │   └── pexels.py        # PexelsProvider: video/foto arama ve indirme
│   │   └── composition/
│   │       └── __init__.py
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── runner.py            # run_pipeline() async, cache-aware adim yurutme
│   │   └── cache.py             # CacheManager: json/text/binary kayit/yukleme
│   ├── services/
│   │   ├── __init__.py
│   │   ├── job_manager.py       # JobManager, _SSEHub, sse_hub singleton
│   │   └── settings_resolver.py # SettingsResolver, 5-katman birlesim, _GLOBAL_DEFAULTS
│   └── utils/
│       ├── __init__.py
│       └── logger.py            # get_logger(), JSON yapisal loglama
├── frontend/
│   ├── package.json             # React 18, Zustand 5, Radix UI, Lucide
│   ├── vite.config.ts           # Proxy: /api -> :8000, /health -> :8000
│   ├── tailwind.config.ts       # Dark mode class, Inter font, ozel animasyonlar
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # React Router: user + admin rotalari
│       ├── api/
│       │   └── client.ts        # api nesnesi (get/post/put/patch/delete), openSSE()
│       ├── stores/
│       │   ├── uiStore.ts       # tema, sidebar, admin, toast bildirimleri
│       │   ├── jobStore.ts      # is listesi, istatistikler, SSE aboneligi, log kayitlari
│       │   ├── settingsStore.ts # kullanici varsayilanlari, cozumlenmis ayarlar, kilitli anahtarlar
│       │   └── adminStore.ts    # admin ayar CRUD (X-Admin-Pin basligıyla)
│       ├── components/
│       │   └── layout/
│       │       ├── AppShell.tsx  # Sidebar + Header + Outlet sarmalayici
│       │       ├── Sidebar.tsx   # User/Admin navigasyonu, daraltma, mobil overlay
│       │       └── Header.tsx    # Tema degistirme, admin PIN modali, sayfa basligi
│       ├── pages/
│       │   ├── user/
│       │   │   ├── Dashboard.tsx    # Istatistikler, saglik durumu, son isler
│       │   │   ├── CreateVideo.tsx  # Modul secimi, baslik, dil, gelismis ayarlar
│       │   │   ├── JobList.tsx      # Filtrelenmis liste, sayfalama, durum rozetleri
│       │   │   ├── JobDetail.tsx    # SSE ilerleme, adimlar, loglar, iptal
│       │   │   └── UserSettings.tsx # 5 bolumlu ayarlar, kilit gostergeleri
│       │   └── admin/
│       │       ├── AdminDashboard.tsx  # Istatistikler, saglik, is dagılımı
│       │       ├── GlobalSettings.tsx  # Admin CRUD, kilit acma/kapama
│       │       ├── ModuleManager.tsx   # Modul acma/kapama, modul-ozel ayarlar
│       │       ├── ProviderManager.tsx # API anahtarlari, yedek siralama
│       │       └── AdminJobs.tsx       # Tum isler, toplu temizlik, silme
│       ├── lib/
│       │   └── utils.ts         # cn() = clsx + tailwind-merge
│       └── types/
│           └── index.ts
├── remotion/
│   ├── package.json             # Remotion 4.0.290, React 18
│   ├── remotion.config.ts       # H.264, CRF 18, JPEG, ANGLE renderer
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # registerRoot(RemotionRoot)
│       ├── Root.tsx               # 3 composition: StandardVideo, NewsBulletin, ProductReview
│       ├── types.ts               # SceneData, WordTiming, SubtitleStyle, VideoSettings
│       └── compositions/
│           ├── StandardVideo.tsx  # Sirasal sahneler: ses + gorsel + altyazi
│           ├── NewsBulletin.tsx   # Alt-bant grafikleri, haber ogeleri
│           └── ProductReview.tsx  # 5-bolumlu yapi, puan gosterimi
├── docs/                         # Yasayan dokumantasyon
├── sessions/                     # Is ciktilari (runtime, gitignore'da)
├── logs/                         # Uygulama loglari (runtime, gitignore'da)
├── .tmp/                         # Pipeline ara dosyalari (gitignore'da)
├── .env                          # Ortam degiskenleri (gitignore'da)
├── .env.example
└── requirements.txt
```

---

## Backend Gelistirme

### Ayaga Kaldirma

```bash
# Virtual environment olustur ve aktive et
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Ortam degiskenlerini hazirla
cp .env.example .env
# .env icinde en azindan gemini_api_key ve pexels_api_key doldurulmali

# Sunucuyu baslat (hot-reload aktif)
python -m backend.main
# -> http://127.0.0.1:8000
# -> Swagger UI: http://127.0.0.1:8000/docs
```

### main.py

FastAPI uygulamasinin giris noktasi. Uc ana sorumluluk tasir:

**lifespan() context manager:**
- `create_tables()` cagrisiyla veritabani tablolarini olusturur (yoksa)
- `recover_interrupted_jobs()` ile kesilmis isleri kurtarir (sunucu cokme sonrasi)
- Baslangic loglarini yazar

**_log_requests() middleware:**
- Her HTTP istegini loglar: method, path, status_code, duration_ms
- Yapilsal JSON formatinda stderr'e yazar

**health_check() endpoint:**
- `GET /health` -> `HealthResponse`
- Veritabani WAL kontrolu yapar (`check_db_health()`)
- Tablo sayisi ve journal_mode bilgisi dondurur

**Router kayitlari:**
- `jobs_router` -> `/api/jobs` prefix
- `settings_router` -> `/api/settings` prefix
- CORS: `settings.cors_origins` listesinden konfigure edilir

### config.py -- Settings Sinifi

Pydantic `BaseSettings` tabanli. `.env` dosyasindan okur, tip dogrulamasi ve dizin olusturma islemlerini otomatik yapar.

**A) Uygulama ve Sunucu:**

| Ayar | Varsayilan | Aciklama |
|------|-----------|----------|
| `app_name` | ContentManager | Uygulama adi |
| `app_version` | -- | Mevcut versiyon |
| `environment` | development | Ortam (development/production) |
| `backend_host` | 127.0.0.1 | Sunucu dinleme adresi |
| `backend_port` | 8000 | Sunucu portu |
| `backend_reload` | -- | Hot-reload aktif mi |
| `cors_origins` | -- | Izin verilen origin listesi |
| `admin_pin` | -- | Admin paneli PIN kodu |

**B) Veritabani ve Dosya Yollari:**

| Ayar | Varsayilan | Aciklama |
|------|-----------|----------|
| `database_path` | -- | SQLite dosya yolu |
| `sessions_dir` | -- | Is cikti dizini |
| `tmp_dir` | -- | Gecici dosya dizini |
| `logs_dir` | -- | Log dizini |
| `max_concurrent_jobs` | 2 | Ayni anda calisabilecek is sayisi |
| `job_timeout_seconds` | 1800 | Is zaman asimi (30 dakika) |

**C) Provider API Anahtarlari:**

| Ayar | Aciklama |
|------|----------|
| `gemini_api_key` | Google Gemini API anahtari |
| `kieai_api_key` | Kieai API anahtari (Gemini alternatifi) |
| `openai_api_key` | OpenAI API anahtari |
| `elevenlabs_api_key` | ElevenLabs TTS API anahtari |
| `pexels_api_key` | Pexels gorsel arama API anahtari |
| `pixabay_api_key` | Pixabay gorsel arama API anahtari |
| `youtube_client_id` | YouTube OAuth client ID |
| `youtube_client_secret` | YouTube OAuth client secret |

**D) Pipeline Varsayilanlari:**

| Ayar | Varsayilan | Aciklama |
|------|-----------|----------|
| `default_language` | tr | Video dili |
| `default_tts_provider` | edge_tts | Varsayilan TTS saglayicisi |
| `default_llm_provider` | gemini | Varsayilan LLM saglayicisi |
| `default_visuals_provider` | pexels | Varsayilan gorsel saglayicisi |
| `default_video_resolution` | 1920x1080 | Video cozunurlugu |
| `default_video_fps` | 30 | Saniye basina kare sayisi |
| `default_subtitle_style` | standard | Altyazi stili |

**Validatorler:**
- `_parse_cors()`: CORS origin string'ini listeye donusturur
- `_ensure_dirs()`: sessions_dir, tmp_dir, logs_dir dizinlerini otomatik olusturur

### database.py

SQLite WAL modunda yapilandirilmis veritabani katmani.

**Engine PRAGMA ayarlari:**
```
journal_mode=WAL        -- Concurrent read/write destegi
synchronous=NORMAL      -- Performans/guvenlik dengesi
foreign_keys=ON         -- FK kontrolu aktif
cache_size=-64000       -- 64MB bellek ici onbellek
temp_store=MEMORY       -- Gecici tablolar bellekte
```

**Fonksiyonlar:**

| Fonksiyon | Aciklama |
|-----------|----------|
| `get_db()` | FastAPI `Depends` generator'u. Her istek icin bir Session acip kapatir. |
| `create_tables()` | `Base.metadata.create_all()` cagrisi. Eksik tablolari olusturur. |
| `check_db_health()` | WAL modu, tablo listesi ve journal_mode bilgisi donduren dict. |

**Diger:**
- `pool_pre_ping=True`: baglanti havuzunda canlilik kontrolu
- `SessionLocal`: `sessionmaker` ile olusturulmus fabrika

### ORM Modelleri

#### Job (tablo: `jobs`)

| Alan | Tip | Aciklama |
|------|-----|----------|
| `id` | String(32), PK | UUID4 hex (tirnak olmadan 32 karakter) |
| `module_key` | String | Modul adi (ornegin "standard_video") |
| `title` | String | Is basligi |
| `language` | String | Icerik dili |
| `status` | String | queued, running, completed, failed, cancelled |
| `current_step` | String, nullable | Su an calisan adim |
| `error_message` | Text, nullable | Hata mesaji (basarisizliktsa) |
| `created_at` | DateTime | Olusturma zamani |
| `started_at` | DateTime, nullable | Baslatma zamani |
| `completed_at` | DateTime, nullable | Tamamlanma zamani |
| `session_dir` | String, nullable | Cikti dizini yolu |
| `output_path` | String, nullable | Nihai cikti dosyasi |
| `cost_estimate_usd` | Float | Tahmini API maliyeti |
| `resolved_settings_json` | Text | Cozumlenmis ayarlar (JSON) |

**Iliski:** `steps` -> `list[JobStep]` (cascade delete, eager load)
**Indeks:** `ix_jobs_status_created` on `(status, created_at)`

#### JobStep (tablo: `job_steps`)

| Alan | Tip | Aciklama |
|------|-----|----------|
| `id` | Integer, PK, auto | Otomatik artan ID |
| `job_id` | FK -> jobs.id | Bagli is |
| `key` | String | Adim anahtari (ornegin "script", "tts") |
| `label` | String | Goruntuleme etiketi |
| `order` | Integer | Calisma sirasi |
| `status` | String | pending, running, completed, failed, skipped |
| `message` | String, nullable | Durum mesaji |
| `provider` | String, nullable | Kullanulan provider adi |
| `started_at` | DateTime, nullable | Adim baslangic zamani |
| `completed_at` | DateTime, nullable | Adim bitis zamani |
| `duration_ms` | Integer, nullable | Calisma suresi (ms) |
| `cost_estimate_usd` | Float | Tahmini maliyet |
| `cached` | Boolean | Onbellekten mi geldi |
| `output_artifact` | Text, nullable | Cikti dosyasi yolu |

**Indeks:** `ix_job_steps_job_order` on `(job_id, order)`

#### Setting (tablo: `settings`)

| Alan | Tip | Aciklama |
|------|-----|----------|
| `id` | Integer, PK, auto | Otomatik artan ID |
| `scope` | String | admin, module, provider, user |
| `scope_id` | String | Kapsam tanimlayicisi (ornegin "standard_video") |
| `key` | String | Ayar anahtari |
| `value` | Text | JSON-encoded deger |
| `locked` | Boolean | Kullanicinin override edememesi icin kilit |
| `description` | String, nullable | Ayar aciklamasi |
| `created_at` | DateTime | Olusturma zamani |
| `updated_at` | DateTime | Son guncelleme zamani |

**Unique constraint:** `uq_settings_scope_key` on `(scope, scope_id, key)`
**Indeks:** `ix_settings_scope` on `(scope, scope_id)`

### Pydantic Semalari

`backend/models/schemas.py` dosyasinda tum API veri modelleri tanimlidir.

**Tip takma adlari:**
```python
JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
StepStatus = Literal["pending", "running", "completed", "failed", "skipped"]
SettingScope = Literal["admin", "module", "provider", "user"]
```

**Job semalari:**

| Sema | Kullanim |
|------|----------|
| `JobCreate` | POST /api/jobs istegi. Alanlari: `module_key`, `title`, `language`, `settings_overrides` (opsiyonel dict) |
| `JobResponse` | Tek is yaniti. Job alanlari + `steps: list[JobStepResponse]` |
| `JobListResponse` | Sayfalanmis liste. `items`, `total`, `page`, `page_size` |
| `JobStatusUpdate` | PATCH istegi. Sadece `status` alani (iptal icin "cancelled") |
| `JobStepResponse` | Tek adim bilgisi |

**Setting semalari:**

| Sema | Kullanim |
|------|----------|
| `SettingCreate` | Yeni ayar olusturma. `scope`, `scope_id`, `key`, `value`, `locked`, `description` |
| `SettingUpdate` | Mevcut ayar guncelleme |
| `SettingResponse` | Ayar yaniti |
| `SettingBulkCreate` | Toplu ayar olusturma (liste) |
| `ResolvedSettingsResponse` | Cozumlenmis ayarlar: `settings` (dict) + `locked_keys` (list) |

**Diger:**
- `HealthResponse`: Saglik kontrolu yaniti

### API Endpoint'leri

#### Jobs API (`backend/api/jobs.py`)

| Method | Yol | Aciklama |
|--------|-----|----------|
| POST | `/api/jobs` | Yeni is olusturur. `JobCreate` body'si alir. Pipeline'i `asyncio.create_task(run_pipeline(job.id))` ile arka planda baslatir. |
| GET | `/api/jobs` | Is listesi. Query parametreleri: `page`, `page_size`, `status` (opsiyonel), `module_key` (opsiyonel). `JobListResponse` dondurur. |
| GET | `/api/jobs/stats` | Is istatistikleri. `{total, queued, running, completed, failed, cancelled}` dondurur. |
| GET | `/api/jobs/{job_id}` | Tekil is detayi. Adimlariyla birlikte `JobResponse` dondurur. |
| PATCH | `/api/jobs/{job_id}` | Is durumu guncelleme. Sadece `"cancelled"` durumuna gecis kabul eder. |
| DELETE | `/api/jobs/{job_id}` | Is silme. Admin PIN gerektirir. Sadece terminal durumdaki isler silinebilir (completed, failed, cancelled). |
| GET | `/api/jobs/{job_id}/events` | SSE (Server-Sent Events) akisi. Event tipleri: `job_status`, `step_update`, `log`, `heartbeat`, `complete`. |

**SSE event yapisi:**
```
event: job_status
data: {"status": "running", "current_step": "script"}

event: step_update
data: {"key": "script", "status": "completed", "duration_ms": 4200}

event: log
data: {"level": "info", "message": "Senaryo 10 sahne iceriyor"}

event: heartbeat
data: {"ts": 1711720000}

event: complete
data: {"status": "completed", "output_path": "sessions/abc123/output.mp4"}
```

#### Settings API (`backend/api/settings.py`)

| Method | Yol | Admin PIN | Aciklama |
|--------|-----|-----------|----------|
| GET | `/api/settings/resolved` | Hayir | 5-katman birlesim sonucu + kilitli anahtarlar. Herkes erisebilir. |
| GET | `/api/settings` | Evet | Kapsama gore ayar listesi. Query: `scope`, `scope_id` |
| POST | `/api/settings` | Evet | Yeni ayar olustur (upsert) |
| POST | `/api/settings/bulk` | Evet | Toplu ayar olustur/guncelle |
| PUT | `/api/settings/{id}` | Evet | Mevcut ayari guncelle |
| DELETE | `/api/settings/{id}` | Evet | Ayar sil |

**Admin PIN dogrulamasi:** `X-Admin-Pin` HTTP basligi uzerinden yapilir. `_require_admin()` dependency fonksiyonu dogrular.

### Servisler

#### JobManager (`backend/services/job_manager.py`)

Islerin yasam dongusu yonetimini saglar.

**_SSEHub sinifi:**
Bellek-ici pub/sub sistemi. Her is icin `asyncio.Queue` tabanli abone listesi tutar.

| Method | Aciklama |
|--------|----------|
| `subscribe(job_id)` | Yeni kuyruk olusturup dondurur |
| `unsubscribe(job_id, queue)` | Abone kuyrugunu kaldirir |
| `publish(job_id, event, data)` | Tum abonelere event gonderir |
| `publish_and_close()` | Son event'i gonderip tum abonelikleri kapatir |

**JobManager sinifi:**

| Method | Aciklama |
|--------|----------|
| `create_job(db, data)` | Yeni is olusturur, adimlari DB'ye yazar |
| `get_job(db, job_id)` | Tekil is sorgusu |
| `list_jobs(db, page, page_size, status?, module_key?)` | Sayfalanmis liste |
| `update_job_status(db, job_id, status)` | Durum gecis validasyonu ile gunceller |
| `cancel_job(db, job_id)` | Isi iptal eder |
| `update_step(db, job_id, step_key, ...)` | Adim durumunu gunceller |
| `emit_log(job_id, level, message)` | SSE uzerinden log mesaji yayinlar |
| `delete_job(db, job_id)` | Terminal durumdaki isi siler |
| `recover_interrupted_jobs(db)` | Sunucu yeniden basladiginda yarim kalan isleri kurtarir |
| `get_stats(db)` | Durum bazli is istatistikleri |

**Gecerli durum gecisleri:**
```
queued    -> running, cancelled
running   -> completed, failed, cancelled
failed    -> queued          (yeniden kuyruga alma)
cancelled -> queued          (yeniden kuyruga alma)
```

**`sse_hub` singleton:** Tum uygulama genelinde tekil SSE hub nesnesi.

#### SettingsResolver (`backend/services/settings_resolver.py`)

5-katmanli ayar birlestirme motorudur.

**_GLOBAL_DEFAULTS:** `config.py`'deki degerlerden doldurulur (Katman 1).

**_load_scope(db, scope, scope_id):** Belirli bir kapsamin degerlerini ve kilitli anahtarlarini SQLite'tan yukler.

**SettingsResolver.resolve(module_key?, provider_key?, user_overrides?):**
5 katmani sirayla birlestirir. Her katman onceki degerlerin ustune yazar, ancak kilitli anahtarlar kullanici katmaninda (Katman 5) override edilemez.

Dondurulen `_ResolvedSettings`:
- `settings`: Birlesmis deger sozlugu
- `locked_keys`: Kilitlenmis anahtar listesi

**Diger metodlar:** `upsert()`, `bulk_upsert()`, `list_scope()`, `delete()`

---

## Pipeline Sistemi

### PipelineRunner

`backend/pipeline/runner.py` dosyasindaki `run_pipeline(job_id)` fonksiyonu, arka planda calisan async gorevdir.

**Calisma akisi:**

```
1. Kendi SessionLocal()'ini acar (ana thread'den bagimsiz)
2. Job'u yukler, status=queued oldugunu dogrular
3. module_registry'den modulu alir
4. Job durumunu "running" olarak gunceller
5. resolved_settings_json'dan konfigurasyonu yukler
6. CacheManager(job_id, session_dir) olusturur
7. Modulden pipeline adimlarini alir
8. Her adimi _execute_step() ile sirayla calistirir
9. Tum adimlar basarili: status=completed, output_path ayarla
10. Hata olusursa: status=failed, error_message ayarla
```

**_execute_step() mantigi:**
```
1. Onbellek kontrolu: Bu adimin ciktisi zaten var mi?
   -> Varsa: status=completed, cached=True olarak isaretle, atla
2. Yoksa: adimin execute fonksiyonunu calistir
3. Sonucu CacheManager ile kaydet
4. Adim durumunu guncelle (completed veya failed)
5. SSE uzerinden step_update event'i yayinla
```

Olumcul olmayan (`is_fatal=False`) adimlarda hata olusursa, adim "failed" olarak isaretlenip pipeline devam eder. Olumcul (`is_fatal=True`) adimlarda ise tum pipeline basarisiz olur.

### CacheManager

`backend/pipeline/cache.py` dosyasinda tanimlidir. Her is icin `sessions/{job_id}/` dizininde dosya-tabanli onbellek yonetimi saglar.

| Method | Aciklama |
|--------|----------|
| `save_json(step_key, data, filename?)` | JSON ciktisini kaydeder. Varsayilan: `step_{key}.json` |
| `save_text(step_key, content, filename?)` | Metin ciktisini kaydeder |
| `save_binary(step_key, data, filename)` | Binary dosya kaydeder (ses, gorsel) |
| `load_json(step_key, filename?)` | JSON yukler (None donerse bulunamadi) |
| `load_text(step_key, filename?)` | Metin yukler |
| `load_binary(step_key, filename)` | Binary dosya yukler |
| `has_output(step_key, filename?)` | Cikti var mi ve boyutu > 0 mi kontrol eder |
| `get_output_path(step_key, filename)` | Mutlak dosya yolunu dondurur |
| `get_relative_path(step_key, filename)` | Goreceli dosya yolunu dondurur |
| `list_step_files(step_key)` | Adima ait tum dosyalari listeler |
| `clear_step(step_key)` | Adimin tum ciktilarini siler |

---

## Modul Sistemi

### ContentModule ABC

`backend/modules/base.py` dosyasinda tanimli soyut sinif.

**Capability enum:**
```python
class Capability(str, Enum):
    SCRIPT_GENERATION   = "script_generation"
    METADATA_GENERATION = "metadata_generation"
    TTS                 = "tts"
    VISUALS             = "visuals"
    SUBTITLES           = "subtitles"
    COMPOSITION         = "composition"
    THUMBNAIL           = "thumbnail"
    PUBLISH             = "publish"
```

**PipelineStepDef dataclass:**

| Alan | Tip | Aciklama |
|------|-----|----------|
| `key` | str | Benzersiz adim anahtari (ornegin "script") |
| `label` | str | Kullaniciya gosterilen etiket |
| `order` | int | Calisma sirasi |
| `capability` | Capability | Bu adimin hangi yetenegi kullandigi |
| `execute` | async callable | Adimu calitiran fonksiyon |
| `is_fatal` | bool | Basarisizlikta pipeline dursun mu |
| `default_provider` | str, opsiyonel | Varsayilan provider |

**ContentModule ozellikleri:**
- `name`: Modul anahtari (ornegin "standard_video")
- `display_name`: Goruntuleme adi
- `description`: Modul aciklamasi
- `capabilities`: Desteklenen yetenekler listesi

**Abstract metodlar:**
- `get_pipeline_steps()` -> `list[PipelineStepDef]`
- `get_default_config()` -> `dict`

**Yardimci metodlar:**
- `has_capability(cap)` -> bool
- `get_step_keys()` -> list[str]
- `get_step_definitions_for_db()` -> veritabanina yazilacak adim bilgileri

### ModuleRegistry

`backend/modules/registry.py` dosyasindaki singleton registry.

| Method | Aciklama |
|--------|----------|
| `register(module)` | Yeni modul kaydet |
| `get(name)` | Ada gore modul al |
| `list_modules()` | Tum modulleri listele |
| `list_names()` | Modul adlarini listele |
| `is_registered(name)` | Modul kayitli mi kontrol et |

**Otomatik kayitlar:**
- `standard_video`: Aktif
- `news_bulletin`: Yorum satirinda (Faz 8 icin)
- `product_review`: Yorum satirinda (Faz 8 icin)

### StandardVideoModule

`backend/modules/standard_video/` dizininde yasar.

**config.py -- DEFAULT_CONFIG (onemli ayarlar):**

| Ayar | Varsayilan | Aciklama |
|------|-----------|----------|
| `scene_count` | 10 | Sahne sayisi |
| `target_duration` | 180 | Hedef video suresi (saniye) |
| `language` | tr | Icerik dili |
| `llm_provider` | gemini | Kullanulan LLM |
| `llm_model` | gemini-2.5-flash | LLM modeli |
| `tts_provider` | edge_tts | TTS saglayicisi |
| `tts_voice` | tr-TR-AhmetNeural | TTS sesi |
| `visuals_provider` | pexels | Gorsel saglayicisi |
| `subtitle_style` | standard | Altyazi stili |
| `video_resolution` | 1920x1080 | Cozunurluk |

**pipeline.py -- 6 Adimli Pipeline:**

**1. step_script (olumcul)**
- LLM'ye `_SCRIPT_SYSTEM_INSTRUCTION` ile istek gonderir
- JSON formatinda sahne listesi alir
- `_normalize_script()` ile dogrulama ve duzeltme yapar
- Cikti: `step_script.json` (sahne verisi)

**2. step_metadata (olumcul degil)**
- LLM'ye YouTube SEO verisi olusturma istegi gonderir
- Baslik, aciklama, etiketler, kategori alir
- Basarisiz olursa `_fallback_metadata()` ile varsayilan deger uretir
- Cikti: `step_metadata.json`

**3. step_tts (olumcul)**
- Her sahne icin provider_registry uzerinden TTS cagrisi yapar
- MP3 ses dosyalari ve kelime-seviye zamanlama verileri (`word_timings`) uretir
- Cikti: Her sahne icin `.mp3` dosyasi + zamanlama JSON'u

**4. step_visuals (olumcul degil)**
- Her sahne icin gorsel arama yapar (video veya foto)
- Bulunan gorselleri indirir
- Basarisiz olursa pipeline devam eder (gorsel olmadan)
- Cikti: Indirilen medya dosyalari

**5. step_subtitles (olumcul degil)**
- TTS adiminin `word_timings` verisini kullanir
- Altyazi segmentleri olusturur (kelime gruplama, zamanlama)
- Cikti: `step_subtitles.json`

**6. step_composition (olumcul)**
- Tum onceki adimlarin ciktilarini birlestirerek Remotion props manifest'i olusturur
- Remotion render cagrisi icin hazir JSON yapisi uretir
- Cikti: `step_composition.json` (Remotion inputProps)

---

## Provider Sistemi

### BaseProvider ABC

`backend/providers/base.py` dosyasindaki soyut sinif.

**ProviderCategory enum:**
```python
class ProviderCategory(str, Enum):
    LLM         = "llm"
    TTS         = "tts"
    VISUALS     = "visuals"
    COMPOSITION = "composition"
    SUBTITLES   = "subtitles"
```

**ProviderResult dataclass:**

| Alan | Tip | Aciklama |
|------|-----|----------|
| `success` | bool | Islem basarili mi |
| `provider_name` | str | Provider adi |
| `data` | Any | Dondurdulen veri |
| `error` | str, opsiyonel | Hata mesaji |
| `cost_estimate_usd` | float | Tahmini API maliyeti |
| `metadata` | dict, opsiyonel | Ek bilgiler (token sayisi, sure, vb.) |

**Abstract metodlar:**
- `execute(input_data, config)` -> `ProviderResult`
- `health_check(config)` -> `bool`

**Sinif ozellikleri:**
- `name`: Provider anahtari (ornegin "gemini")
- `category`: ProviderCategory degeri

### ProviderRegistry

`backend/providers/registry.py` dosyasindaki singleton.

| Method | Aciklama |
|--------|----------|
| `register(provider)` | Yeni provider kaydet |
| `get(category, name)` | Kategoriye ve ada gore provider al |
| `list_category(category)` | Kategorideki tum provider'lari listele |
| `list_all()` | Tum provider'lari listele |
| `get_ordered_providers(category, config)` | 3 adimli siralama ile provider listesi dondur |
| `execute_with_fallback(category, input_data, config)` | Sirayla dene, ilk basariliyi dondur |
| `health_check_all(config)` | Tum provider'larin saglik kontrolu |

**get_ordered_providers() siralama mantigi:**
```
1. config["{kategori}_fallback_order"] -> Admin tarafindan tanimlanmis acik siralama
2. config["{kategori}_provider"]       -> Birincil secim
3. Kayit sirasi                         -> Geri donus (fallback)
```

**execute_with_fallback():** Sirayla her provider'i dener. Ilk basarili sonucu dondurur. Hepsi basarisiz olursa son hatayı ProviderResult olarak dondurur.

**Otomatik kayitlar:** GeminiProvider, EdgeTTSProvider, PexelsProvider

### GeminiProvider

`backend/providers/llm/gemini.py` -- Google Gemini API entegrasyonu.

**input_data alanlari:**

| Alan | Aciklama |
|------|----------|
| `prompt` | Kullanici istegi |
| `system_instruction` | Sistem talimati |
| `model` | Model adi (varsayilan: gemini-2.0-flash) |
| `temperature` | Yaraticilik parametresi |
| `max_output_tokens` | Maksimum cikti token sayisi |
| `response_format` | "text" veya "json" |

**Konfigurasyon:** `gemini_api_key` veya `kieai_api_key` (hangisi mevcutsa)

**Ozellikler:**
- `google.generativeai.generate_content_async()` kullanir
- JSON modu destekler (response_format="json")
- Token bazli maliyet hesaplamasi yapar
- Saglik kontrolu: "Say OK" test istegi gonderir

### EdgeTTSProvider

`backend/providers/tts/edge_tts_provider.py` -- Microsoft Edge TTS entegrasyonu.

**input_data alanlari:**

| Alan | Varsayilan | Aciklama |
|------|-----------|----------|
| `text` | (zorunlu) | Seslendirme metni |
| `voice` | tr-TR-AhmetNeural | Ses modeli |
| `rate` | -- | Konusma hizi |
| `volume` | -- | Ses seviyesi |
| `pitch` | -- | Ses perdesi |

**Donus verisi:**

| Alan | Aciklama |
|------|----------|
| `audio_bytes` | MP3 ses verisi (bytes) |
| `word_timings` | `[{word, start_ms, end_ms, duration_ms}, ...]` |
| `duration_ms` | Toplam ses suresi |

**Ozellikler:**
- API anahtari gerektirmez (ucretsiz)
- `edge_tts.Communicate()` ile `boundary="WordBoundary"` streaming kullanir
- Kelime-seviye zamanlama verileri altyazi sistemi tarafindan kullanilir
- Maliyet: $0.00

### PexelsProvider

`backend/providers/visuals/pexels.py` -- Pexels gorsel arama entegrasyonu.

**input_data alanlari:**

| Alan | Aciklama |
|------|----------|
| `query` | Arama sorgusu |
| `media_type` | "video" veya "photo" |
| `count` | Istenen gorsel sayisi |
| `orientation` | Gorsel yonu (landscape, portrait) |
| `min_duration` | Minimum video suresi (sadece video icin) |

**Ozellikler:**
- `httpx` async client kullanir
- Video ve foto arama destekler
- Dosyalari indirir ve `content_bytes` olarak dondurur
- Maliyet: $0.00

---

## 5-Katmanli Ayar Sistemi

Ayarlar 5 katman halinde ustuste uygulanir. Her katman, onceki katmanin degerlerini override eder.

```
Oncelik (dusuk -> yuksek):

[Katman 1] Global Defaults       <- config.py'deki _GLOBAL_DEFAULTS (kodda sabit)
    |
[Katman 2] Admin Defaults        <- scope="admin", scope_id=""  (SQLite)
    |
[Katman 3] Module Defaults       <- scope="module", scope_id="standard_video"  (SQLite)
    |
[Katman 4] Provider Defaults     <- scope="provider", scope_id="edge_tts"  (SQLite)
    |
[Katman 5] User Overrides        <- scope="user", scope_id=""  (SQLite)
```

**Kilit mekanizmasi:**
Admin veya modul katmaninda bir anahtar `locked=True` olarak isaretlenebilir. Kilitlenmis anahtarlar Katman 5'te (kullanici override) override edilemez. Bu, admin'in belirli ayarlari zorlamasi icin kullanilir.

**SettingsResolver.resolve() cagrisi:**
```python
resolved = SettingsResolver.resolve(
    module_key="standard_video",    # Katman 3 icin
    provider_key="edge_tts",        # Katman 4 icin
    user_overrides={"language": "en"}  # Katman 5
)
# resolved.settings -> birlesmis dict
# resolved.locked_keys -> ["tts_voice", "video_resolution"] gibi liste
```

**Ornek birlestirme akisi:**
```
Katman 1: {language: "tr", scene_count: 10, tts_voice: "tr-TR-AhmetNeural"}
Katman 2: {scene_count: 8}                              -> scene_count: 8
Katman 3: {tts_voice: "tr-TR-EmelNeural", locked: tts_voice}
Katman 4: (bos)
Katman 5: {language: "en", tts_voice: "en-US-GuyNeural"} -> tts_voice: KILITLI, override reddedildi

Sonuc: {language: "en", scene_count: 8, tts_voice: "tr-TR-EmelNeural"}
```

---

## Frontend Gelistirme

### Ayaga Kaldirma

```bash
cd frontend
npm install
npm run dev
# -> http://127.0.0.1:5173
```

Backend'in `http://127.0.0.1:8000` adresinde calisiyor olmasi gerekir.

### Zustand Store'lari

**useUIStore (`stores/uiStore.ts`):**

| State | Tip | Aciklama |
|-------|-----|----------|
| `theme` | "light" / "dark" | Aktif tema |
| `sidebarCollapsed` | boolean | Sidebar daraltilmis mi |
| `mobileSidebarOpen` | boolean | Mobil sidebar acik mi |
| `adminUnlocked` | boolean | Admin paneli acilmis mi |
| `toasts` | Toast[] | Bildirim listesi |

Persist: `theme` ve `sidebarCollapsed` localStorage'a yazilir.

**useJobStore (`stores/jobStore.ts`):**

| State / Method | Aciklama |
|---------------|----------|
| `jobs` | Is listesi |
| `stats` | Durum bazli istatistikler |
| `totalJobs` | Toplam is sayisi |
| `loading` | Yukleniyor durumu |
| `error` | Hata mesaji |
| `selectedJobId` | Secili is ID'si |
| `fetchJobs(page, pageSize, filters)` | Is listesini ceker |
| `fetchJobById(id)` | Tekil is ceker |
| `fetchStats()` | Istatistikleri ceker |
| `createJob(data)` | Yeni is olusturur |
| `cancelJob(id)` | Isi iptal eder |
| `subscribeToJob(id)` | SSE akisina abone olur |

**useSettingsStore (`stores/settingsStore.ts`):**

| State / Method | Aciklama |
|---------------|----------|
| `userDefaults` | Kullanici varsayilanlari |
| `resolvedSettings` | Cozumlenmis ayarlar (5-katman sonucu) |
| `lockedKeys` | Kilitlenmis anahtar listesi |
| `fetchResolvedSettings()` | Backend'den cozumlenmis ayarlari ceker |

Persist: `userDefaults` localStorage'a yazilir.

**useAdminStore (`stores/adminStore.ts`):**

| Method | Aciklama |
|--------|----------|
| `fetchSettings(scope, scopeId)` | Admin ayarlarini ceker |
| `createSetting(data)` | Yeni ayar olusturur |
| `updateSetting(id, data)` | Ayar gunceller |
| `deleteSetting(id)` | Ayar siler |
| `deleteJob(id)` | Is siler |

Tum admin store metodlari `X-Admin-Pin` basligini otomatik ekler.

### API Client

`frontend/src/api/client.ts` dosyasi merkezi HTTP istemcidir.

**api nesnesi:**
```typescript
// Temel kullanim
const jobs = await api.get<JobListResponse>("/jobs", { params: { page: 1 } });
const job = await api.post<JobResponse>("/jobs", { module_key: "standard_video", title: "Test" });
await api.patch(`/jobs/${id}`, { status: "cancelled" });
await api.delete(`/jobs/${id}`, { adminPin: "1234" });
```

**APIError sinifi:**
```typescript
class APIError extends Error {
    status: number;    // HTTP durum kodu
    data: any;         // Yanit govdesi
}
```

**openSSE() fonksiyonu:**
```typescript
interface SSEHandlers {
    onJobStatus?: (data: any) => void;
    onStepUpdate?: (data: any) => void;
    onLog?: (data: any) => void;
    onComplete?: (data: any) => void;
    onError?: (data: any) => void;
    onHeartbeat?: (data: any) => void;
    onConnectionError?: (error: Error) => void;
}

const unsubscribe = openSSE(`/jobs/${jobId}/events`, handlers);
// Aboneligi kapatmak icin:
unsubscribe();
```

### Vite Proxy

`vite.config.ts` dosyasinda tanimli proxy kurallari:

| Frontend Yolu | Hedef |
|--------------|-------|
| `/api/*` | `http://127.0.0.1:8000` |
| `/health` | `http://127.0.0.1:8000` |

Bu sayede frontend kodunda sadece goreceli yollar (`/api/jobs`) kullanilir. Ayri bir `API_URL` ayarlarina gerek yoktur.

### Layout Yapisi

```
AppShell (mode: "user" | "admin")
├── Sidebar
│   ├── Logo + uygulama adi
│   ├── Navigasyon linkleri (mode'a gore degisir)
│   │   ├── User: Dashboard, Video Olustur, Isler, Ayarlar
│   │   └── Admin: Dashboard, Genel Ayarlar, Moduller, Provider'lar, Isler
│   ├── Admin/User gecis baglantisi
│   └── Daralt/Genislet butonu
├── Header
│   ├── Hamburger menu (mobil)
│   ├── Sayfa basligi
│   ├── Dark/Light tema toggle
│   └── Admin PIN butonu ve modali
└── <Outlet /> -- React Router aktif sayfa bileseni
```

### Sayfa Bilesenleri

**Kullanici sayfalari (`pages/user/`):**

| Dosya | Aciklama |
|-------|----------|
| `Dashboard.tsx` | Is istatistikleri, saglik durumu, son isler, hizli eylemler |
| `CreateVideo.tsx` | Modul secimi, baslik, dil, gelismis ayar paneli, is olusturma formu |
| `JobList.tsx` | Filtrelenmis is listesi, sayfalama, durum bazli renk rozetleri |
| `JobDetail.tsx` | SSE canli ilerleme cubugu, adim adimlari, log akisi, iptal butonu |
| `UserSettings.tsx` | 5 bolumlu ayar formu (dil, TTS, gorsel, video, altyazi), kilit gostergeleri |

**Admin sayfalari (`pages/admin/`):**

| Dosya | Aciklama |
|-------|----------|
| `AdminDashboard.tsx` | Detayli istatistikler, saglik metrikleri, is dagilimi grafikleri |
| `GlobalSettings.tsx` | Admin ayarlari CRUD tablosu, kilit acma/kapama toggle'lari |
| `ModuleManager.tsx` | Modul etkinlestirme/devre disi birakma, modul-ozel ayar paneli |
| `ProviderManager.tsx` | API anahtari yonetimi, kategori bazli yedek siralama (fallback order) |
| `AdminJobs.tsx` | Tum islerin listesi, toplu temizlik, tekil silme |

### Yardimci Fonksiyonlar

**cn() (`lib/utils.ts`):**
```typescript
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
```

`clsx` ile kosullu sinif birlesimi, `twMerge` ile Tailwind sinif catisma cozumu saglar.

---

## Remotion Gelistirme

### Ayaga Kaldirma

```bash
cd remotion
npm install
npx remotion studio
# -> Remotion Studio tarayicida acilir (varsayilan port 3000)
```

### Yapilandirma (`remotion.config.ts`)

| Ayar | Deger | Aciklama |
|------|-------|----------|
| Codec | H.264 | Genis uyumluluk |
| CRF | 18 | Kalite/boyut dengesi |
| Image Format | JPEG | Ara kare formati |
| GL Renderer | ANGLE | GPU hizlandirma |

### Composition Yapisi

`Root.tsx` dosyasinda 3 composition kayitlidir:

| Composition ID | Modul | Aciklama |
|---------------|-------|----------|
| `StandardVideo` | standard_video | Sirasal sahneler: ses + gorsel + altyazi |
| `NewsBulletin` | news_bulletin | Alt-bant grafikleri, haber ogeleri |
| `ProductReview` | product_review | 5-bolumlu yapi, puan gosterimi |

### Tip Tanimlari (`types.ts`)

Remotion composition'larinin ihtiyac duydugu tum veri tipleri bu dosyada tanimlidir:

| Tip | Aciklama |
|-----|----------|
| `SceneData` | Tek bir sahnenin tum verileri (metin, ses, gorsel, sure) |
| `WordTiming` | Kelime-seviye zamanlama: word, start_ms, end_ms, duration_ms |
| `SubtitleStyle` | Altyazi gorsel ayarlari |
| `VideoSettings` | Cozunurluk, FPS, codec gibi genel video ayarlari |

### Yeni Composition Ekleme

1. `remotion/src/types.ts` dosyasina yeni props arayuzu ekle
2. `remotion/src/compositions/` altina yeni `.tsx` dosyasi olustur
3. `remotion/src/Root.tsx` dosyasinda `<Composition>` ile kaydet

---

## Veritabani

**Motor:** SQLite 3.x, WAL (Write-Ahead Logging) modu

**Dosya:** `contentmanager.db` (config.py'deki `database_path` ayarinda belirtilen konumda)

**PRAGMA ayarlari:**

| PRAGMA | Deger | Aciklama |
|--------|-------|----------|
| `journal_mode` | WAL | Concurrent read/write destegi |
| `synchronous` | NORMAL | Performans/guvenlik dengesi |
| `foreign_keys` | ON | Yabanci anahtar kontrolu aktif |
| `cache_size` | -64000 | 64MB bellek ici onbellek |
| `temp_store` | MEMORY | Gecici tablolar bellekte tutulur |

**3 tablo:**

| Tablo | Aciklama |
|-------|----------|
| `jobs` | Ana is kayitlari |
| `job_steps` | Is adim kayitlari (1:N iliski) |
| `settings` | 5-katmanli ayar deposu |

---

## Log Sistemi

`backend/utils/logger.py` dosyasinda tanimli yapisal log sistemi.

**Kullanim:**
```python
from backend.utils.logger import get_logger

logger = get_logger(__name__)
logger.info("TTS sentezi tamamlandi", job_id="abc123", step="tts", provider="edge_tts", duration_ms=1240)
```

**Cikti formati (JSON):**
```json
{
    "timestamp": "2026-03-29T16:30:06.323Z",
    "level": "INFO",
    "logger": "backend.pipeline.tts",
    "message": "TTS sentezi tamamlandi",
    "job_id": "abc123",
    "step": "tts",
    "provider": "edge_tts",
    "duration_ms": 1240
}
```

**Teknik detaylar:**
- `_LOGRECORD_RESERVED` set'i: Python'un dahili LogRecord alanlariyla cakismayi onler. Ek anahtar kelime argumanlari `ctx_` prefix'i ile eklenir.
- Loglar stderr'e yazilir
- `get_logger(__name__)` ile modul bazli logger nesnesi alinir

---

## Yeni Modul Ekleme Rehberi

Adim adim yeni bir icerik modulu ekleme sureci:

**Adim 1 -- Backend modul dizini olustur:**
```
backend/modules/new_module/
├── __init__.py         # new_module_module nesnesi export
├── config.py           # DEFAULT_CONFIG dict
└── pipeline.py         # Adim fonksiyonlari + modul sinifi
```

**Adim 2 -- config.py yazimi:**
```python
DEFAULT_CONFIG = {
    "scene_count": 5,
    "language": "tr",
    "llm_provider": "gemini",
    "llm_model": "gemini-2.5-flash",
    "tts_provider": "edge_tts",
    "tts_voice": "tr-TR-AhmetNeural",
    # ... modulun ihtiyac duydugu tum ayarlar
}
```

**Adim 3 -- pipeline.py yazimi:**
```python
from backend.modules.base import ContentModule, Capability, PipelineStepDef
from .config import DEFAULT_CONFIG

async def step_script(job_id: str, step_key: str, config: dict, cache) -> dict:
    """Senaryo olusturma adimi."""
    # LLM cagrisi, sonucu cache.save_json() ile kaydet
    return {"scene_count": len(scenes)}

async def step_tts(job_id: str, step_key: str, config: dict, cache) -> dict:
    """Seslendirme adimi."""
    # TTS cagrisi, sonucu cache.save_binary() ile kaydet
    return {"duration_ms": total_duration}

class NewModuleModule(ContentModule):
    name = "new_module"
    display_name = "Yeni Modul"
    description = "Modul aciklamasi"
    capabilities = [Capability.SCRIPT_GENERATION, Capability.TTS]

    def get_pipeline_steps(self) -> list[PipelineStepDef]:
        return [
            PipelineStepDef(
                key="script", label="Senaryo", order=1,
                capability=Capability.SCRIPT_GENERATION,
                execute=step_script, is_fatal=True
            ),
            PipelineStepDef(
                key="tts", label="Seslendirme", order=2,
                capability=Capability.TTS,
                execute=step_tts, is_fatal=True
            ),
        ]

    def get_default_config(self) -> dict:
        return DEFAULT_CONFIG.copy()

new_module_module = NewModuleModule()
```

**Adim 4 -- Registry'ye kayit (`backend/modules/registry.py`):**
```python
from backend.modules.standard_video import standard_video_module
from backend.modules.new_module import new_module_module

module_registry.register(standard_video_module)
module_registry.register(new_module_module)
```

**Adim 5 -- Remotion composition ekle:**
- `remotion/src/compositions/NewModule.tsx` dosyasi olustur
- `remotion/src/types.ts` dosyasina gerekli tipleri ekle
- `remotion/src/Root.tsx` dosyasina `<Composition>` kaydini ekle

**Adim 6 -- Frontend guncelle:**
- Ilgili sayfa bilesenlerinde MODULE_INFO listesine yeni modulu ekle

---

## Yeni Provider Ekleme Rehberi

Adim adim yeni bir servis saglayicisi ekleme sureci:

**Adim 1 -- Provider dosyasi olustur:**
```python
# backend/providers/{kategori}/new_provider.py

from backend.providers.base import BaseProvider, ProviderResult, ProviderCategory

class NewProvider(BaseProvider):
    name = "new_provider"
    category = ProviderCategory.TTS  # veya LLM, VISUALS, vb.

    async def execute(self, input_data: dict, config: dict) -> ProviderResult:
        """Asil islemi gerceklestirir."""
        try:
            api_key = config.get("new_provider_api_key")
            if not api_key:
                return ProviderResult(
                    success=False, provider_name=self.name,
                    data=None, error="API anahtari eksik"
                )

            # ... API cagrisi ...

            return ProviderResult(
                success=True, provider_name=self.name,
                data=result_data, cost_estimate_usd=0.01,
                metadata={"model": "v1"}
            )
        except Exception as e:
            return ProviderResult(
                success=False, provider_name=self.name,
                data=None, error=str(e)
            )

    async def health_check(self, config: dict) -> bool:
        """Saglayicinin calisip calismadigini kontrol eder."""
        try:
            result = await self.execute({"text": "test"}, config)
            return result.success
        except Exception:
            return False
```

**Adim 2 -- Registry'ye kayit (`backend/providers/registry.py`):**
```python
from backend.providers.tts.new_provider import NewProvider

provider_registry.register(NewProvider())
```

**Adim 3 -- API anahtari ekle (`backend/config.py`):**
```python
class Settings(BaseSettings):
    # ... mevcut alanlar ...
    new_provider_api_key: str = ""
```

**Adim 4 -- .env.example dosyasini guncelle:**
```
NEW_PROVIDER_API_KEY=
```

**Adim 5 -- Frontend ProviderManager guncelle:**
Provider listesine yeni saglayiciyi ekle (ad, kategori, API anahtari alani).

---

## Kodlama Standartlari

### Python

| Kural | Aciklama |
|-------|----------|
| Tip bilgisi | Tum fonksiyon parametreleri ve donus degerleri tip anotasyonlu olmali |
| Pydantic | Veri modelleri icin Pydantic v2 kullan |
| Docstring | Turkce fonksiyon dokumantasyonu |
| Isimlendirme | `snake_case` (fonksiyon, degisken, dosya) |
| Dosya boyutu | Maksimum 300 satir; gerekirse modullere bol |

### TypeScript

| Kural | Aciklama |
|-------|----------|
| Strict mode | `tsconfig.json`'da `strict: true` |
| Isimlendirme | `camelCase` (degisken, fonksiyon), `PascalCase` (bilesen, tip) |
| Bilesenler | Fonksiyonel bilesenler, hook tabanlari |
| Dosya boyutu | Maksimum 300 satir |

### CSS

| Kural | Aciklama |
|-------|----------|
| Tailwind | Yalnizca utility class kullan |
| Ozel CSS | Sadece `index.css` dosyasinda (global stiller) |
| Dark mode | `class` stratejisi (`dark:` prefix) |
| Animasyonlar | `tailwind.config.ts`'deki ozel animasyonlar |

### Genel

| Kural | Aciklama |
|-------|----------|
| Yorum felsefesi | "Ne yapiyor" degil, "neden yapiyor" acikla |
| Dosya siniri | Her dosya maksimum 300 satir |
| Ortam degiskenleri | `.env` dosyasinda, asla kaynak kodda degil |
| Hata yonetimi | Provider'larda try/except + ProviderResult donusu; Pipeline'da is_fatal kontrolu |

---

*Bu dokuman v0.7.0 itibariyle guncellenmistir. Her faz tamamlandiginda icerik guncellenir.*
