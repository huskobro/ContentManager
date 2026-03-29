# ContentManager — Değişiklik Günlüğü

Tüm önemli değişiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) ve [Semantic Versioning](https://semver.org/lang/tr/) takip eder.

---

## [0.1.0] — 2026-03-29

### Eklenen

**Backend İskeleti:**
- FastAPI uygulama giriş noktası (`backend/main.py`) — lifespan, CORS, istek loglama middleware
- Pydantic BaseSettings konfigürasyonu (`backend/config.py`) — 5 grup ayar, `.env` desteği
- SQLite WAL veritabanı motoru (`backend/database.py`) — concurrent read/write, PRAGMA'lar
- JSON yapılandırılmış log sistemi (`backend/utils/logger.py`) — `get_logger()`, `log_exception()`
- `/health` endpoint — API + DB durum kontrolü
- ORM model stub dosyaları (`backend/models/job.py`, `backend/models/settings.py`)
- `.env.example` — tüm ortam değişkenleri şablonu
- `requirements.txt` — FastAPI, SQLAlchemy, Pydantic v2, provider SDK'ları

**Frontend İskeleti:**
- Vite 5 + React 18 + TypeScript 5 proje yapısı
- Tailwind CSS 3 + Shadcn UI CSS değişken sistemi (dark/light)
- Zustand 5 state management — `uiStore`, `jobStore`, `settingsStore`
- Native fetch API client + SSE helper (`api/client.ts`)
- AppShell layout: collapsible sidebar + responsive header
- Sidebar: user/admin navigasyonu, daralt/genişlet, mobil overlay
- Header: dark/light toggle, admin PIN modalı, hamburger menü
- Dashboard sayfası: özet kartlar, canlı `/health` durum kontrolü, hızlı eylemler
- Admin Dashboard: yönetim kartları (modül, provider, ayarlar, maliyet)
- React Router: user (`/dashboard`, `/create`, `/jobs`, `/settings`) + admin (`/admin/*`)
- Sayfa iskeletleri: CreateVideo, JobList, UserSettings

**Remotion İskeleti:**
- Remotion 4.0.290 proje yapısı (`remotion/`)
- 3 composition tanımı: `StandardVideo`, `NewsBulletin`, `ProductReview`
- `calculateMetadata` ile dinamik süre hesaplama
- Paylaşılan tip tanımları (`types.ts`): SceneData, WordTiming, SubtitleChunk, VideoSettings
- Her composition için boş sahne bilgi ekranı (Remotion Studio preview)

**Dokümantasyon:**
- `USER_GUIDE.md` — kurulum, ilk çalıştırma, arayüz rehberi
- `DEVELOPER_GUIDE.md` — mimari özet, dizin yapısı, geliştirme rehberi
- `FEATURES_AND_ACTIONS.md` — bileşen/buton/ekran işlev tanımları
- `REQUEST_LOG.md` — REQ-001 kaydı
- `IMPLEMENTATION_REPORT.md` — Faz 1 karşılama raporu
- `CHANGELOG.md` — bu dosya
- `ARCHITECTURE.md` — mimari karar kayıtları

**Proje Altyapısı:**
- `.gitignore` — .env, sessions, logs, .tmp, db, node_modules
- Proje dizin yapısı oluşturuldu (backend, frontend, remotion, docs)

---

## [Yayınlanmadı]

### Planlanıyor
- Faz 2: ORM modelleri, Job Manager, Settings Resolver, Pipeline Runner, API route'ları
- Faz 3: User UI sayfa içerikleri (CreateVideo formu, JobList canlı liste, UserSettings formu)
- Faz 4: Admin panel sayfaları (ModuleManager, ProviderManager, GlobalSettings, CostTracker)
