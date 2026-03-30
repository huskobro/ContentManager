# ContentManager — Talep Kayıt Dokümanı

> Bu doküman kullanıcıdan gelen her isteği kayıt altına alır ve durumlarını takip eder.
> Her istek benzersiz bir `REQ-XXX` kimliği alır. Hiçbir talep kayıtsız kalmaz.

---

## Durum Açıklamaları

| Durum | Anlamı |
|-------|--------|
| Bekliyor | Talep alındı, henüz işlenmedi |
| Analiz Edildi | Talep incelendi, kapsam belirlendi |
| Yapılıyor | Aktif olarak geliştirme sürecinde |
| Tamamlandı | Tamamen karşılandı |
| Kısmen Tamamlandı | Talebin bir kısmı karşılandı, kalan kısım sonraki faza bırakıldı |
| Reddedildi | Teknik veya mimari nedenle uygulanmadı |

---

## Talep Listesi

### REQ-001: ContentManager Sisteminin Sıfırdan Kurulması

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-001 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | 4 referans projeyi (YTRobot, YTRobot-v3, YouTubeStoryGenerator, youtube_video_bot) analiz ederek, en iyi ürün mantığını çıkararak sıfırdan yeni, temiz, modüler, localhost-first, genişletilebilir bir YouTube içerik üretim platformu oluştur. |
| **Kapsam** | Tam proje: backend (FastAPI + SQLite WAL), frontend (React + Vite + Tailwind + Shadcn + Zustand), video composition (Remotion), 3 içerik modülü (standard_video, news_bulletin, product_review), provider sistemi (LLM, TTS, Visuals, Composition), 5 katmanlı ayar override mimarisi, dual UI (user + admin), yaşayan dokümantasyon sistemi |
| **Öncelik** | Kritik |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | Tüm proje |
| **İlgili Dosyalar** | Tüm dosyalar |
| **Uygulanma Notları** | 10 faz tamamlandı: Faz 1 (iskelet), Faz 2 (veri modeli + API), Faz 3 (User UI), Faz 4 (Admin panel), Faz 5 (pipeline core), Faz 6 (provider entegrasyonu), Faz 7 (dokümantasyon), Faz 8 (modül entegrasyonu), Faz 9 (Remotion video), Faz 10 (temizlik + v1.0.0). |
| **Riskler** | Referans projelerdeki kie.ai bağımlılığı yeni sistemde de Gemini API erişimi için korunuyor; kie.ai'nin kapanma riski var — fallback olarak doğrudan Google Gemini API desteği planlandı |
| **Açık Kalan Noktalar** | ORM modelleri (Faz 2), pipeline runner (Faz 2), provider implementasyonları (Faz 6), UI sayfa içerikleri (Faz 3–4), Remotion animasyonlar (Faz 8) |

---

### REQ-002: Faz 2 Bölüm 1 — Veritabanı Modelleri, Pydantic Şemaları ve Ayar Çözücü Motoru

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-002 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 2'nin ilk bölümü: Job/JobStep/Setting ORM modelleri, tüm Pydantic v2 request/response şemaları ve 5 katmanlı ayar çözümleme motoru (SettingsResolver) oluşturulması. |
| **Kapsam** | `backend/models/job.py` (Job + JobStep ORM), `backend/models/settings.py` (Setting ORM), `backend/models/schemas.py` (tüm Pydantic şemaları), `backend/services/settings_resolver.py` (5 katmanlı hiyerarşi motoru) |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/models, backend/services |
| **İlgili Dosyalar** | `backend/models/job.py`, `backend/models/settings.py`, `backend/models/schemas.py`, `backend/services/__init__.py`, `backend/services/settings_resolver.py` |
| **Uygulanma Notları** | Job modeli UUID4 hex ID, ISO-8601 timestamps, cascade ilişki, WAL-uyumlu indeksler ile tasarlandı. Setting modeli tek tablo (scope, scope_id, key) benzersiz üçlüsü ile 5 katmanı destekler. SettingsResolver Global→Admin→Module→Provider→User hiyerarşisini uygular, locked alanları korur, upsert/bulk_upsert/delete/list_scope yardımcı metodları içerir. |
| **Riskler** | Yok — temel veri katmanı, harici bağımlılık içermiyor |
| **Açık Kalan Noktalar** | Faz 2 Bölüm 2'de JobManager servisi ve API route'ları yazılacak |

---

