# ContentManager — Tam Kod ve Operasyonel Gerçeklik Denetimi

> **Denetim Tarihi:** 2026-03-30
> **Denetçi:** Kıdemli Yazılım Mimarı (AI destekli)
> **Kod Tabanı Sürümü:** v1.5.0
> **Denetim Kapsamı:** Tam kod tabanı — backend, frontend, remotion, servisler, sağlayıcılar, pipeline

---

## 1. Yönetici Özeti

ContentManager, 4 farklı referans projeden harmanlanan ve localhost-first, moduler bir YouTube içerik üretim platformudur. Temel mimari kararlar sağlamdır: FastAPI + SQLite WAL + asyncio worker loop + React + Remotion kombinasyonu, localhost kullanım senaryosu için uygun ve ölçekli değildir. Ancak çeşitli önemli sorunlar mevcuttur: **CostTracker sayfası tamamen sahte veri göstermektedir** (`/api/admin/costs` endpoint'i yoktur, bunu silen kod sıfır mock data döner), **`max_concurrent_jobs` admin ayarı DB'ye yazılır ama runtime'da asla okunmaz** (worker loop `app_settings` singleton'ından okur), ve **ProviderManager API key kaydında çift yazma yapar** (birisi ölü — provider scope'a yazılan asla okunmaz). Bu üç sorun, admin panelinin üç kritik özelliğinin güvenilmez ya da tamamen işlevsiz olduğu anlamına gelir. Kod tabanı genel olarak sağlıklıdır ve sıfırdan yazmayı gerektirmez — hedefli düzeltmeler yeterlidir.

### 5 En Ciddi Mimari Problem

1. **CostTracker backend endpoint eksikliği** — `/api/admin/costs` hiç uygulanmamış; frontend hata alınca tüm değerleri sıfır olan MOCK_DATA gösterir. Maliyet verisi DB'de mevcut ama hiç servis edilmiyor.
2. **`max_concurrent_jobs` runtime drift** — Worker loop `app_settings.max_concurrent_jobs` okur (job_manager.py:770), DB'deki admin ayarını asla okumaz. Admin panelden değişiklik restart olmadan etkisizdir.
3. **`output_dir` mutation anti-pattern** — Startup'ta ve settings save'de ham SQLAlchemy sorgusu `app_settings` singleton'ını mutasyonlar. Bu, 5-katman SettingsResolver'ı tamamen bypass eder ve yeniden başlatma gerektirmeden output dizinini değiştirmek mümkün değildir.
4. **Deprecated Gemini SDK** — `gemini.py` eski `google.generativeai` SDK'yı kullanır ve `warnings.filterwarnings("ignore")` ile uyarıları bastırır. Bu, gizli bir kırılma riski yaratır.
5. **Test yokluğu** — Projenin hiçbir yerinde test dosyası bulunmuyor. Kritik path'ler (pipeline runner, settings resolver, provider fallback) için sıfır test coverage.

### 5 En Ciddi UI/UX Operasyonel Gerçeklik Problemi

1. **CostTracker tüm değerleri sıfır gösteriyor** — Kullanıcı maliyet takip ettiğini sanır ama gerçekte mock veri görür. Yanıltıcı güven oluşturur.
2. **`max_concurrent_jobs` ayar ekranı etkisiz** — Admin panelden değer kaydedilir, toast başarı gösterir ama worker loop bu değeri okumaz. Yapısal olarak yanıltıcı.
3. **Provider API key çift yazma** — ProviderManager iki farklı scope'a yazar; provider scope yazısı asla okunmaz ama başarı toast'u gösterir. Yarı işlevsel.
4. **Output dizini ayarı restart gerektiriyor** — Admin'den `output_dir` değiştirme görünürde çalışır ama etki ancak server restart sonrası gerçekleşir; UI bunu belirtmiyor.
5. **Job resume butonu tutarsız davranış** — `interrupted` statüsündeki job'lar için "Devam Et" butonu görüntülenir ancak bu durum, tamamlanmış adımların doğru şekilde atlanıp atlanmadığı test edilmemiş.

### 5 En Ciddi Source-of-Truth / Config Problemi

1. **`max_concurrent_jobs` için iki kaynak** — `app_settings` (runtime okur) vs DB `settings` tablosu (admin yazar). Hangi birinin kazandığı belirsiz değil, app_settings her zaman kazanır — DB yazısı etkisizdir.
2. **Provider API key için iki write path** — `scope='admin', key='{provider}_api_key'` (geçerli) vs `scope='provider', key='api_key'` (ölü). Her ikisi de yazılır, sadece birisi okunur.
3. **`output_dir` için iki okuma path** — SettingsResolver üzerinden (5-katman, ama kullanılmıyor) vs ham SQLAlchemy sorgusu (startup+save, gerçekte kullanılan).
4. **Settings snapshot immutability kırılması** — Pipeline settings snapshot kullanır (doğru), ama composition step `app_settings.output_dir` okur (snapshot'tan değil). Anlık değişiklikler bazı ayarlar için etkili olur.
5. **Frontend settings state** — `settingsStore.ts` hem user hem admin ayarları tutar. Admin değişikliklerinin store'a ne zaman yansıdığı, polling mi SSE mi belirsiz.

### 5 En Büyük Basitleştirme Fırsatı

1. **PromptManager'ı ModuleManager accordion'ı yap** — Ayrı sayfa gereksiz, modül bazlı prompt yönetimi ModuleManager'ın içinde olabilir.
2. **Dead provider-scope API key write'ı sil** — ProviderManager.tsx L375-386'daki çift yazma tek yazma olabilir; ölü branch silinmeli.
3. **`output_dir` runtime mutation'ını SettingsResolver'a taşı** — Özel-cased startup logic'i genel ayar çözümleme mekanizmasına dahil et.
4. **CostTracker'a gerçek endpoint ekle** — ~20 satır DB aggregate sorgusu ile MOCK_DATA sorununu tamamen çöz.
5. **Gemini SDK'yı yeni API'ye migrate et** — `google-generativeai` → `google-genai` geçişi warnings.filterwarnings hack'ini ortadan kaldırır.

---

## 2. Mimari Değerlendirme

### Mimari Pattern ve Uyum

**Pattern:** Monolitik localhost-first uygulama, FastAPI (Python) backend + React (TypeScript) frontend + Remotion (Node.js) video engine. In-process asyncio worker loop ile kuyruk yönetimi. SQLite WAL tek veri kaynağı.

**Uyum Değerlendirmesi:** Seçilen mimari, localhost-first kullanım senaryosu için uygundur. Docker/Redis/Celery gibi dış bağımlılıklar bilerek dışarıda bırakılmış, bu doğru bir karardır. FastAPI + asyncio + SQLite WAL kombinasyonu single-user localhost senaryosu için aşırı değil, yeterli.

### Gerçek vs Yapay Katmanlar

**Gerçek değer yaratan katmanlar:**
- `pipeline/runner.py` — asıl iş akışı orkestratörü
- `services/settings_resolver.py` — 5-katman çözümleme mekanizması
- `services/job_manager.py` — SQLite-backed job state yönetimi
- `providers/` — gerçek provider abstraction'ı
- `pipeline/steps/` — modüler adım tanımları

**Yapay veya zayıf katmanlar:**
- `services/cost_tracker.py` — backend dosyası var, API endpoint yok, frontend mock data gösterir
- `pipeline/cache.py` — CacheManager mantığı basit ama `runner.py`'de inline da yapılabilirdi

### Coupling / Cohesion

**Düşük coupling (iyi):** Provider'lar birbirinden bağımsız. Modüller pipeline adımlarını paylaşır ama kendi config'lerine sahip. SSE stream'i pipeline'dan bağımsız.

**Yüksek coupling (sorunlu):**
- `composition.py` step'i `app_settings` singleton'ını direkt okur (settings resolver bypass)
- `job_manager.py` worker loop `app_settings.max_concurrent_jobs` okur
- `runner.py` import zinciri: runner → job_manager → models → settings — tüm sistemi birbirine bağlar

### Codebase Şekli ile Ürün Vaadi Uyumu

Ürün vaadi: "6 adımlı pipeline, provider fallback, global SSE, 5 altyazı stili, 3 içerik modülü, SaaS kalitesinde admin paneli."

**Gerçekte çalışan:** 6-adım pipeline ✓, provider fallback ✓, global SSE ✓, 3 modül ✓, admin panel ✓ (kısmi)

**Çalışmayan/yanıltıcı:** Cost tracker (mock), max_concurrent_jobs admin ayarı (runtime etkisiz)

---

## 3. UI/UX Sistem Değerlendirmesi

### UI Yapısal Güvenilirlik

Frontend React + Zustand + SSE mimarisi genel olarak sağlamdır. API client wrapper (`client.ts`) tutarlı, SSE hook'ları gerçek zamanlı güncellemeler için doğru çalışıyor. Zustand store'ları basit ve fazla mühendislik içermiyor.

**Güvenilir:** Job oluşturma formu, job detay sayfası, step progress, log viewer, provider manager (API key kaydetme gerçek çalışıyor), module manager, prompt manager.

**Güvenilmez / Yanıltıcı:**
- CostTracker sayfası: Tamamen mock veri
- Global Settings'deki `max_concurrent_jobs`: Kaydediliyor ama runtime etkisi yok
- ProviderManager API key formu: Çalışıyor ama provider-scope'a da yazmak (ölü yazma) potansiyel karışıklık

### UX'in Runtime Davranışı Yansıtması

Genel olarak iyi — SSE ile gerçek zamanlı step progress, log stream, job status güncellemeleri doğru çalışıyor. Kullanıcı pipeline'ın nerede olduğunu görebiliyor.

**Eksik feedback:**
- `max_concurrent_jobs` değişikliğinin "restart gerektirir" uyarısı yok
- `output_dir` değişikliğinin "restart gerektirir" uyarısı yok
- CostTracker'da "veri yükleniyor" yerine sessiz mock data

### Information Architecture

7 admin sayfası (AdminDashboard, ModuleManager, PromptManager, ProviderManager, GlobalSettings, CostTracker, AdminJobs) makul organize edilmiş. PromptManager'ın ayrı sayfa olması gereksiz — ModuleManager altında accordion olabilir.

5 user sayfası (Dashboard, CreateVideo, JobList, JobDetail, UserSettings) temiz ve işlevsel.

---

## 4. Dosya ve Modül Bulguları

### Çekirdek Modüller

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `backend/main.py` | FastAPI app, CORS, startup, worker loop başlatma | core | infra | output_dir mutation startup'ta; lifespan event'te SSE manager init | keep | medium |
| `backend/pipeline/runner.py` | Pipeline orkestratörü, adım-adım yürütme | core | business logic | output_dir app_settings'ten okur (snapshot bypass) | keep, fix output_dir reading | high |
| `backend/services/job_manager.py` | Job CRUD, worker loop, state transitions | core | business logic | max_concurrent_jobs app_settings'ten okur (L770); cost aggregation var ama endpoint yok | keep, fix max_concurrent_jobs | high |
| `backend/services/settings_resolver.py` | 5-katman config çözümleme | core | business logic | output_dir için bypass var; locked key logic tamam | keep | medium |
| `backend/database.py` | SQLite WAL init, tablo oluşturma | core | persistence | tablolar correct; WAL mode doğru | keep | low |
| `backend/config.py` | Global defaults, .env yükleme, AppSettings | core | config | output_dir hem config'de hem DB'de; max_concurrent_jobs aynı sorun | keep, consider removing DB overrides for these | medium |

### Destekleyici Modüller

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `backend/api/jobs.py` | Job CRUD endpoints, SSE stream | supporting | route | SSE per-job ve global doğru; endpoint coverage iyi | keep | low |
| `backend/api/settings.py` | Settings read/write endpoints | supporting | route | output_dir özel case burada da; genel mantık temiz | keep | low |
| `backend/api/admin.py` | Admin PIN doğrulama, admin endpoints | supporting | route | `/api/admin/costs` eksik — en kritik eksiklik | keep, add costs endpoint | medium |
| `backend/api/modules.py` | Module management endpoints | supporting | route | temiz; capability toggle çalışıyor | keep | low |
| `backend/api/providers.py` | Provider management, health check | supporting | route | health check async/sync karışıklığı var | keep | low |
| `backend/services/cost_tracker.py` | Cost hesaplama servisi | supporting | business logic | backend kodu var ama API endpoint yok; frontend mock gösterir | keep, add endpoint | medium |
| `backend/pipeline/cache.py` | Session-based intermediate output cache | supporting | persistence | basit ve işlevsel | keep | low |
| `backend/utils/logger.py` | JSON structured logging | supporting | infra | temiz | keep | low |

### Şüpheli Modüller

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `backend/providers/llm/gemini.py` | Gemini LLM provider | suspicious | business logic | deprecated SDK, warnings bastırılıyor | refactor to new SDK | medium |
| `backend/pipeline/steps/composition.py` | Remotion composition step | suspicious | business logic | app_settings doğrudan okur; ThreadingMixIn HTTP server in async | keep, fix app_settings | medium |

### Yüksek Risk Modülleri

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `backend/pipeline/runner.py` | Pipeline orkestratörü | core | business logic | Settings snapshot bypass (composition için); output_dir karışıklığı | fix | high |
| `backend/services/job_manager.py` | Job state + worker loop | core | business logic | max_concurrent_jobs runtime drift; cost endpoint yok | fix | high |

### UI Modülleri — Admin

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `frontend/src/pages/admin/CostTracker.tsx` | Maliyet takibi sayfası | core | UI | Backend endpoint yok; mock data gösteriyor | fix (add backend endpoint) | high |
| `frontend/src/pages/admin/ProviderManager.tsx` | Provider API key, fallback sırası | core | UI | Dual API key write (L375-386); dead write | fix (remove dead write) | medium |
| `frontend/src/pages/admin/GlobalSettings.tsx` | Global ayarlar yönetimi | core | UI | max_concurrent_jobs save etkisiz | fix (add restart warning) | medium |
| `frontend/src/pages/admin/ModuleManager.tsx` | Module aktif/pasif, capability | supporting | UI | temiz | keep | low |
| `frontend/src/pages/admin/PromptManager.tsx` | Prompt şablonları yönetimi | optional | UI | Ayrı sayfa gereksiz; ModuleManager accordion olabilir | merge into ModuleManager | low |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Sistem durumu, özet | supporting | UI | temiz | keep | low |
| `frontend/src/pages/admin/AdminJobs.tsx` | Tüm job'lar admin görünümü | supporting | UI | temiz | keep | low |

### UI Modülleri — User

| Dosya | Amaç | Önem | Katman | Ana Problemler | Öneri | Risk |
|-------|------|------|--------|----------------|-------|------|
| `frontend/src/pages/user/Dashboard.tsx` | Ana dashboard | core | UI | temiz | keep | low |
| `frontend/src/pages/user/CreateVideo.tsx` | Video oluşturma formu | core | UI | temiz | keep | low |
| `frontend/src/pages/user/JobDetail.tsx` | Job detay + log viewer | core | UI | temiz; SSE doğru çalışıyor | keep | low |
| `frontend/src/pages/user/JobList.tsx` | Job listesi | supporting | UI | temiz | keep | low |
| `frontend/src/pages/user/UserSettings.tsx` | Kullanıcı ayarları | supporting | UI | temiz | keep | low |

---

## 5. Teknik Borç ve Kod Kokuları

### Overengineering

- `backend/pipeline/steps/composition.py`: `ThreadingMixIn` kullanan bir HTTP server başlatıyor, bir asyncio fonksiyonu içinde. Bu pattern, async/sync karışımı yaratır ve debug'lanması zordur. Remotion CLI subprocess output'unu almak için daha basit yollar mevcut.

### Dead Code

- `backend/api/providers.py`: Providers yazan API, `scope='provider', key='api_key'` path'ini okuyan hiçbir kod yoktur. Bu write path ölüdür.
- `backend/services/cost_tracker.py`: Tüm dosya fonksiyonel ama `backend/api/admin.py`'deki cost endpoint yokluğu yüzünden hiç çağrılmıyor.

### Deprecated Bağımlılıklar

- `backend/providers/llm/gemini.py:1-5`: `import google.generativeai as genai` + `warnings.filterwarnings("ignore", category=DeprecationWarning, module="google")` — Bu, gizli bir kırılma noktasıdır. Google, `google-generativeai` paketini deprecated etmiş; yeni `google-genai` SDK farklı bir API sunuyor.

### Settings Consistency Sorunları

- `backend/main.py` startup: Ham SQLAlchemy sorgusu ile `output_dir` `app_settings` üzerine yazılıyor. Bu, SettingsResolver'ı tamamen bypass eder.
- `backend/services/job_manager.py:770`: `available_slots = app_settings.max_concurrent_jobs - running_count` — SettingsResolver yerine `app_settings` doğrudan okunuyor.
- `backend/pipeline/steps/composition.py`: `app_settings.output_dir` okunuyor — settings snapshot yerine canlı config okunuyor (diğer tüm adımlar snapshot kullanıyor).

### Duplicate Logic

- `backend/api/settings.py` ve `backend/main.py` her ikisi de `output_dir` için özel case içeriyor — aynı mantık iki yerde.

### Hata Yönetimi Zayıflıkları

- `frontend/src/pages/admin/CostTracker.tsx:~130`: `catch { setData(MOCK_DATA) }` — Herhangi bir hata (network, 404, 500) sessizce MOCK_DATA ile kapatılıyor. Kullanıcı hiçbir zaman gerçek bir hata mesajı görmüyor.

### Test Yokluğu

Projenin hiçbir yerinde `test_`, `*.test.ts`, `*.spec.ts` veya `pytest` dosyası yok. `pipeline/runner.py`, `services/settings_resolver.py`, `services/job_manager.py` gibi kritik modüller sıfır test coverage'ına sahip.

### Composition Provider Stub

`backend/providers/composition/__init__.py` — tek satır docstring, uygulama yok. Composition, provider registry pattern'ını takip etmiyor; `pipeline/steps/composition.py` doğrudan Remotion CLI çağırıyor. Bu mimari tutarsızlık (diğer tüm kategoriler için provider pattern var, composition için yok) bilerek yapılmış olabilir ama belgelenmemiş.

### Pixabay Provider Dead Code

`backend/config.py` `pixabay_api_key` field tanımlıyor. `backend/providers/visuals/__init__.py` docstring'de Pixabay'dan bahsediyor. `settings_resolver.py` Pixabay key'ini ayarlara dahil ediyor. Ancak `backend/providers/visuals/pixabay.py` **mevcut değil** — sadece `pexels.py` var. README ve UI'da Pixabay fallback provider olarak gösteriliyor ama hiç implement edilmemiş.

---

## 6. UI Element Gerçeklik Tablosu

| Ekran/Route/Bileşen | Kullanıcıya Görünen Amaç | Erişilebilirlik | Gerçek Bağlantı | Gerçek Hedef | Runtime Etkisi | Kalıcılık Etkisi | Okuyucu | Gerçeğin Kaynağı | Çakışan Kaynaklar | Geri Bildirim Dürüstlüğü | Karar | Önerilen Eylem |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CostTracker `/admin/costs` | Maliyet takibi | Erişilebilir | `GET /api/admin/costs` çağrısı | Endpoint YOK → catch → MOCK_DATA | Yok | Yok | Yok | MOCK_DATA (hardcoded) | Yok | Yanıltıcı — sıfır değerler gerçekmiş gibi görünüyor | **DEAD/MISLEADING** | Backend endpoint ekle, mock'u kaldır |
| GlobalSettings `max_concurrent_jobs` | Worker limit'i ayarla | Erişilebilir | PUT `/api/settings` → DB | DB `settings` tablosu | Yok (worker loop app_settings okur) | DB'ye yazılıyor | Worker loop (ama app_settings okur, DB değil) | `app_settings` singleton | DB `settings` tablosu | Yanıltıcı — kaydet başarılı ama etkisiz | **PARTIAL/MISLEADING** | Worker loop'u DB'den oku, ya da restart uyarısı ekle |
| ProviderManager API Key formu | Provider API key kaydet | Erişilebilir | PUT `/api/providers/{name}/settings` | admin scope (geçerli) + provider scope (ölü) | Admin scope çalışıyor | İkisi de DB'ye yazılıyor | Sadece admin scope okunuyor | DB `settings` admin scope | provider scope (ölü) | Kısmen yanıltıcı | **PARTIAL** | Provider scope yazımını kaldır |
| GlobalSettings `output_dir` | Video çıktı dizinini ayarla | Erişilebilir | PUT `/api/settings` → app_settings mutation | `app_settings.output_dir` | Çalışıyor ama restart sonrası | DB + app_settings mutation | composition.py step | app_settings | DB (yedek) | Restart gerektirir, UI belirtmiyor | **PARTIAL** | "Restart gerektirir" uyarısı ekle |
| ProviderManager Health Check | Provider API erişilebilirliğini test et | Erişilebilir | POST `/api/providers/{name}/health` | provider.health_check() | Gerçek test yapılıyor | Yok | Yok | Provider API | Yok | Dürüst | **WORKING** | Keep |
| ModuleManager aktif/pasif toggle | Modülü aktif/pasif yap | Erişilebilir | PUT `/api/modules/{name}` | DB `settings` + module registry | Pipeline modül kontrolü | DB | PipelineRunner | DB | Yok | Dürüst | **WORKING** | Keep |
| PromptManager prompt düzenleme | Modül prompt şablonlarını düzenle | Erişilebilir | PUT `/api/settings` | DB `settings` module scope | Script generation step okur | DB | Script pipeline step | DB | Yok | Dürüst | **WORKING** | Keep, consider merging into ModuleManager |
| CreateVideo formu | Yeni video oluştur | Erişilebilir | POST `/api/jobs` | JobManager.create_job() | Pipeline başlatılıyor | DB `jobs` tablosu | PipelineRunner | DB | Yok | Dürüst | **WORKING** | Keep |
| JobDetail log viewer | Gerçek zamanlı log stream | Erişilebilir | GET `/api/jobs/{id}/events` (SSE) | SSE stream | Log stream gerçek | Yok (memory) | React SSE hook | SSE stream | Yok | Dürüst | **WORKING** | Keep |
| JobDetail "Devam Et" butonu | Interrupted job'ı devam ettir | Erişilebilir (status=interrupted için) | POST `/api/jobs/{id}/resume` | PipelineRunner resume logic | Done step'ler atlanıyor | DB status güncelleniyor | PipelineRunner | DB | Yok | Teorik olarak dürüst, test edilmemiş | **UNVERIFIED** | Test et |
| Dashboard SSE global stream | Tüm job'ların anlık durumu | Erişilebilir | GET `/api/jobs/stream` (SSE) | Global SSE manager | Gerçek zamanlı güncellemeler | Yok | React dashboard | SSE stream | Yok | Dürüst | **WORKING** | Keep |
| FallbackOrderEditor drag-drop | Provider fallback sırasını ayarla | Erişilebilir | PUT `/api/settings` → admin scope | DB `settings` admin scope | ProviderRegistry.execute_with_fallback() okur | DB | ProviderRegistry | DB admin scope | Yok | Dürüst | **WORKING** | Keep |
| AdminDashboard sistem durumu | Sistem özeti | Erişilebilir | GET `/api/admin/stats` | DB aggregate | Gerçek istatistikler | Yok | Yok | DB | Yok | Dürüst | **WORKING** | Keep |
| UserSettings TTS override | TTS provider'ını override et | Erişilebilir | PUT `/api/settings` user scope | DB user scope | SettingsResolver user layer | DB | SettingsResolver | DB user scope | Locked key check | Dürüst | **WORKING** | Keep |
| Batch create video | Toplu video oluştur | Erişilebilir | POST `/api/jobs/batch` | JobManager batch create | N job oluşturuluyor | DB | Worker loop | DB | Yok | Dürüst | **WORKING** | Keep |

---

## 7. Action Flow Trace Tablosu

| Eylem | Giriş Noktası | Route/Sayfa | Handler | Doğrulama | State Katmanı | Service/API Path | Backend Hedefi | Kalıcılık Hedefi | Sonraki Tüketici | Gerçek Sonuç | Karar |
|---|---|---|---|---|---|---|---|---|---|---|---|
| API key kaydet (provider) | ProviderManager formu | `/admin/providers` | `handleSaveApiKey()` | Frontend: boş string kontrolü | Local React state | PUT `/api/providers/{name}/settings` | `settings` tablosu (admin scope + provider scope) | DB (iki kayıt) | Provider.execute() (sadece admin scope okunuyor) | Kısmen çalışıyor | **PARTIAL** — provider scope yazımı ölü |
| max_concurrent_jobs kaydet | GlobalSettings formu | `/admin/settings` | `handleSave()` | Pydantic v2 (backend) | Zustand settingsStore | PUT `/api/settings` | DB `settings` tablosu | DB | job_manager worker loop (ama app_settings okur) | Başarı toast ama etkisiz | **MISLEADING** |
| Yeni video oluştur | CreateVideo formu | `/create` | `handleSubmit()` | Pydantic JobCreate | jobStore | POST `/api/jobs` | JobManager.create_job() | DB `jobs` + settings snapshot | PipelineRunner | Çalışıyor | **WORKING** |
| Pipeline step izle | JobDetail SSE | `/jobs/{id}` | useSSE hook | Yok | SSE event | GET `/api/jobs/{id}/events` | SSEManager per-job | Memory | React UI update | Çalışıyor | **WORKING** |
| Provider health check | ProviderManager butonu | `/admin/providers` | `handleHealthCheck()` | Yok | Local state | POST `/api/providers/{name}/health` | provider.health_check() | Yok | Toast mesajı | Çalışıyor | **WORKING** |
| Maliyet görüntüle | CostTracker sayfası | `/admin/costs` | useEffect fetch | Yok | Local state | GET `/api/admin/costs` | **ENDPOINT YOK** → 404 → catch → MOCK_DATA | Yok | UI render | MOCK_DATA gösterilir | **DEAD** |
| Fallback sırası kaydet | FallbackOrderEditor | `/admin/providers` | `handleSaveFallback()` | Yok | Local state | PUT `/api/settings` admin scope | DB `settings` | DB | ProviderRegistry.execute_with_fallback() | Çalışıyor | **WORKING** |
| Interrupted job devam ettir | JobDetail butonu | `/jobs/{id}` | `handleResume()` | Yok | jobStore | POST `/api/jobs/{id}/resume` | PipelineRunner resume | DB step statuses | Pipeline (done step'ler atlanıyor) | Teorik çalışıyor | **UNVERIFIED** |
| Prompt şablonu düzenle | PromptManager formu | `/admin/prompts` | `handleSavePrompt()` | Yok | Local state | PUT `/api/settings` module scope | DB `settings` module scope | DB | script.py step (SettingsResolver okur) | Çalışıyor | **WORKING** |
| Output dizini değiştir | GlobalSettings | `/admin/settings` | `handleSave()` | Yok | Zustand settingsStore | PUT `/api/settings` | app_settings mutation + DB | DB + app_settings | composition.py (app_settings okur) | Restart sonrası çalışıyor | **PARTIAL** |

---

## 8. Source-of-Truth Tablosu

| Değer Adı | Giriş Yerleri | Yazma Path'leri | Okuma Path'leri | Override Kaynakları | Gerçek Source of Truth | Çakışan/Eski Path'ler | Karar | Önerilen Konsolidasyon |
|---|---|---|---|---|---|---|---|---|
| `max_concurrent_jobs` | GlobalSettings UI | PUT `/api/settings` → DB | `app_settings.max_concurrent_jobs` (worker loop L770) | .env, DB settings | `app_settings` singleton (startup'ta yüklenir) | DB `settings` tablosu (yazılıyor ama okunmuyor) | **CONFLICT** | Worker loop'u `SettingsResolver` kullanacak şekilde güncelle |
| Provider API key | ProviderManager UI | provider scope + admin scope (çift yazma) | `settings_resolver.get(f"{provider}_api_key", scope='admin')` | .env | DB admin scope | DB provider scope (ölü) | **DEAD WRITE** | Provider scope yazımını kaldır |
| `output_dir` | GlobalSettings UI, .env | PUT `/api/settings` → app_settings mutation + DB | `app_settings.output_dir` (composition.py + runner.py) | .env override (startup) | `app_settings` singleton | DB `settings` (yazılıyor, kullanılıyor ama mutation via startup query) | **INCONSISTENT** | SettingsResolver üzerinden standart okuma |
| `default_tts_provider` | GlobalSettings UI, UserSettings UI | DB admin/user scope | SettingsResolver (5-katman) | User override | DB (SettingsResolver) | Yok | **WORKING** | Keep |
| `llm_provider` | GlobalSettings UI, CreateVideo form | DB admin scope, job config snapshot | SettingsResolver + snapshot | Job config override | DB → snapshot | Yok | **WORKING** | Keep |
| `subtitle_style` | CreateVideo form, GlobalSettings | DB admin scope, job config | SettingsResolver + snapshot | Job config | DB → snapshot | Yok | **WORKING** | Keep |
| `fallback_order` (tts/llm/visuals) | FallbackOrderEditor | DB admin scope | ProviderRegistry.execute_with_fallback() | Yok | DB admin scope | Yok | **WORKING** | Keep |
| Module `enabled` flag | ModuleManager toggle | DB settings (module scope) | PipelineRunner module lookup | Yok | DB module scope | Yok | **WORKING** | Keep |
| Prompt templates | PromptManager forms | DB settings (module scope) | script.py step via SettingsResolver | Yok | DB module scope | Yok | **WORKING** | Keep |

---

## 9. Route-to-Capability Tablosu

| Route/Sayfa | Kullanıcıya Amaç | Gerçek Kapasite | Tamlık | Operasyonel Uyum | Karar | Önerilen Eylem |
|---|---|---|---|---|---|---|
| `/` (Dashboard) | Genel bakış, aktif job'lar | Job listesi, SSE global stream | Tam | Tam | **WORKING** | Keep |
| `/create` | Video oluşturma formu | Job oluşturma, modül seçimi, ayar override | Tam | Tam | **WORKING** | Keep |
| `/jobs` | Tüm job'lar | Job listesi, filtreleme | Tam | Tam | **WORKING** | Keep |
| `/jobs/:id` | Job detay, progress, log | SSE per-job, step progress, log viewer | Tam | Tam | **WORKING** | Keep |
| `/settings` | Kullanıcı ayarları | Locked olmayan override'lar | Tam | Tam | **WORKING** | Keep |
| `/admin` | Admin dashboard | Sistem istatistikleri, job özeti | Tam | Tam | **WORKING** | Keep |
| `/admin/modules` | Modül yönetimi | Aktif/pasif toggle, capability | Tam | Tam | **WORKING** | Keep |
| `/admin/providers` | Provider yönetimi | API key, health check, fallback sırası | Kısmi | Kısmi (dead write) | **PARTIAL** | Remove dead write |
| `/admin/settings` | Global ayarlar | Default değerleri yönetme | Kısmi | Kısmi (max_concurrent_jobs etkisiz) | **PARTIAL** | Fix max_concurrent_jobs runtime |
| `/admin/costs` | Maliyet takibi | **HİÇ** — backend endpoint yok | Yok | Yok | **DEAD** | Implement `/api/admin/costs` |
| `/admin/jobs` | Tüm sistem job'ları | Job listesi (admin view) | Tam | Tam | **WORKING** | Keep |
| `/admin/prompts` | Prompt şablonları | Module scope prompt yönetimi | Tam | Tam ama ayrı sayfa gereksiz | **WORKING/OPTIONAL** | Merge into ModuleManager |

---

## 10. Kaldırılabilir Adaylar

| Dosya/Modül/Bileşen/Route | Neden Kaldırılabilir | Güven | Kaldırma Riski | Güvenli Doğrulama |
|---|---|---|---|---|
| DB provider-scope API key write (`ProviderManager.tsx` L375-386) | Yazılan değer hiç okunmuyor; admin scope yeterli | Yüksek | Düşük | `settings` tablosunda `scope='provider', key='api_key'` kayıtlarını kontrol et |
| `backend/providers/composition/__init__.py` (stub) | Tek satır docstring; composition provider pattern'ına uymuyor ama zaten kullanılmıyor (hardcoded CLI call) | Orta | Çok düşük | Dosyayı kaldır ya da TODO docstring ekle |
| `pixabay_api_key` config field + settings resolver reference | Pixabay.py hiç yazılmamış; config'deki key ve resolver referansı ölü | Yüksek | Düşük | Config ve resolver'dan Pixabay referanslarını kaldır ya da implement et |
| `MOCK_DATA` sabit değeri (`CostTracker.tsx`) | Backend endpoint eklenince gereksiz hale gelir | Yüksek (backend eklenince) | Düşük | Backend endpoint çalışınca mock'u kaldır |
| `warnings.filterwarnings` satırı (`gemini.py`) | SDK yenilendikten sonra gereksiz | Yüksek (yenilemeden sonra) | Düşük | SDK migrate sonrası |
| `PromptManager.tsx` ayrı sayfa olarak | ModuleManager accordion'ına taşınabilir | Orta | Düşük | Accordion component eklendikten sonra route kaldırılabilir |
| `adsız klasör/` (proje root) | Boş, amaçsız klasör | Yüksek | Çok düşük | Boşluğunu doğrula, sil |

---

## 11. Merge / Flatten / Simplify Adayları

| İlgili Dosyalar/Modüller | Neden Örtüşüyorlar | Önerilen Basitleştirme | Beklenen Fayda | Risk |
|---|---|---|---|---|
| `PromptManager.tsx` + `ModuleManager.tsx` | PromptManager module-scoped settings düzenliyor; ModuleManager zaten modül bazlı | PromptManager'ı ModuleManager accordion'ı yap | Navigasyon basitleşir, ilgili ayarlar bir yerde | Düşük — sadece UI taşıma |
| `output_dir` handling in `main.py` + `api/settings.py` + `composition.py` | Üç yerde özel case logic | SettingsResolver'a taşı, `app_settings` mutation'ını kaldır | Tek okuma path, consistency | Orta — dikkatli test gerekir |
| `max_concurrent_jobs` in `config.py` + DB `settings` | İki write path, bir okuma path (app_settings) | Worker loop DB'den oku via SettingsResolver | Runtime değişiklik etkili olur | Orta — worker loop core logic |
| Tüm provider scope API key writes | provider scope yazısı ölü | Tek write path (admin scope) | Dead code elenir | Düşük |

---

## 12. Bağımlılık Değerlendirmesi

### Muhtemelen Gereksiz

- `google-generativeai`: Deprecated. `google-genai` (yeni SDK) ile değiştirilmeli.
- `warnings` (stdlib): gemini.py'deki suppress filter SDK yenilendikten sonra kaldırılabilir.

### Ağır Ama Haklı

- `remotion` (Node.js): Video composition için gerekli, alternatif yok (MoviePy/FFmpeg çok daha düşük kalite).
- `openai`: Hem TTS hem LLM için kullanılıyor, makul.
- `elevenlabs`: Premium TTS, haklı.

### Dikkat Edilmesi Gerekenler

- `edge-tts`: Ücretsiz Microsoft TTS, güzel; ancak Microsoft resmi API değil, tersine mühendislik. Kırılabilir.
- `pexels-python`: Tek endpoint wrapper, stabil ama minimal.
- Frontend: `@radix-ui/*` paketleri Shadcn komponetleri için, haklı. Zustand minimal, haklı. Tailwind haklı.

---

## 13. Refactor Strateji Seçenekleri

### Seçenek A: Muhafazakar Temizlik

**Uygun olduğu durum:** Mevcut işlevsellik yeterli, sadece kritik bug'lar düzeltilmek isteniyorsa.

**Ne kalır:** Tüm mevcut mimari, tüm sayfalar, tüm provider'lar.

**Ne kaldırılır:** Dead API key write, MOCK_DATA (backend endpoint eklendikten sonra), `adsız klasör`.

**UI'da ne olur:** CostTracker gerçek veri gösterir. max_concurrent_jobs için uyarı mesajı eklenir. Provider scope dead write kaldırılır.

**Faydalar:** Minimal değişiklik, düşük risk, hızlı.

**Riskler:** max_concurrent_jobs runtime sorununu çözmez. Gemini deprecated SDK devam eder.

**Efor:** 1-2 gün

**Sadece şu durumda önerilir:** Proje bakım moduna girecekse ya da çok sınırlı değişiklik kapasitesi varsa.

---

### Seçenek B: Core'u Koru, Kenarları Yeniden Yap

**Uygun olduğu durum:** Temel mimari sağlam, birkaç kritik düzeltme + küçük yeniden yapılanma gerekiyorsa.

**Ne kalır:** FastAPI + SQLite + asyncio worker loop + React + Remotion mimarisi. Tüm provider'lar. Tüm pipeline adımları.

**Ne değişir:**
1. `/api/admin/costs` endpoint eklenir (~20 satır)
2. Worker loop `max_concurrent_jobs` için `SettingsResolver` kullanır
3. Provider scope dead write kaldırılır
4. `output_dir` mutation, SettingsResolver standart akışına alınır
5. Gemini SDK güncellenir
6. PromptManager ModuleManager accordion'ına taşınır

**UI'da ne olur:** CostTracker gerçek veri gösterir. max_concurrent_jobs admin'den gerçekten kontrol edilebilir. Navigasyon sadeleşir.

**Faydalar:** Tüm kritik sorunlar çözülür. Mimari daha tutarlı. Az risk.

**Riskler:** `output_dir` değişikliği dikkatli test gerektirir.

**Efor:** 3-5 gün

**Önerilir:** Projeye devam edecek ve sağlıklı bir foundation istiyorsa.

---

### Seçenek C: Kontrollü Yeniden Yazma

**Uygun olduğu durum:** Mevcut mimari fundamentally broken olsaydı.

**Ne olur:** Mevcut proje analiz edilip sıfırdan temiz kurulur.

**Durum:** Mevcut proje bu kategoriye girmiyor. Mimari sağlam, sorunlar spesifik ve hedefli.

**Faydalar:** Yok — gereksiz.

**Riskler:** Çok yüksek. 3-6 ay efor.

**Önerilir:** Sadece fundamental mimari sorunlar varsa (bu projede yok).

---

## 14. Önerilen Path

**Seçenek B: Core'u Koru, Kenarları Yeniden Yap**

### Neden En İyi Seçim

1. **Mimari sağlam** — FastAPI + SQLite WAL + asyncio + React + Remotion kombinasyonu bilinçli kararların sonucu, değiştirilmemeli.
2. **Sorunlar spesifik ve izole** — 3 kritik sorun (CostTracker endpoint, max_concurrent_jobs runtime, dead API key write) birbirinden bağımsız, hedefli düzeltme mümkün.
3. **Veri modeli doğru** — `jobs`, `job_steps`, `settings` tabloları tutarlı ve doğru; ORM modellar sağlıklı.
4. **Provider sistemi çalışıyor** — Provider fallback zinciri, ProviderRegistry, health check fonksiyonel; sadece dead write var.
5. **Frontend temiz** — Zustand store'ları, SSE hook'ları, sayfa yapısı temiz; sadece CostTracker ve birkaç form geri bildirimi sorunu var.

### İlk Yapılacaklar

1. `/api/admin/costs` endpoint yaz (en yüksek görünür etki, en düşük risk)
2. `max_concurrent_jobs` worker loop fix (admin paneli güvenilir hale getirir)
3. Provider scope dead write'ı kaldır

### Hemen Dokunulmaması Gerekenler

- `pipeline/runner.py` core mantığı — çalışıyor, dokunma
- SSE implementasyonu — temiz, dokunma
- Provider fallback chain — çalışıyor, dokunma
- Job state machine — doğru, dokunma

### Hemen Dondurulması Gerekenler

- Yeni özellik ekleme — önce bug'lar düzeltilmeli
- CostTracker üzerine yeni metrikler ekleme — önce gerçek data akışı sağlanmalı

### Güvenilmemesi Gerekenler (Düzeltilene Kadar)

- `/admin/costs` sayfasındaki tüm rakamlar (mock)
- Admin panelinden `max_concurrent_jobs` değişikliğinin anlık etkisi

---

## 15. Sıralı Recovery Planı

### Adım 1: Kritik Bug Düzeltmeleri (Düşük Risk, Yüksek Etki)

1. **`/api/admin/costs` endpoint ekle**
   - `backend/api/admin.py`'ye ~20 satır DB aggregate sorgusu ekle
   - `job_steps.cost_estimate_usd` SUM by provider + recent jobs listesi
   - `CostTracker.tsx`'deki `catch { setData(MOCK_DATA) }` → gerçek hata mesajı

2. **Provider scope dead write'ı kaldır**
   - `ProviderManager.tsx` L375-386: provider scope yazımını kaldır
   - Sadece admin scope yazımı bırak

3. **Admin `max_concurrent_jobs` runtime fix**
   - `job_manager.py:770`'deki `app_settings.max_concurrent_jobs` → `SettingsResolver` çağrısı
   - Ya da yeniden başlatma gerektirdiğini belirten UI uyarısı ekle

### Adım 2: Uyarı ve Feedback Düzeltmeleri (Düşük Risk)

4. **`output_dir` ve `max_concurrent_jobs` değişikliği için restart uyarısı**
   - GlobalSettings'te bu iki alan için "Bu değişiklik server yeniden başlatılana kadar etkili olmaz" uyarısı

5. **CostTracker hata mesajı**
   - Endpoint yokken veya hata olduğunda "Veri yüklenemedi" göster, sıfır mock değil

### Adım 3: Küçük Yeniden Yapılanma (Orta Risk)

6. **Gemini SDK güncelleme**
   - `google-generativeai` → `google-genai`
   - `warnings.filterwarnings` hack'ini kaldır

7. **`output_dir` mutation standardizasyonu**
   - `main.py` ve `api/settings.py`'deki özel case logic → SettingsResolver standart akışı

8. **PromptManager → ModuleManager accordion**
   - Ayrı sayfa kaldır, ModuleManager'a accordion ekle

### Adım 4: Test Altyapısı (Uzun Vadeli)

9. **Kritik path'ler için temel testler**
   - `settings_resolver.py` için unit test (5-katman çözümleme)
   - `job_manager.py` worker loop için integration test
   - Provider fallback zinciri için mock-based test

### Adım 5: Dokümantasyon Senkronizasyonu

10. **Bug fix'lerden sonra docs güncelle**
    - CHANGELOG.md'ye fix notları
    - IMPLEMENTATION_REPORT.md güncelle

11. **REQUEST_LOG.md'ye yeni REQ girişi**
    - Code audit bulguları ve düzeltmeler için REQ kaydı

---

## 16. Final Karar

### "Sıfırdan Başlama — Mevcut Kodu Basitleştir ve Düzelt"

**ContentManager sıfırdan yazılmamalıdır.** Mevcut kod tabanı, bilinçli mimari kararların ürünüdür. Sorunlar spesifik, izole ve hedefli düzeltmelerle çözülebilir.

**5 Somut Neden:**

1. **Temel mimari pattern doğru.** FastAPI + SQLite WAL + asyncio + React + Remotion kombinasyonu, localhost-first YouTube otomasyon platformu için ideal seçim. Bu kararlar zaman ve deneyimle verilmiş, korunmalı.

2. **Pipeline runner ve job state management sağlam.** `runner.py` + `job_manager.py` kombinasyonu crash-safe, resume destekli, SSE entegre; bu katmanı yeniden yazmak ay sürer ve mevcut durumdan daha iyi olmaz.

3. **Kritik sorunlar 3 spesifik lokasyonda.** CostTracker (eksik endpoint), max_concurrent_jobs (yanlış okuma, tek satır fix), dead API key write (birkaç satır silme) — bunlar mimari sorun değil, implementasyon atlama/hatası.

4. **Provider sistemi gerçekten çalışıyor.** ProviderRegistry, fallback chain, health check, TTS/LLM/Visuals provider'ları; bu sistemi yeniden yazmak risk altında çalışan bir şeyi riske atmak demektir.

5. **Frontend temiz ve modern.** React 18 + Zustand + TypeScript + Tailwind + SSE hook'ları güncel, minimal, temiz. CostTracker ve birkaç form dışında tüm sayfalar dürüst ve işlevsel.

**Sonuç:** Seçenek B uygula. Kritik 3 bug'ı düzelt (1-2 gün), Gemini SDK'yı güncelle (1 gün), PromptManager'ı birleştir (yarım gün). Toplam efor: 3-4 gün. Sonuç: Tamamen güvenilir, gerçek veri gösteren, runtime tutarlı bir sistem.
