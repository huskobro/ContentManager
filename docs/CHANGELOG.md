# ContentManager — Değişiklik Günlüğü

Tüm önemli değişiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) ve [Semantic Versioning](https://semver.org/lang/tr/) takip eder.

---

## [1.0.0] — 2026-03-29

### Production Release — Son Kalite ve Temizlik

**Dead Code Temizliği (Faz 10):**
- `backend/modules/standard_video/pipeline.py` — Eski `step_subtitles()` (~86 satır) ve `step_composition()` (~80 satır) fonksiyonları kaldırıldı (artık `pipeline/steps/` altındaki modüller kullanılıyor)
- 5 dosyada unused import temizliği: `asyncio`, `random`, `os`, `json`, `io`, `struct`

**README.md:**
- Proje kökünde kapsamlı README oluşturuldu: özellik tablosu, mimari diyagram, 5 dakikada kurulum rehberi (6 adım), ortam değişkenleri, proje yapısı, provider fallback şeması, 7 doküman bağlantısı

**Dokümantasyon Kapanışı:**
- `docs/REQUEST_LOG.md` — REQ-010 kaydı
- `docs/IMPLEMENTATION_REPORT.md` — Faz 10 karşılama raporu + genel proje özeti
- `docs/CHANGELOG.md` — v1.0.0 Production Release

### Doğrulama Sonuçları
- Python backend: 21/21 çekirdek modül import testi başarılı
- Remotion TypeScript: 0 hata (tsc --noEmit)
- Frontend TypeScript: 0 hata (tsc --noEmit)
- Hiçbir dosyada TODO veya placeholder yok

---

## [0.9.0] — 2026-03-29

### Eklenen — Remotion Video Entegrasyonu ve Stabilizasyon

**Remotion Composition'lar (Faz 9):**
- `remotion/src/compositions/StandardVideo.tsx` — Ken Burns efekti (zoom-in/out alternate), crossfade geçişler, vignette overlay, `<Video>`/`<Img>`/`<Audio>` bileşenleri
- `remotion/src/compositions/NewsBulletin.tsx` — Animasyonlu lower-third (slide-up), kategori renk kodlama (5 renk), tarih damgası overlay
- `remotion/src/compositions/ProductReview.tsx` — Bölüm badge animasyonu, ScoreRing SVG (verdict animasyonu), Pro/Con ikon gösterimi
- `remotion/src/components/Subtitles.tsx` — 5 altyazı stili (standard, neon_blue, gold, minimal, hormozi), kelime bazlı senkronizasyon, 6 kelimelik satır grupları, fade-in/out geçişler

**Backend Composition Step:**
- `backend/pipeline/steps/composition.py` — Props builder'lar (3 modül tipi), absolute path resolving, Remotion CLI async subprocess çağrısı, stdout/stderr streaming, hata toleransı

### Değişen
- `backend/modules/standard_video/pipeline.py` — Composition step artık `step_composition_remotion` kullanıyor
- `backend/modules/news_bulletin/pipeline.py` — Composition step `step_composition_remotion` olarak güncellendi
- `backend/modules/product_review/pipeline.py` — Composition step `step_composition_remotion` olarak güncellendi

---

## [0.8.0] — 2026-03-29

### Eklenen — Referans Projelerden Seçilen Özelliklerin Entegrasyonu

**Yeni Modüller (Faz 8):**
- `backend/modules/news_bulletin/` — Haber bülteni video üretim modülü (URL/RSS içerik çekme, bülten formatında senaryo, 8 sahne varsayılan)
- `backend/modules/product_review/` — Ürün inceleme video üretim modülü (5 bölümlü Pro/Con format: Hook → Overview → Pros → Cons → Verdict)

**Kategori Prompt Sistemi:**
- `backend/pipeline/steps/script.py` — 6 içerik kategorisi (general, true_crime, science, history, motivation, religion) her biri tone/focus/style_instruction ile
- `build_enhanced_prompt()` — System instruction'a kategori bilgisi + hook talimatı ekleme

**Açılış Hook Çeşitliliği:**
- 8 hook tipi (shocking_fact, question, story, contradiction, future_peek, comparison, personal_address, countdown)
- TR ve EN dil desteği (toplam 16 hook tanımı)
- Session-level tekrar önleme (son 6 hook hatırlanır, tükenince otomatik sıfırlanır)

**Gelişmiş Altyazı Sistemi:**
- `backend/pipeline/steps/subtitles.py` — 3 katmanlı zamanlama stratejisi (TTS word-timing → Whisper API → eşit dağıtım)
- 5 altyazı stili: standard, neon_blue, gold, minimal, hormozi (Remotion-uyumlu config dict'leri)
- OpenAI Whisper API entegrasyonu (word-level timestamps, $0.006/dk)

### Değişen
- `backend/modules/standard_video/pipeline.py` — step_script() artık build_enhanced_prompt() kullanıyor, subtitles adımı step_subtitles_enhanced() ile değiştirildi
- `backend/modules/registry.py` — news_bulletin_module ve product_review_module import + register aktif edildi
- Tüm modüller (news_bulletin, product_review) gelişmiş altyazı sistemi kullanıyor

---

## [0.7.0] — 2026-03-29

### Eklenen — Yaşayan Dokümantasyon ve Mimari Karar Kayıtları

**Dokümanlar (Faz 7):**
- `USER_GUIDE.md` v0.7.0 — Kapsamlı kullanıcı rehberi (kurulum, 3 servis başlatma, Dashboard/CreateVideo/JobList/JobDetail/UserSettings tam rehber, Admin panel yönetimi, 6 adımlı pipeline açıklaması, SSE canlı izleme, 9 SSS maddesi)
- `DEVELOPER_GUIDE.md` v0.7.0 — Tam teknik geliştirici rehberi (dizin yapısı, ORM modelleri, API endpoint'leri, Zustand store'ları, pipeline runner, cache sistemi, modül ve provider ekleme adım-adım rehberleri, 5 katmanlı ayar motoru)
- `FEATURES_AND_ACTIONS.md` v0.7.0 — UI↔Backend eşleştirme tabloları (10 sayfa, 4 Zustand store, SSE event tipleri, her butonun API endpoint'i ve store metodu)
- `ARCHITECTURE.md` v0.7.0 — 15 mimari karar kaydı (ADR-001 ile ADR-015 arası): FastAPI, SQLite WAL, React+Vite, Tailwind+Radix, Zustand, Remotion, in-process job queue, native Fetch, 5-layer settings, pipeline cache idempotency, module ABC+registry, provider fallback chain, Edge TTS default, SSE, JSON logging
- `REQUEST_LOG.md` — REQ-007 kaydı (Faz 7 dokümantasyon talebi)
- `CHANGELOG.md` — v0.1.0 ile v0.7.0 arası tüm sürüm notları

---

## [0.6.0] — 2026-03-29

### Eklenen — Provider Pattern, Fallback Zinciri ve Gerçek API Entegrasyonları

**Provider Çekirdek Mimarisi (Faz 6):**
- `backend/providers/base.py` — BaseProvider ABC, ProviderResult Pydantic modeli, ProviderCategory enum (LLM, TTS, VISUALS, COMPOSITION, SUBTITLES)
- `backend/providers/registry.py` — ProviderRegistry: kategori bazlı kayıt, `get_ordered_providers()` (3 yollu sıralama: explicit fallback → config default → kayıt sırası), `execute_with_fallback()` (sıralı deneme, ilk başarılı sonuç dönüşü), `health_check_all()`

**Gerçek Provider İmplementasyonları:**
- `backend/providers/llm/gemini.py` — GeminiProvider: `google-generativeai` ile async `generate_content_async()`, JSON `response_mime_type` desteği, token bazlı maliyet hesabı ($0.075/1M input, $0.30/1M output), `system_instruction` desteği
- `backend/providers/tts/edge_tts_provider.py` — EdgeTTSProvider: `edge-tts` v7+ paketi, `Communicate()` ile `boundary="WordBoundary"` streaming, kelime seviye zamanlama (100-nanosaniye birimlerinden ms'ye dönüşüm), MP3 formatı, ücretsiz ($0.00)
- `backend/providers/visuals/pexels.py` — PexelsProvider: `httpx` async client, video/foto arama, HD+ kalite seçimi (`_select_best_video_file()`), otomatik dosya indirme, ücretsiz ($0.00)

**Pipeline Güncelleme (Mock → Gerçek):**
- `backend/modules/standard_video/pipeline.py` — Tüm 6 step gerçek provider çağrılarına geçirildi:
  - `step_script`: Hardcoded Türkçe prompt şablonları (`_SCRIPT_SYSTEM_INSTRUCTION`), JSON sahne çıktısı, `_normalize_script()` doğrulama, `_fallback_parse_script()` güvenlik katmanı
  - `step_metadata`: YouTube SEO metadata üretimi, `_fallback_metadata()` LLM başarısızlığında (non-fatal)
  - `step_tts`: Sahne bazlı TTS sentezi, MP3 + word_timings kaydetme
  - `step_visuals`: Sahne bazlı görsel arama ve indirme (non-fatal)
  - `step_subtitles`: TTS word-timing verisinden altyazı segmentleri oluşturma (non-fatal)
  - `step_composition`: Remotion props manifest hazırlama (gerçek render Faz 8'de)

**Doküman Güncellemeleri:**
- `REQUEST_LOG.md` — REQ-006 kaydı
- `IMPLEMENTATION_REPORT.md` — Faz 6 karşılama raporu

---

## [0.5.0] — 2026-03-29

### Eklenen — Pipeline Core, Cache Sistemi ve İlk İçerik Modülü

**Pipeline Altyapısı (Faz 5):**
- `backend/pipeline/cache.py` — CacheManager: session bazlı dosya önbellekleme (`sessions/{job_id}/`), `save_json()`/`load_json()`, `save_text()`/`load_text()`, `save_binary()`/`load_binary()`, `has_output()` idempotency kontrolü, `clear_step()` temizlik
- `backend/pipeline/runner.py` — PipelineRunner: `run_pipeline(job_id)` async background task, kendi `SessionLocal()` ile izole DB oturumu, cache-aware step yürütme (`_execute_step()`), fatal/non-fatal adım ayrımı, SSE log + step yayınlama, `CancelledError` yakalama

**Modül Sistemi:**
- `backend/modules/base.py` — ContentModule ABC: name/display_name/description/capabilities alanları, `get_pipeline_steps()` ve `get_default_config()` abstract metotları. Capability enum (8 tür: SCRIPT_GENERATION, METADATA_GENERATION, TTS, VISUALS, SUBTITLES, COMPOSITION, THUMBNAIL, PUBLISH). PipelineStepDef dataclass (key, label, order, capability, execute, is_fatal, default_provider)
- `backend/modules/registry.py` — ModuleRegistry: dict tabanlı, explicit import kayıt, `get()`, `list_modules()`, `list_names()`

**Standard Video Modülü:**
- `backend/modules/standard_video/__init__.py` — Modül export
- `backend/modules/standard_video/config.py` — DEFAULT_CONFIG (30+ ayar: scene_count=10, target_duration=180, language=tr, llm_model=gemini-2.5-flash, tts_voice=tr-TR-AhmetNeural, video_resolution=1920x1080, vb.)
- `backend/modules/standard_video/pipeline.py` — 6 adımlı pipeline tanımı + StandardVideoModule sınıfı

**API Entegrasyonu:**
- `backend/api/jobs.py` — `create_job()` artık `asyncio.create_task(run_pipeline(job.id))` ile pipeline başlatıyor

**Düzeltmeler:**
- `backend/utils/logger.py` — `_LOGRECORD_RESERVED` frozenset eklendi: Python logging'in built-in LogRecord nitelikleriyle (module, filename) çakışan extra anahtarlar `ctx_` prefix ile yeniden adlandırılıyor

---

## [0.4.0] — 2026-03-29

### Eklenen — Admin/Master Panel ve Yetkili Sistem Yönetimi

**Backend (Faz 4):**
- `backend/api/jobs.py` — `DELETE /api/jobs/{id}` endpoint: admin PIN korumalı, sadece terminal durumdaki işler silinebilir (204 No Content)
- `backend/services/job_manager.py` — `delete_job()` metodu: `LookupError` (job bulunamadı), `ValueError` (terminal olmayan job)

**Frontend Admin Sayfaları:**
- `frontend/src/stores/adminStore.ts` — useAdminStore: `fetchSettings()`, `createSetting()`, `updateSetting()`, `deleteSetting()`, `deleteJob()` — tümü `X-Admin-Pin` header korumalı, PIN `localStorage` "cm-admin-pin"
- `frontend/src/pages/admin/AdminDashboard.tsx` — İstatistik kartları (toplam, başarı oranı %, başarısız, aktif), sistem sağlık durumu, iş dağılım çubukları, hızlı yönetim kısayolları
- `frontend/src/pages/admin/GlobalSettings.tsx` — Admin scope ayar CRUD, inline düzenleme (Enter/Escape), kilit toggle (Lock/Unlock), yeni ayar ekleme formu, silme
- `frontend/src/pages/admin/ModuleManager.tsx` — 3 modül kartı (standard_video, news_bulletin, product_review), aktif/pasif toggle, genişletilebilir modül ayar paneli, ayar CRUD
- `frontend/src/pages/admin/ProviderManager.tsx` — 7 provider (gemini, openai_llm, elevenlabs, openai_tts, edge_tts, pexels, pixabay), API key maskeli input (Eye/EyeOff), fallback sırası düzenleyici (virgülle ayrılmış string), provider ayar CRUD
- `frontend/src/pages/admin/AdminJobs.tsx` — Tüm işler tablosu (20/sayfa), durum/modül filtreleri, iptal/silme butonları, toplu temizlik ("Tamamlananları Temizle")

**Route Güncellemeleri:**
- `frontend/src/App.tsx` — Admin route'ları eklendi: `/admin/dashboard`, `/admin/global-settings`, `/admin/modules`, `/admin/providers`, `/admin/jobs`

---

## [0.3.0] — 2026-03-29

### Eklenen — User UI Temel Akışları

**Frontend Kullanıcı Sayfaları (Faz 3):**
- `frontend/src/api/client.ts` — SSE named event desteği (`openSSE()` ile `job_status`, `step_update`, `log`, `heartbeat`, `complete`, `error` event'leri), `SSEHandlers` arayüzü
- `frontend/src/stores/jobStore.ts` — API entegrasyonu: `fetchJobs()`, `fetchJobById()`, `fetchStats()`, `createJob()`, `cancelJob()`, `subscribeToJob()` (SSE abonelik + unsubscribe), yerel mutasyonlar (`upsertJob`, `updateJobStatus`, `updateStep`, `appendLog`)
- `frontend/src/stores/settingsStore.ts` — `fetchResolvedSettings()`: 5 katmanlı çözümlenmiş ayarlar + locked_keys, localStorage persist
- `frontend/src/pages/user/Dashboard.tsx` — Gerçek istatistik kartları (4 adet), `/health` ile sistem sağlık durumu, son 5 iş listesi (progress bar + durum badge), 3 modül hızlı başlat kartı
- `frontend/src/pages/user/CreateVideo.tsx` — 3 modül seçim kartı, başlık/konu input, 5 dil seçimi, gelişmiş ayarlar accordion (TTS provider, altyazı stili), `POST /api/jobs` → `/jobs/{id}` yönlendirmesi
- `frontend/src/pages/user/JobList.tsx` — 6 durum filtre sekmesi, modül dropdown filtresi, 15/sayfa sayfalama, responsive tablo (Başlık, Modül, İlerleme, Durum, Tarih)
- `frontend/src/pages/user/JobDetail.tsx` — SSE canlı ilerleme aboneliği, pipeline adım listesi (durum ikonu, provider, süre, maliyet, cached badge), canlı log viewer (auto-scroll + kopyalama), iptal butonu, hata mesajı gösterimi, çıktı dosya linki
- `frontend/src/pages/user/UserSettings.tsx` — 5 bölüm (dil, TTS, altyazı, video/görsel, yayın), 11 ayar alanı, kilit ikonu (admin-locked), kaydet/sıfırla butonları

---

## [0.2.0] — 2026-03-29

### Eklenen — Çekirdek Backend, Veri Modeli, Ayar Motoru ve API Route'ları

**Veritabanı Modelleri (Faz 2):**
- `backend/models/job.py` — Job ORM (id, module_key, title, language, status, current_step, error_message, session_dir, output_path, cost_estimate_usd, resolved_settings_json) + JobStep ORM (key, label, order, status, message, provider, duration_ms, cost_estimate_usd, cached, output_artifact)
- `backend/models/settings.py` — Setting ORM (scope, scope_id, key, value JSON-encoded, locked, description), benzersiz kısıt (scope, scope_id, key)
- `backend/models/schemas.py` — 11 Pydantic v2 şeması: JobCreate, JobResponse, JobListResponse, JobStatusUpdate, JobStepResponse, SettingCreate, SettingUpdate, SettingResponse, SettingBulkCreate, ResolvedSettingsResponse, HealthResponse

**Servisler:**
- `backend/services/settings_resolver.py` — SettingsResolver: 5 katmanlı hiyerarşi motoru (Global → Admin → Module → Provider → User), `locked` alan koruması, `resolve()`, `upsert()`, `bulk_upsert()`, `list_scope()`, `delete()`
- `backend/services/job_manager.py` — JobManager: Job CRUD, durum geçiş doğrulaması (_VALID_TRANSITIONS), step yönetimi, maliyet toplama. _SSEHub: In-memory asyncio.Queue subscriber pattern, `publish()`, `publish_and_close()`, heartbeat. `recover_interrupted_jobs()`: Sistem restart sonrası running→queued kurtarma

**API Endpoint'leri:**
- `backend/api/jobs.py` — 6 endpoint: POST/GET/GET(stats)/GET(id)/PATCH/GET(events SSE) `/api/jobs`
- `backend/api/settings.py` — 6 endpoint: GET(resolved)/GET/POST/POST(bulk)/PUT/DELETE `/api/settings`
- Admin PIN doğrulama: `_require_admin()` dependency, `X-Admin-Pin` header kontrolü

**Düzeltmeler:**
- `backend/database.py` — `Base.__allow_unmapped__ = True` eklendi (SQLAlchemy 2.0 + `from __future__ import annotations` uyumu)

---

## [0.1.0] — 2026-03-29

### Eklenen — Temel İskelet ve Çekirdek Mimari

**Backend İskeleti (Faz 1):**
- `backend/main.py` — FastAPI uygulama giriş noktası: `lifespan()` (DB tablolarını başlatma), `_log_requests()` middleware (method, path, status, duration_ms loglama), `/health` endpoint (API + DB durum kontrolü), CORS yapılandırması
- `backend/config.py` — Pydantic BaseSettings: 4 ayar grubu (uygulama/sunucu, veritabanı/dosya, provider API key'leri, pipeline varsayılanları), `.env` dosyasından okuma, `_parse_cors()` ve `_ensure_dirs()` validator'ları
- `backend/database.py` — SQLite WAL motoru: PRAGMA optimizasyonları (journal_mode=WAL, synchronous=NORMAL, foreign_keys=ON, cache_size=-64000, temp_store=MEMORY), `pool_pre_ping=True`, `SessionLocal`, `get_db()`, `create_tables()`, `check_db_health()`
- `backend/utils/logger.py` — JSON yapılandırılmış log sistemi: `get_logger(__name__)`, keyword argüman desteği (job_id, step, provider, duration_ms)
- `requirements.txt` — Python bağımlılıkları: FastAPI, SQLAlchemy, Pydantic v2, Uvicorn, google-generativeai, edge-tts, httpx, python-dotenv
- `.env.example` — Tüm ortam değişkenleri şablonu

**Frontend İskeleti:**
- Vite 5 + React 18 + TypeScript 5 proje yapısı
- Tailwind CSS 3 + Shadcn UI CSS değişken sistemi (dark/light)
- Zustand 5: `uiStore` (tema, sidebar, admin, toast), `jobStore` (işler, istatistik), `settingsStore` (kullanıcı varsayılanları)
- `api/client.ts` — Native fetch wrapper + `openSSE()` helper + `APIError` sınıfı
- `AppShell.tsx` — Responsive layout (sidebar + header + outlet)
- `Sidebar.tsx` — User/admin navigasyonu, daralt/genişlet, mobil overlay
- `Header.tsx` — Dark/light toggle, admin PIN modalı, sayfa başlığı
- `App.tsx` — React Router v6: user route'ları (`/dashboard`, `/create`, `/jobs`, `/jobs/:jobId`, `/settings`) + admin route'ları (`/admin/*`)
- Dashboard sayfası (canlı): özet kartlar, sistem sağlık kontrolü, hızlı eylemler

**Remotion İskeleti:**
- Remotion 4.0.290 proje yapısı
- 3 composition tanımı: `StandardVideo`, `NewsBulletin`, `ProductReview`
- `calculateMetadata` ile dinamik süre hesaplama (sahne sürelerinden toplam frame)
- Paylaşılan tip tanımları (`types.ts`): SceneData, WordTiming, SubtitleChunk, SubtitleStyle, VideoSettings, StandardVideoProps, NewsItem, NewsBulletinProps, ReviewSection, ProductReviewProps
- `remotion.config.ts`: H.264 codec, CRF 18, JPEG images, ANGLE OpenGL renderer

**Dokümantasyon İskeleti:**
- 7 doküman oluşturuldu: USER_GUIDE, DEVELOPER_GUIDE, FEATURES_AND_ACTIONS, ARCHITECTURE, REQUEST_LOG, IMPLEMENTATION_REPORT, CHANGELOG
- REQ-001 kayıt (ContentManager sisteminin sıfırdan kurulması)

**Proje Altyapısı:**
- `.gitignore` — .env, sessions/, logs/, .tmp/, *.db, node_modules/
- Proje dizin yapısı: backend/, frontend/, remotion/, docs/, sessions/, logs/, .tmp/

---

## [Yayınlanmadı]

### Gelecek İyileştirmeler
- YouTube OAuth upload entegrasyonu
- Karaoke animasyonu (KaraokeText.tsx)
- RSS feed parser (feedparser paketi)
- Concurrent job limiti (asyncio.Semaphore)
- Log rotation (10MB dosya limiti)
- ElevenLabs / OpenAI TTS provider implementasyonları
- Pixabay visuals provider implementasyonu
- CostTracker sayfası (admin panel)
- Drag-drop fallback sıralaması
- Voice cloning desteği
- Thumbnail üretimi