### REQ-003: Faz 3 — User UI Temel Akışları

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-003 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 3: Kullanıcı arayüzü temel akışlarının tamamlanması — Zustand store'ların gerçek API endpoint'lerine bağlanması, tüm user sayfalarının (Dashboard, CreateVideo, JobList, JobDetail, UserSettings) tam işlevsel hale getirilmesi, SSE ile canlı job takibi. |
| **Kapsam** | Frontend: API client SSE desteği, Zustand store API entegrasyonu, 5 kullanıcı sayfası, dark mode, responsive tasarım |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | frontend/src/api, frontend/src/stores, frontend/src/pages/user |
| **İlgili Dosyalar** | `frontend/src/api/client.ts`, `frontend/src/stores/jobStore.ts`, `frontend/src/stores/settingsStore.ts`, `frontend/src/App.tsx`, `frontend/src/pages/user/Dashboard.tsx`, `frontend/src/pages/user/CreateVideo.tsx`, `frontend/src/pages/user/JobList.tsx`, `frontend/src/pages/user/JobDetail.tsx`, `frontend/src/pages/user/UserSettings.tsx` |
| **Uygulanma Notları** | client.ts: BASE_URL `/api` düzeltmesi + SSE named event desteği (job_status, step_update, log, heartbeat, complete, error). jobStore: fetchJobs/fetchJobById/fetchStats/createJob/cancelJob API metotları + subscribeToJob SSE aboneliği. settingsStore: fetchResolvedSettings + 5-katmanlı ayar eşleştirmesi. Dashboard: gerçek istatistik kartları, sistem sağlık kontrolü, son 5 iş listesi, hızlı başlat kısayolları. CreateVideo: modül seçim kartları, başlık/konu girişi, dil seçimi, gelişmiş ayarlar accordion, POST /api/jobs → JobDetail yönlendirmesi. JobList: durum filtresi (6 sekme), modül filtresi (dropdown), sayfalama (15/sayfa), renk kodlu badge'ler, progress bar. JobDetail: SSE canlı ilerleme, pipeline adım listesi (provider/süre/maliyet bilgisi), canlı log viewer (auto-scroll + kopyalama), iptal butonu, hata mesajı gösterimi. UserSettings: 5 bölüm (dil, TTS, altyazı, video/görsel, yayın), kilitli ayarlar readonly, toggle switch'ler, kaydet/sıfırla butonları. |
| **Riskler** | Backend henüz pipeline çalıştırmadığı için SSE stream boş olacaktır — Faz 5'te gerçek pipeline ile test edilecek |
| **Açık Kalan Noktalar** | Faz 4'te admin sayfaları, Faz 5'te gerçek pipeline entegrasyonu |

---

### REQ-004: Faz 4 — Admin/Master Panel ve Yetkili Sistem Yönetimi

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-004 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 4: Admin/master panelinin tam işlevsel hale getirilmesi — Admin Zustand store ile X-Admin-Pin korumalı API entegrasyonu, AdminDashboard (istatistik + sağlık), GlobalSettings (admin scope ayar CRUD + kilit toggle), ModuleManager (modül aktif/pasif + modül bazlı ayarlar), ProviderManager (API key maskeli input + fallback sırası), AdminJobs (tüm işler + iptal/silme yetkisi). Backend'e DELETE /api/jobs/{id} endpoint eklenmesi. |
| **Kapsam** | Backend: Job silme endpoint. Frontend: adminStore, 5 admin sayfası, App.tsx route güncellemesi |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/api/jobs, backend/services/job_manager, frontend/src/stores, frontend/src/pages/admin |
| **İlgili Dosyalar** | `backend/api/jobs.py`, `backend/services/job_manager.py`, `frontend/src/stores/adminStore.ts`, `frontend/src/App.tsx`, `frontend/src/pages/admin/AdminDashboard.tsx`, `frontend/src/pages/admin/GlobalSettings.tsx`, `frontend/src/pages/admin/ModuleManager.tsx`, `frontend/src/pages/admin/ProviderManager.tsx`, `frontend/src/pages/admin/AdminJobs.tsx` |
| **Uygulanma Notları** | Backend: `delete_job()` metodu eklendi (sadece terminal durumdaki işler silinebilir), `DELETE /api/jobs/{id}` endpoint'i admin PIN korumalı. adminStore: fetchSettings/createSetting/updateSetting/deleteSetting/deleteJob metotları, tümü X-Admin-Pin header ile korunuyor. AdminDashboard: istatistik kartları (toplam, başarı oranı, başarısız, aktif), sistem sağlık durumu, iş dağılım çubuğu, hızlı yönetim kısayolları. GlobalSettings: admin scope ayar listesi, inline düzenleme, kilit toggle (Lock/Unlock), yeni ayar ekleme formu, silme. ModuleManager: 3 modül kartı (standard_video, news_bulletin, product_review), aktif/pasif toggle, genişletilebilir ayar paneli, modüle özel ayar CRUD. ProviderManager: 7 provider (gemini, openai_llm, elevenlabs, openai_tts, edge_tts, pexels, pixabay), API key maskeli input (Eye/EyeOff toggle), model/voice ayarları, fallback sırası düzenleyici. AdminJobs: tüm işler tablosu (20/sayfa), durum/modül filtreleri, iptal/silme butonları, toplu temizlik ("Tamamlananları Temizle"). |
| **Riskler** | Fallback sırası şu an virgülle ayrılmış string olarak saklanıyor — Faz 5'te drag-drop sıralama eklenebilir |
| **Açık Kalan Noktalar** | CostTracker sayfası ayrı faza bırakıldı (maliyet verisi pipeline çalışmadan anlamsız), Faz 5'te gerçek pipeline ile test |

---

