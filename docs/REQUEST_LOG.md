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
| **Durum** | Kısmen Tamamlandı |
| **İlgili Modüller** | Tüm proje |
| **İlgili Dosyalar** | Tüm dosyalar |
| **Uygulanma Notları** | Faz 1 tamamlandı: backend iskeleti (FastAPI + SQLite WAL + config + logger), frontend iskeleti (React + Vite + Tailwind + Zustand + AppShell + Sidebar + Header + routing), Remotion iskeleti (3 composition tanımı + types), dokümantasyon iskeleti (7 doküman). Faz 2–10 sırasıyla uygulanacak. |
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

*Her yeni kullanıcı talebi bu dokümana eklenir. Karşılama durumu `IMPLEMENTATION_REPORT.md`'de raporlanır.*