### REQ-005: Faz 5 — İçerik Üretim Motoru (Pipeline Core + Standard Video Module)

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-005 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 5: Sistemin kalbi olan içerik üretim motorunun kurulması — CacheManager (session bazlı çıktı önbellekleme), PipelineRunner (asenkron iş yürütme motoru), ContentModule ABC + Capability sistemi, ModuleRegistry, StandardVideoModule (6 adımlı mock pipeline), ve POST /api/jobs endpoint'inin pipeline başlatmasının eklenmesi. |
| **Kapsam** | Backend: pipeline/cache.py, pipeline/runner.py, modules/base.py, modules/registry.py, modules/standard_video/ (3 dosya), api/jobs.py güncellemesi, utils/logger.py LogRecord çakışma düzeltmesi |
| **Öncelik** | Kritik |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/pipeline, backend/modules, backend/api, backend/utils |
| **İlgili Dosyalar** | `backend/pipeline/cache.py`, `backend/pipeline/runner.py`, `backend/modules/base.py`, `backend/modules/registry.py`, `backend/modules/standard_video/__init__.py`, `backend/modules/standard_video/config.py`, `backend/modules/standard_video/pipeline.py`, `backend/api/jobs.py`, `backend/utils/logger.py` |
| **Uygulanma Notları** | CacheManager: JSON/text/binary kaydetme-okuma, has_output kontrolü, step dizin yönetimi, temizlik. PipelineRunner: Kendi SessionLocal() ile background task, step bazlı try/catch, fatal/non-fatal ayrımı, cache idempotency, SSE log+step yayınlama. ContentModule ABC: name/display_name/description/capabilities alanları, get_pipeline_steps() ve get_default_config() abstract metotları. Capability enum: 8 tür (script, metadata, tts, visuals, subtitles, composition, thumbnail, publish). ModuleRegistry: dict tabanlı, explicit import ile kayıt. StandardVideoModule: 6 mock step (asyncio.sleep + fake JSON/binary), her step DB'yi ve cache'i güncelliyor. Jobs API: asyncio.create_task(run_pipeline(job.id)) ile otomatik başlatma. Logger fix: LogRecord reserved key çakışması "ctx_" prefix ile çözüldü. |
| **Riskler** | Tüm step'ler mock — gerçek API entegrasyonu Faz 6'da. Max concurrent jobs limiti henüz uygulanmıyor (semaphore Faz 9'da). |
| **Açık Kalan Noktalar** | Faz 6'da gerçek provider implementasyonları (Gemini, ElevenLabs, Edge TTS, Pexels, Remotion), Faz 9'da concurrent job limiti ve timeout |

---

### REQ-006: Faz 6 — Provider Pattern, Fallback Zinciri ve Gerçek API Entegrasyonları

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-006 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 6: Provider mimarisinin kurulması ve gerçek API entegrasyonları — BaseProvider ABC + ProviderResult dönüş modeli, ProviderRegistry (kategori bazlı kayıt + fallback zinciri), GeminiProvider (Google Gemini LLM), EdgeTTSProvider (ücretsiz Microsoft TTS + word-level timing), PexelsProvider (stok video/fotoğraf arama + indirme). Pipeline step'lerinin mock'tan gerçek provider çağrılarına geçirilmesi. |
| **Kapsam** | Backend: providers/base.py, providers/registry.py, providers/llm/gemini.py, providers/tts/edge_tts_provider.py, providers/visuals/pexels.py, modules/standard_video/pipeline.py güncellemesi |
| **Öncelik** | Kritik |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/providers, backend/modules/standard_video |
| **İlgili Dosyalar** | `backend/providers/__init__.py`, `backend/providers/base.py`, `backend/providers/registry.py`, `backend/providers/llm/__init__.py`, `backend/providers/llm/gemini.py`, `backend/providers/tts/__init__.py`, `backend/providers/tts/edge_tts_provider.py`, `backend/providers/visuals/__init__.py`, `backend/providers/visuals/pexels.py`, `backend/providers/composition/__init__.py`, `backend/modules/standard_video/pipeline.py` |
| **Uygulanma Notları** | BaseProvider ABC: name/category alanları, async execute() + health_check(). ProviderResult Pydantic modeli: success/data/error/cost_estimate_usd/metadata. ProviderRegistry: kategori bazlı depolama, get_ordered_providers() (3 yollu sıralama: explicit fallback → config default → kayıt sırası), execute_with_fallback() (sıralı deneme, hata loglama, son hata raporlama), health_check_all(). GeminiProvider: google-generativeai ile async generate_content_async(), JSON response_format desteği, token bazlı maliyet hesabı, system_instruction desteği. EdgeTTSProvider: edge-tts paketi, WordBoundary event'leri ile kelime-seviye zamanlama, MP3 formatı, ücretsiz. PexelsProvider: httpx ile async API çağrısı, video + foto arama, otomatik dosya indirme, HD kalite seçimi. Pipeline güncelleme: Prompt şablonları (_SCRIPT_SYSTEM_INSTRUCTION, _METADATA_SYSTEM_INSTRUCTION), _normalize_script() + _fallback_parse_script() güvenlik katmanları, gerçek TTS word-timing ile altyazı oluşturma, composition Remotion props hazırlama. |
| **Riskler** | google-generativeai paketi deprecated — google.genai'ye geçiş planlanmalı. Pexels rate limit (200/saat). Gemini quota limitleri. Edge TTS servisi Microsoft tarafından aniden kapatılabilir. |
| **Açık Kalan Noktalar** | ElevenLabs TTS provider (ücretli, yüksek kalite), OpenAI TTS/LLM provider, Pixabay visuals provider, Remotion gerçek render (Faz 8), Provider health check UI (Faz 9) |

---

### REQ-007: Faz 7 — Yaşayan Dokümantasyon ve Mimari Karar Kayıtları (ADR)

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-007 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 7: Sistemin tüm dokümantasyonunun eksiksiz hale getirilmesi. Kullanıcı rehberi (USER_GUIDE), geliştirici teknik rehberi (DEVELOPER_GUIDE), UI↔Backend eşleştirme tabloları (FEATURES_AND_ACTIONS), mimari karar kayıtları (ARCHITECTURE — 15 ADR), talep kayıtları (REQUEST_LOG — REQ-007) ve detaylı sürüm notları (CHANGELOG — v0.1.0 ile v0.7.0 arası). Kod yazılmayacak; Faz 1–6'da yazılan tüm gerçek kodun belgelenmesi yapılacak. |
| **Kapsam** | 6 doküman: `docs/USER_GUIDE.md`, `docs/DEVELOPER_GUIDE.md`, `docs/FEATURES_AND_ACTIONS.md`, `docs/ARCHITECTURE.md`, `docs/REQUEST_LOG.md`, `docs/CHANGELOG.md` |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | docs/ (tamamı) |
| **İlgili Dosyalar** | `docs/USER_GUIDE.md`, `docs/DEVELOPER_GUIDE.md`, `docs/FEATURES_AND_ACTIONS.md`, `docs/ARCHITECTURE.md`, `docs/REQUEST_LOG.md`, `docs/CHANGELOG.md`, `docs/IMPLEMENTATION_REPORT.md` |
| **Uygulanma Notları** | USER_GUIDE v0.7.0: Kurulum, 3 servis başlatma, Dashboard/CreateVideo/JobList/JobDetail/UserSettings tam rehber, Admin panel (PIN, modül/provider/ayar yönetimi, toplu temizlik), pipeline 6 adım açıklaması, SSE canlı izleme, 9 SSS maddesi. DEVELOPER_GUIDE v0.7.0: Tam dizin yapısı (backend/frontend/remotion), config.py ayar grupları, 3 ORM model (Job/JobStep/Setting), 12+ API endpoint, 4 Zustand store, SSE hook, 5 katmanlı ayar motoru, pipeline runner + cache, modül sistemi (ContentModule ABC + Capability enum + PipelineStepDef), provider sistemi (BaseProvider + 3-way fallback), yeni modül ve provider ekleme adım-adım rehberleri. FEATURES_AND_ACTIONS v0.7.0: AppShell/Sidebar/Header bileşen eşleştirmeleri, 10 sayfa (5 user + 5 admin) her birinin buton→API→store tam haritası, 4 Zustand store metot→endpoint tabloları, SSE event tipi→handler eşleştirmesi. ARCHITECTURE v0.7.0: 15 ADR (001–015), Faz 5'ten 3 yeni (pipeline, modül sistemi, SSE), Faz 6'dan 2 yeni (provider fallback, Edge TTS varsayılan), mimari genel bakış diyagramı, veri akışı. CHANGELOG: v0.1.0 ile v0.7.0 arası 7 sürüm detaylı notları. REQUEST_LOG: REQ-007 kaydı. |
| **Riskler** | Yok — saf dokümantasyon fazı, kod değişikliği içermez |
| **Açık Kalan Noktalar** | IMPLEMENTATION_REPORT Faz 7 karşılama raporu bu dokümanla birlikte güncellendi |

---

### REQ-008: Faz 8 — Referans Projelerden Seçilen Özelliklerin Entegrasyonu

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-008 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 8: Referans projelerden (YTRobot, youtube_video_bot) seçilen en değerli özelliklerin ContentManager'a entegre edilmesi — Haber bülteni modülü (URL/RSS içerik çekme + bülten senaryosu), ürün inceleme modülü (Pro/Con format + 5 bölümlü yapı), kategori-spesifik prompt sistemi (6 kategori), açılış hook çeşitliliği (8 hook, tekrar önleme), gelişmiş altyazı sistemi (Whisper API + 5 stil). |
| **Kapsam** | Backend: news_bulletin modülü (3 dosya), product_review modülü (3 dosya), pipeline/steps/script.py (kategori + hook sistemi), pipeline/steps/subtitles.py (Whisper + 5 stil), standard_video pipeline güncelleme, registry güncelleme |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/modules/news_bulletin, backend/modules/product_review, backend/pipeline/steps, backend/modules/standard_video, backend/modules/registry |
| **İlgili Dosyalar** | `backend/modules/news_bulletin/__init__.py`, `backend/modules/news_bulletin/config.py`, `backend/modules/news_bulletin/pipeline.py`, `backend/modules/product_review/__init__.py`, `backend/modules/product_review/config.py`, `backend/modules/product_review/pipeline.py`, `backend/pipeline/steps/__init__.py`, `backend/pipeline/steps/script.py`, `backend/pipeline/steps/subtitles.py`, `backend/modules/standard_video/pipeline.py`, `backend/modules/registry.py` |
| **Uygulanma Notları** | **News Bulletin:** URL içerik çekme (httpx async + HTML tag stripping regex), haber bülteni formatında senaryo üretimi, URL başarısız olursa konu bazlı fallback, 8 sahne varsayılan, shared step'ler standard_video'dan import. **Product Review:** 5 bölümlü yapılandırılmış inceleme (Hook → Overview → Pros → Cons → Verdict), ürün adı + teknik özellikler girişi, yapılandırılabilir pro/con sayısı ve 1-10 puanlama. **Kategori Sistemi:** 6 kategori (general, true_crime, science, history, motivation, religion) her biri tone/focus/style_instruction ile, build_enhanced_prompt() fonksiyonu system instruction'a kategori bilgisi ekler. **Hook Sistemi:** 8 açılış hook tipi (shocking_fact, question, story, contradiction, future_peek, comparison, personal_address, countdown) TR/EN dil desteği, session-level tekrar önleme (son 6 hook hatırlanır, tükenince sıfırlanır). **Gelişmiş Altyazı:** 3 katmanlı zamanlama (TTS word-timing → Whisper API → eşit dağıtım), 5 stil (standard, neon_blue, gold, minimal, hormozi) Remotion-uyumlu config dict'leri ile. Tüm modüller step_subtitles_enhanced kullanacak şekilde güncellendi. |
| **Riskler** | URL içerik çekme: Hedef sitelerin CORS/robot politikaları engelleyebilir, timeout riski. Whisper API: Ücretli ($0.006/dk), API key gerektirir. google.generativeai paketi deprecated — google.genai'ye geçiş planlanmalı. |
| **Açık Kalan Noktalar** | Remotion gerçek render entegrasyonu (Faz 9), YouTube OAuth upload (Faz 9), karaoke animasyonu (Faz 9), thumbnail üretimi (Faz 9) |

---

### REQ-009: Faz 9 — Stabilizasyon ve Remotion Video Entegrasyonu

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-009 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 9: Remotion video kompozisyon entegrasyonunun tamamlanması — 3 Remotion composition'ın (StandardVideo, NewsBulletin, ProductReview) gerçek `<Sequence>`, `<Audio>`, `<Video>`, `<Img>` bileşenleriyle kodlanması, kelime bazlı altyazı render bileşeni (5 stil), backend composition step'inin Remotion CLI subprocess ile gerçek MP4 render yapması, hata toleransı (eksik görsel/ses/süre fallback'leri). |
| **Kapsam** | Remotion: 3 composition (StandardVideo.tsx, NewsBulletin.tsx, ProductReview.tsx), 1 bileşen (Subtitles.tsx). Backend: composition.py pipeline step. Entegrasyon: 3 modülün pipeline tanımlarında composition step güncelleme. |
| **Öncelik** | Kritik |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | remotion/src/compositions, remotion/src/components, backend/pipeline/steps, backend/modules (3 modül) |
| **İlgili Dosyalar** | `remotion/src/compositions/StandardVideo.tsx`, `remotion/src/compositions/NewsBulletin.tsx`, `remotion/src/compositions/ProductReview.tsx`, `remotion/src/components/Subtitles.tsx`, `backend/pipeline/steps/composition.py`, `backend/modules/standard_video/pipeline.py`, `backend/modules/news_bulletin/pipeline.py`, `backend/modules/product_review/pipeline.py` |
| **Uygulanma Notları** | **StandardVideo:** Ken Burns efekti (zoom-in/out alternate), crossfade geçişler (10 frame), vignette overlay, Video/Img/Audio bileşenleri, fallback (5s süre, koyu gradient). **NewsBulletin:** Lower-third animasyonlu slide-up (15 frame), kategori renk kodlama (5 renk), tarih damgası, haber sayacı. **ProductReview:** Bölüm badge animasyonu (slide-in), ScoreRing SVG animasyonu (verdict'te), Pro/Con ikon gösterimi. **Subtitles.tsx:** 5 stil (standard/neon_blue/gold/minimal/hormozi), 6 kelimelik satır grupları, fade-in/out geçişler, aktif kelime vurgulama (hormozi=sarı, neon=parlama, gold=shimmer). **composition.py:** 3 modül tipi props builder, absolute path resolving, Remotion CLI async subprocess, stdout/stderr streaming. TypeScript 0 hata ile derleniyor. |
| **Riskler** | Remotion render süresi uzun olabilir (video süresi × hesaplama). npx/Remotion kurulu olmalı. Büyük video dosyaları disk alanı gerektirir. |
| **Açık Kalan Noktalar** | Faz 10'da: Concurrent job limiti, log rotation, UI polish, dead code temizliği, temiz makine kurulum testi |

---

### REQ-010: Faz 10 — Son Kalite, Temizlik ve v1.0.0 Yayın Hazırlığı

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-010 |
| **Tarih** | 2026-03-29 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Faz 10: Projenin v1.0.0 yayın kalitesine ulaştırılması — dead code ve unused import temizliği, UI polish (cn() tutarlılığı, spacing), README.md oluşturma (5 dakikada kurulum rehberi), dokümantasyon kapanışı (REQ-010, final IMPLEMENTATION_REPORT, CHANGELOG v1.0.0). |
| **Kapsam** | Backend: unused import temizliği (5 dosya). Proje kökü: README.md. Docs: REQUEST_LOG, IMPLEMENTATION_REPORT, CHANGELOG güncelleme |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/modules, backend/pipeline/steps, backend/providers/tts, docs/, proje kökü |
| **İlgili Dosyalar** | `backend/modules/standard_video/pipeline.py` (dead code: eski step_subtitles + step_composition kaldırıldı, unused `import asyncio` kaldırıldı), `backend/modules/news_bulletin/pipeline.py` (unused `import random` kaldırıldı), `backend/pipeline/steps/composition.py` (unused `import os` kaldırıldı), `backend/pipeline/steps/subtitles.py` (unused `import json` kaldırıldı), `backend/providers/tts/edge_tts_provider.py` (unused `import io` + `import struct` kaldırıldı), `README.md` (yeni), `docs/REQUEST_LOG.md`, `docs/IMPLEMENTATION_REPORT.md`, `docs/CHANGELOG.md` |
| **Uygulanma Notları** | **Dead Code Temizliği:** standard_video/pipeline.py'den eski `step_subtitles()` (~86 satır) ve `step_composition()` (~80 satır) fonksiyonları kaldırıldı — bunlar artık `pipeline/steps/subtitles.py` ve `pipeline/steps/composition.py` tarafından karşılanıyor. 5 dosyada toplam 6 unused import kaldırıldı. **UI Polish:** Frontend cn() kullanımı 14 dosyada tutarlı, spacing/renk sistemi doğru, Shadcn bileşenleri standartlara uygun. **README.md:** Özellik tablosu, mimari diyagram, 5 dakikada kurulum rehberi (6 adım), ortam değişkenleri, proje yapısı, provider fallback şeması, 7 doküman bağlantısı. **Doğrulama:** Python 21/21 çekirdek modül import testi başarılı, Remotion tsc 0 hata, Frontend tsc 0 hata. |
| **Riskler** | Yok — temizlik ve dokümantasyon fazı |
| **Açık Kalan Noktalar** | `backend/services/cost_tracker.py` ve `backend/utils/file_helpers.py` henüz oluşturulmadı (planlanmış ama gerekli olmadığı için ertelendi) |

---

---

### REQ-011: Faz 10.5 — Format (Uzun/Shorts) Ayrımı, Toplu Üretim (Batch) ve Global SSE Kuyruk Mimarisi

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-011 |
| **Tarih** | 2026-03-30 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Sistemi bir "İçerik Fabrikasına" dönüştürmek için üç birbirini tamamlayan özellik: (1) Video formatı ayrımı — yatay (16:9, 1920×1080) ve dikey Shorts/Reels (9:16, 1080×1920) — hem admin tarafından default olarak yapılandırılabilir hem de kullanıcı tarafından iş bazında geçersiz kılınabilir; (2) Toplu üretim (batch) — CreateVideo formundaki tek satır metin girişinin çok satırlı textarea'ya dönüştürülmesi ile her satırın bağımsız bir video işi olarak sıraya alınması; (3) Global İş Kuyruğu ve SSE Yayınlama — mevcut "oluştur ve hemen çalıştır" modelinin yerine işlerin önce QUEUED olarak kaydedilip bir arka plan worker loop tarafından `max_concurrent_jobs` limitine saygı gösterilerek seçilmesi ve frontend'in yenileme yapmadan iş listesi ile Dashboard'daki kartları otomatik güncelleyebilmesi. |
| **Kapsam** | Backend: `backend/config.py` (`default_video_format` alanı), `backend/services/job_manager.py` (worker loop ve global kuyruk mantığı), `backend/main.py` (worker loop başlatma). Frontend: `frontend/src/stores/settingsStore.ts` (`videoFormat` alanı), `frontend/src/pages/user/CreateVideo.tsx` (textarea + format seçimi + batch gönderim döngüsü), `frontend/src/pages/admin/GlobalSettings.tsx` (Varsayılan Video Formatı kartı + Eşzamanlı İşlem Limiti), `frontend/src/pages/user/JobList.tsx` (SSE'siz canlı güncelleme için polling veya global SSE kanalı), `frontend/src/pages/user/Dashboard.tsx` (aktif iş sayacı canlı güncelleme). |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/config, backend/services/job_manager, backend/main, frontend/stores/settingsStore, frontend/pages/user/CreateVideo, frontend/pages/admin/GlobalSettings, frontend/pages/user/JobList, frontend/pages/user/Dashboard |
| **İlgili Dosyalar** | `backend/config.py`, `backend/services/job_manager.py`, `backend/main.py`, `frontend/src/stores/settingsStore.ts`, `frontend/src/pages/user/CreateVideo.tsx`, `frontend/src/pages/admin/GlobalSettings.tsx` |
| **Uygulanma Notları** | **Tamamlandı:** `config.py`'ye `default_video_format: str = "long"` eklendi. `settingsStore.ts`'ye `videoFormat` alanı ve `mapResolvedToDefaults()` eşlemesi eklendi. `CreateVideo.tsx` textarea'ya dönüştürüldü, format seçimi (MonitorPlay/Smartphone ikonu) eklendi, batch gönderim döngüsü (`for...of` + 150ms ara gecikme) uygulandı. Worker loop (`job_worker_loop`) ile `max_concurrent_jobs` limiti backend'de uygulanıyor. Global SSE kanalı (`GET /api/events`) ile tüm sayfalar polling-free anlık güncelleme alıyor. |
| **Riskler** | Toplu iş gönderiminde SQLite WAL kilitlerini önlemek için ardışık POST istekleri arasında 150ms gecikme uygulanıyor. |
| **Açık Kalan Noktalar** | Kuyruktaki sıra bilgisini gösterecek "Sıra: #N" UI bileşeni ileride eklenebilir. |

---

### REQ-012: Faz 10.6–10.9 — Prompt Engine, Cost Tracker, State Sync ve Enterprise UI/UX

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-012 |
| **Tarih** | 2026-03-30 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Sistemi "Enterprise SaaS İçerik Fabrikası" seviyesine çıkaran 4 alt faz: (1) Prompt Yönetim Motoru — tüm pipeline prompt'larının admin panelden CRUD ile yönetilmesi; (2) Maliyet Takibi (Cost Tracker) — provider bazlı maliyet dashboard'u + job granülaritesinde maliyet raporlama; (3) Veri Tutarlılığı — API key enkapsülasyonu (Single Source of Truth), boş değer = sil semantiği, kayıt sonrası state senkronizasyonu; (4) UI/UX Cilası — fallback badge düzeltmesi, modül filtresi segmented control, pipeline race condition kritik bug fix. |
| **Kapsam** | Backend: `pipeline/runner.py` (race condition fix + output path fix), `pipeline/steps/script.py` (prompt override). Frontend: `PromptManager.tsx` (yeni sayfa), `CostTracker.tsx` (yeni sayfa), `GlobalSettings.tsx` (state sync + API key kaldırma), `ProviderManager.tsx` (fallback badge fix + API key enkapsülasyon + "Özel Ayar Ekle" kaldırma), `ModuleManager.tsx` ("Ayar Ekle" kaldırma), `CreateVideo.tsx` (lock mekanizması + video_format fix), `UserSettings.tsx` (lock mekanizması), `JobList.tsx` + `AdminJobs.tsx` (segmented filter), `constants.ts` (yeni dosya, SYSTEM_SETTINGS_SCHEMA + STATUS_CONFIG + MODULE_INFO), `Sidebar.tsx` + `App.tsx` (yeni route'lar) |
| **Öncelik** | Yüksek |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | frontend/src/pages/admin, frontend/src/pages/user, frontend/src/lib, frontend/src/stores, backend/pipeline |
| **İlgili Dosyalar** | `frontend/src/pages/admin/PromptManager.tsx`, `frontend/src/pages/admin/CostTracker.tsx`, `frontend/src/pages/admin/GlobalSettings.tsx`, `frontend/src/pages/admin/ProviderManager.tsx`, `frontend/src/pages/admin/ModuleManager.tsx`, `frontend/src/pages/admin/AdminJobs.tsx`, `frontend/src/pages/user/CreateVideo.tsx`, `frontend/src/pages/user/UserSettings.tsx`, `frontend/src/pages/user/JobList.tsx`, `frontend/src/lib/constants.ts`, `frontend/src/stores/settingsStore.ts`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/App.tsx`, `backend/pipeline/runner.py`, `backend/pipeline/steps/script.py` |
| **Uygulanma Notları** | **Prompt Engine:** PromptManager.tsx admin panelden tüm prompt'ları (script system instruction, metadata, kategori, hook) scope bazlı düzenleme, isDirty + savedValue ile doğru state senkronizasyonu, boş kayıt = silme. **Cost Tracker:** CostTracker.tsx provider bazlı maliyet kartları, iş başına ortalama, toplam maliyet, zaman filtresi. **Data Consistency:** API key alanları SYSTEM_SETTINGS_SCHEMA'dan ve GlobalSettings'ten kaldırıldı — artık yalnızca ProviderManager'da (Single Source of Truth). GlobalSettings'te `isEmpty()` helper + `deleteSetting()` entegrasyonu. ProviderManager'da API key hem provider hem admin scope'a senkron yazılıyor. **State Sync:** GlobalSettings/PromptManager'da her kayıt sonrası `loadData()` çağrısı. FallbackOrderEditor DB'den `useEffect([adminSettings])` ile senkronize, `isDirty` karşılaştırması. CreateVideo'da `fetchResolvedSettings` her modül değişikliğinde çağrılır. **UI/UX:** Fallback badge 1/2/3 doğru sıralama. Modül filtresi segmented button group. "Özel Ayar Ekle" formları kaldırıldı. lockedKeys ile kilitli alanlar disabled + Lock ikonu. **Pipeline Fix:** Runner'da `status not in ("queued", "running")` kontrolü — race condition çözüldü. Output path artık `output/` klasöründeki final videoyu işaret ediyor. |
| **Riskler** | Yok — stabilizasyon ve polish fazı |
| **Açık Kalan Noktalar** | Yok — tüm alt fazlar tam olarak tamamlandı |

---

---

### REQ-013: Faz 10.92 & 10.93 — Zero-Defect Pipeline, Hard Delete, Klasör Seçici, Senkronizasyon

| Alan | Değer |
|------|-------|
| **Kimlik** | REQ-013 |
| **Tarih** | 2026-03-30 |
| **Talep Eden** | Huseyin |
| **Açıklama** | Kod denetimi (Code Audit) raporundaki tüm kritik bulguları gidererek sistemi "Sıfır Hata (Zero-Defect)" durumuna taşı. Görevler: (1) Deprecated `google-generativeai` SDK ve tüm ölü kod referanslarını (Gemini, Pixabay, composition stub) temizle; (2) `output_dir` startup mutation'ını SettingsResolver standart akışıyla değiştir; (3) `/api/admin/costs` gerçek backend endpoint'ini ekle — MOCK_DATA'yı kaldır; (4) İş silme işleminde `.mp4` dosyasını ve session dizinini fiziksel olarak diskten temizle (Hard Delete); (5) Admin panelde `output_dir` için localhost dizin ağacında gezinen klasör seçici dialog ekle; (6) Script adımındaki hardcoded prompt'ları SettingsResolver/PromptManager entegrasyonuyla yönetilebilir hale getir; (7) TTS ve subtitle pipeline'larındaki word-timing kayma sorununu çift taraflı metin normalizasyonuyla çöz; (8) Composition adımındaki `ThreadingMixIn` overengineering'i stdlib `ThreadingHTTPServer` ile sadeleştir. |
| **Kapsam** | Backend: `backend/providers/llm/gemini.py` (silindi), `backend/providers/composition/__init__.py` (silindi), `backend/config.py`, `backend/services/settings_resolver.py`, `backend/services/job_manager.py`, `backend/main.py`, `backend/api/admin.py` (yeni), `backend/pipeline/steps/composition.py`, `backend/pipeline/steps/subtitles.py`, `backend/modules/standard_video/pipeline.py`, `backend/modules/news_bulletin/pipeline.py`, `requirements.txt`. Frontend: `frontend/src/pages/admin/GlobalSettings.tsx` |
| **Öncelik** | Kritik |
| **Durum** | Tamamlandı |
| **İlgili Modüller** | backend/providers, backend/config, backend/services, backend/api, backend/pipeline, frontend/admin |
| **İlgili Dosyalar** | `backend/providers/llm/gemini.py` (silindi), `backend/api/admin.py` (yeni), `backend/main.py`, `backend/config.py`, `backend/services/settings_resolver.py`, `backend/services/job_manager.py`, `backend/pipeline/steps/composition.py`, `backend/pipeline/steps/subtitles.py`, `backend/modules/standard_video/pipeline.py`, `backend/modules/news_bulletin/pipeline.py`, `frontend/src/pages/admin/GlobalSettings.tsx`, `requirements.txt` |
| **Uygulanma Notları** | **Ölü Kod Temizliği:** `gemini.py` silindi, `google-generativeai` requirements'dan çıkarıldı, `pixabay_api_key` config/resolver'dan silindi, composition stub kaldırıldı. **output_dir:** Startup'ta ham SQLAlchemy yerine `SettingsResolver.get()` kullanılıyor. **CostTracker Endpoint:** `backend/api/admin.py` oluşturuldu — `GET /api/admin/costs` DB'den gerçek SUM sorgusu, MOCK_DATA yok. **Hard Delete:** `delete_job()` artık `os.remove(output_path)` + `shutil.rmtree(session_dir)` yapıyor. **Klasör Seçici:** `FolderPickerDialog` bileşeni — `GET /api/admin/directories` ile canlı dizin listesi, breadcrumb, üst/alt gezinti, "Bu Klasörü Seç" butonu. **Prompt Entegrasyonu:** `step_script()` artık `config.get("script_prompt_template")` okuyor; PromptManager'dan ayarlanan değer öncelikli, yoksa varsayılan şablon. **TTS/Subtitle Sync:** `_normalize_narration_for_tts()` ve `_normalize_narration()` fonksiyonları — aynı Markdown temizleme regex'i her iki tarafta; scene_number bazlı lookup ile sıra garantisi. **ThreadingHTTPServer:** Manuel `ThreadingMixIn` kaldırıldı, stdlib `ThreadingHTTPServer` kullanılıyor. **Kontroller:** `tsc --noEmit` hatasız, tüm Python syntax ve import kontrolleri geçti. |
| **Riskler** | Yok — tüm değişiklikler mevcut işlevselliği kırmadan refactor niteliğinde |
| **Açık Kalan Noktalar** | Yok — tüm audit bulguları giderildi |

---

*Her yeni kullanıcı talebi bu dokümana eklenir. Karşılama durumu `IMPLEMENTATION_REPORT.md`'de raporlanır.*
