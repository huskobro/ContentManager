# ContentManager — Tam Kod ve Operasyonel Gerçeklik Denetimi

> **Denetim Tarihi:** 2026-03-30
> **Denetçi:** Kıdemli Yazılım Mimarı (AI destekli)
> **Kod Tabanı Sürümü:** v1.0.0
> **Denetlenen Toplam Dosya:** 73 (44 Python, 21 TypeScript/TSX, 8 Remotion)
> **Toplam Kod Satırı:** ~16.500

---

## 1. Yönetici Özeti

ContentManager, 10 geliştirme fazında inşa edilmiş, iyi mimariye sahip, localhost-first bir YouTube video üretim platformudur. Kod tabanı güçlü sorumluluk ayrımı (FastAPI + React + Remotion), sağlam 5 katmanlı ayar hiyerarşisi ve gerçekten uçtan uca çalışan modüler bir pipeline göstermektedir. Kod temiz, tip güvenli ve büyük ölçüde dead code'dan arındırılmıştır. Ancak **UI, 3 kritik noktada tutamayacağı sözler veriyor** ve `.env`, SQLite ve localStorage arasında **veri kaynağı belirsizlikleri** sistem büyüdükçe karışıklık yaratacaktır.

### En Ciddi 5 Mimari Sorun

| # | Sorun | Önem |
|---|-------|------|
| 1 | **Modül "aktif/pasif" toggle'ı kozmetik** — admin UI'dan modülü pasife alabilir ama pipeline bunu yok sayar; pasif modüllerde iş hâlâ çalışır | Kritik |
| 2 | **Provider fallback sırası UI'ı dead code** — admin sıralama yapabilir ama `ProviderRegistry` bu sırayı DB'den asla okumaz | Kritik |
| 3 | **Kullanıcı ayarları sadece localStorage'a kaydediliyor** — "Ayarlar kaydedildi" toast mesajı yanıltıcı; ayarlar backend'e gönderilmiyor | Yüksek |
| 4 | **Admin PIN frontend doğrulaması kolayca atlanabilir** — sadece localStorage okuma; gerçek koruma backend header kontrolü, ama frontend sahte güvenlik hissi veriyor | Orta |
| 5 | **İş silindiğinde session dosyaları yetim kalıyor** — `DELETE /api/jobs/{id}` DB kayıtlarını siler ama `sessions/{job_id}/` diskte kalır | Orta |

### En Ciddi 5 UI/UX Operasyonel Gerçeklik Sorunu

| # | Sorun | Önem |
|---|-------|------|
| 1 | Modül aktif/pasif toggle'ının çalışma zamanında sıfır etkisi var | Kritik |
| 2 | Provider fallback sırası yapılandırması hiçbir yerde tüketilmiyor | Kritik |
| 3 | Kullanıcı Ayarları kayıt butonu sadece localStorage yazan işlem için başarı toast'ı gösteriyor | Yüksek |
| 4 | SSE bağlantı kopması sadece log'a yazılıyor, ana UI'da gösterilmiyor | Yüksek |
| 5 | ProviderManager API anahtarlarını doğrulama yapmadan kaydediyor; "bağlantı test et" yok | Orta |

### En Ciddi 5 Veri Kaynağı / Konfigürasyon Sorunu

| # | Sorun | Önem |
|---|-------|------|
| 1 | API anahtarları hem `.env`'de HEM SQLite ayarlarında var — çalışma zamanında hangisi kazanır belirsiz (cevap: DB katmanı .env'yi geçer, ama bu belgelenmemiş) | Yüksek |
| 2 | `ADMIN_PIN` sadece `.env`'de yaşıyor ama frontend kullanıcının girdiği PIN'i localStorage'da saklıyor — senkronizasyon mekanizması yok | Orta |
| 3 | Modül `DEFAULT_CONFIG` dict'leri DB'ye otomatik oluşturulmuyor; admin modül düzeyindeki override'ları manuel olarak ayarlamalı | Orta |
| 4 | `openai_api_key`, `elevenlabs_api_key`, `pixabay_api_key` config'de tanımlı ama hiçbir provider implementasyonu bunları tüketmiyor | Düşük |
| 5 | `GET /api/settings/resolved` herkese açık — API anahtar kalıpları dahil tüm yapılandırmayı herhangi bir çağırıcıya açıyor | Düşük |

### En Büyük 5 Sadeleştirme Fırsatı

| # | Fırsat | Kazanım |
|---|--------|---------|
| 1 | `STATUS_CONFIG` ve `MODULE_INFO`'yu 4 frontend sayfasından çıkarıp `lib/constants.ts`'e taşı | 120+ satır tekrarı kaldır |
| 2 | Remotion frame hesaplama döngüsü, Vignette bileşeni ve `DEFAULT_DURATION_SECONDS`'ı ortak utils'e çıkar | 3 composition'daki üçlü tekrarı kaldır |
| 3 | `StandardVideo.tsx` ve `NewsBulletin.tsx`'den kullanılmayan `spring` import'unu kaldır | Dead import temizliği |
| 4 | `AppShell.tsx`'den hayalet `/admin/cost-tracker` referansını kaldır | Dead referans |
| 5 | `ProductReview.tsx`'de `SECTION_COLORS`, `SECTION_LABELS`, `SECTION_ICONS`'ı tek `SECTION_CONFIG`'da birleştir | 3 lookup'ı 1'e indir |

---

## 2. Mimari Değerlendirme

### Mimari Desen

**Desen:** Modüler monolit (3 süreç: FastAPI, Vite, Remotion CLI)
**Uygunluk:** Localhost-first, tek geliştirici YouTube otomasyon aracı için uygun
**Çalışma Zamanı:** Asenkron Python (FastAPI + uvicorn) + React SPA + Remotion CLI alt işlemi

### Katman Değerlendirmesi

| Katman | Durum | Notlar |
|--------|-------|--------|
| **API (FastAPI route'ları)** | Gerçek | 13 endpoint, tümü işlevsel, düzgün doğrulama |
| **İş Mantığı (pipeline, modüller, provider'lar)** | Gerçek | 6 adımlı pipeline gerçek provider'larla çalışıyor |
| **Kalıcılık (SQLite WAL)** | Gerçek | Jobs, steps, settings — düzgün ORM |
| **Durum Yönetimi (Zustand store'ları)** | Gerçek | 4 store, düzgün ayrım, SSE entegrasyonu çalışıyor |
| **UI (React sayfaları)** | Çoğunlukla Gerçek | 10 sayfa, 3'ünde dürüstlük sorunu var (yukarıya bakın) |
| **Video Kompozisyon (Remotion)** | Gerçek | 3 composition derleniyor, CLI alt işlemiyle render yapılıyor |
| **5 Katmanlı Ayarlar** | Gerçek | Hiyerarşi çalışıyor; admin kilitleri uygulanıyor; iş oluşturmada snapshot alınıyor |
| **Provider Fallback** | Kısmi | Registry var, `execute_with_fallback()` çalışıyor, ama admin yapılandırmalı sıra yok sayılıyor |

### Bağımlılık / Uyum (Coupling / Cohesion)

**Bağımlılık (Coupling):** DÜŞÜK — İyi ayrım. Modüller birbirini import etmiyor (news_bulletin/product_review'un standard_video step'lerini tekrar kullanması hariç, bu kasıtlı). Provider'lar registry tabanlı.

**Uyum (Cohesion):** YÜKSEK — Her modülün net sorumluluğu var. Pipeline step'leri bağımsız async fonksiyonlar. Store'ların ayrı alanları var.

### Proje Yapısı Hedefe Uyuyor mu?

**Evet.** Kod tabanı söz verdiğini teslim ediyor: modüler, genişletilebilir bir YouTube içerik üretim platformu. 3 katmanlı mimari (backend/frontend/remotion) problem alanına temiz bir şekilde eşleniyor. 10 fazlık geliştirme yaklaşımı, önemli teknik borç birikimi olmadan artımlı olarak sağlam kod üretti.

---

## 3. UI/UX Sistem Değerlendirmesi

### Yapısal Güvenilirlik

UI **10 sayfanın 8'inde yapısal olarak güvenilir**. Dashboard, CreateVideo, JobList, JobDetail, AdminDashboard, GlobalSettings, ProviderManager (API anahtar kaydetme) ve AdminJobs'un tümü uçtan uca gerçek backend operasyonlarına izlenebilir.

**İki sayfada dürüstlük sorunu var:**
1. **UserSettings** — kayıt işlemi sadece localStorage, backend'e kalıcı değil
2. **ModuleManager** — modül aktif toggle'ı kaydediliyor ama çalışma zamanında hiç kontrol edilmiyor

### Bilgi Mimarisi

Tutarlı çift UI tasarımı (kullanıcı + admin), net navigasyon. PAGE_TITLES eşlemesinde hiçbir route'a karşılık gelmeyen bir hayalet giriş var (`/admin/cost-tracker`).

### Veri Kaynağı Çatışmaları

Ayarlar 3 konumdan girilebilir:
1. `.env` dosyası (başlangıçta yüklenir)
2. Admin paneli (GlobalSettings, ModuleManager, ProviderManager → SQLite)
3. Kullanıcı tercihleri (UserSettings → sadece localStorage)

SettingsResolver, 1-4 katmanları kod+DB'den doğru şekilde birleştiriyor. Katman 5 (kullanıcı) yalnızca iş oluştururken istek gövdesindeki `settings_overrides` ile uygulanıyor. **Bu tasarım sağlam** ama **kullanıcılar için belgelenmemiş** — bir admin global ayarı değiştirdiğinde zaten oluşturulmuş işlerde etkisini görmeyecek (çünkü işler oluşturma anında ayarları snapshot'lıyor).

---

## 4. Dosya ve Modül Bulguları

### Çekirdek Modüller (Korunmalı)

| Dosya | Amaç | Katman | Risk | Öneri |
|-------|-------|--------|------|-------|
| `backend/main.py` (178 satır) | FastAPI app, yaşam döngüsü, CORS, health | altyapı | yüksek | koru |
| `backend/config.py` (194 satır) | Pydantic ayarları, .env yükleme | config | yüksek | koru |
| `backend/database.py` (121 satır) | SQLite WAL motoru, session fabrikası | kalıcılık | kritik | koru |
| `backend/models/job.py` (266 satır) | Job + JobStep ORM | kalıcılık | kritik | koru |
| `backend/models/settings.py` (124 satır) | Setting ORM (5 katmanlı) | kalıcılık | yüksek | koru |
| `backend/models/schemas.py` (240 satır) | Pydantic istek/yanıt şemaları | API | yüksek | koru |
| `backend/api/jobs.py` (400 satır) | Job CRUD + SSE endpoint'leri | API | yüksek | koru |
| `backend/api/settings.py` (305 satır) | Ayarlar CRUD endpoint'leri | API | yüksek | koru |
| `backend/services/job_manager.py` (629 satır) | İş yaşam döngüsü + SSE hub | iş_mantığı | kritik | koru |
| `backend/services/settings_resolver.py` (461 satır) | 5 katmanlı çözümleme motoru | iş_mantığı | yüksek | koru |
| `backend/pipeline/runner.py` (400 satır) | Asenkron iş yürütme orkestratörü | iş_mantığı | kritik | koru |
| `backend/pipeline/cache.py` (336 satır) | Session tabanlı dosya önbelleği | kalıcılık | yüksek | koru |
| `backend/modules/base.py` (150 satır) | ContentModule ABC + Capability enum | iş_mantığı | yüksek | koru |
| `backend/modules/registry.py` (138 satır) | Modül registry singleton | iş_mantığı | yüksek | koru |
| `backend/modules/standard_video/pipeline.py` (647 satır) | 6 adımlı pipeline (gerçek provider'lar) | iş_mantığı | kritik | koru |
| `backend/providers/base.py` (125 satır) | BaseProvider ABC + ProviderResult | iş_mantığı | yüksek | koru |
| `backend/providers/registry.py` (305 satır) | Provider registry + fallback zinciri | iş_mantığı | yüksek | koru |

### Destekleyici Modüller

| Dosya | Amaç | Katman | Risk | Öneri |
|-------|-------|--------|------|-------|
| `backend/pipeline/steps/script.py` (376 satır) | Kategori prompt'ları, hook'lar | iş_mantığı | orta | koru |
| `backend/pipeline/steps/subtitles.py` (432 satır) | 3 katmanlı zamanlama, 5 stil | iş_mantığı | orta | koru |
| `backend/pipeline/steps/composition.py` (643 satır) | Props builder'lar, Remotion CLI | iş_mantığı | yüksek | koru |
| `backend/modules/news_bulletin/pipeline.py` (368 satır) | URL çekme, bülten senaryosu | iş_mantığı | orta | koru |
| `backend/modules/product_review/pipeline.py` (258 satır) | Pro/Con yapılandırılmış inceleme | iş_mantığı | orta | koru |
| `backend/providers/llm/gemini.py` (204 satır) | Google Gemini LLM provider | altyapı | düşük | koru |
| `backend/providers/tts/edge_tts_provider.py` (214 satır) | Edge TTS (ücretsiz, kelime zamanlaması) | altyapı | düşük | koru |
| `backend/providers/visuals/pexels.py` (355 satır) | Pexels stok medya | altyapı | düşük | koru |
| `backend/utils/logger.py` (195 satır) | JSON yapılandırılmış loglama | altyapı | orta | koru |

### Frontend Çekirdek

| Dosya | Amaç | Katman | Risk | Öneri |
|-------|-------|--------|------|-------|
| `frontend/src/api/client.ts` (196 satır) | Fetch sarmalayıcı + SSE | API | yüksek | koru |
| `frontend/src/stores/jobStore.ts` (362 satır) | Job CRUD + SSE abonelik | durum | yüksek | koru |
| `frontend/src/stores/settingsStore.ts` (155 satır) | Kullanıcı varsayılanları + çözümlenmiş config | durum | yüksek | koru |
| `frontend/src/stores/adminStore.ts` (172 satır) | Admin ayarlar CRUD | durum | yüksek | koru |
| `frontend/src/stores/uiStore.ts` (131 satır) | Tema, sidebar, toast'lar | durum | yüksek | koru |
| `frontend/src/pages/user/JobDetail.tsx` (525 satır) | SSE canlı ilerleme, loglar | UI | yüksek | koru |
| `frontend/src/pages/admin/ProviderManager.tsx` (607 satır) | Provider yapılandırma (en büyük sayfa) | UI | yüksek | koru |

### Şüpheli / Dikkat Gerektiren

| Dosya | Sorun | Öneri |
|-------|-------|-------|
| `frontend/src/pages/user/UserSettings.tsx` (441 satır) | Kayıt sadece localStorage; yanıltıcı başarı toast'ı | yeniden bağla |
| `frontend/src/pages/admin/ModuleManager.tsx` (461 satır) | Modül toggle'ının çalışma zamanı etkisi yok | yeniden bağla |
| `frontend/src/pages/admin/GlobalSettings.tsx` (371 satır) | Kullanılmayan `SCOPE_TABS` sabiti (satır 27-29) | sadeleştir |
| `frontend/src/components/layout/AppShell.tsx` (52 satır) | Hayalet `/admin/cost-tracker` PAGE_TITLES'da (satır 21) | sadeleştir |
| `frontend/src/components/layout/Header.tsx` (183 satır) | PIN backend yerine localStorage'a karşı doğrulanıyor (satır 24-26) | belgele |

### Remotion — Yeniden Düzenleme Adayları

| Dosya | Sorun | Öneri |
|-------|-------|-------|
| `remotion/src/compositions/StandardVideo.tsx` (292 satır) | Kullanılmayan `spring` import'u | sadeleştir |
| `remotion/src/compositions/NewsBulletin.tsx` (338 satır) | Kullanılmayan `spring` import'u, kullanılmayan `globalFrame` değişkeni | sadeleştir |
| `remotion/src/compositions/ProductReview.tsx` (560 satır) | En büyük dosya; 3 ayrı lookup nesnesi birleştirilmeli | yeniden düzenle |
| `remotion/src/Root.tsx` (172 satır) | `calculateMetadata` 3 kez tekrarlanmış | yeniden düzenle |

### Kaldırılabilir Adaylar

| Dosya/Öğe | Neden Kaldırılabilir | Güven | Risk |
|-----------|---------------------|-------|------|
| `spring` import'u `StandardVideo.tsx`'de | Dosyada kullanılmıyor | Yüksek | Yok |
| `spring` import'u `NewsBulletin.tsx`'de | Dosyada kullanılmıyor | Yüksek | Yok |
| `globalFrame` değişkeni `NewsBulletin.tsx`'de | Kullanılmıyor | Yüksek | Yok |
| `SCOPE_TABS` sabiti `GlobalSettings.tsx` satır 27-29 | Tanımlı ama hiç kullanılmıyor | Yüksek | Yok |
| `/admin/cost-tracker` `AppShell.tsx` satır 21'de | Karşılık gelen route yok | Yüksek | Yok |
| `backend/providers/composition/__init__.py` | Boş yer tutucu paket | Orta | Düşük |
| `config.py`: `kieai_api_key`, `pixabay_api_key`, `youtube_client_id`, `youtube_client_secret` | Tanımlı ama hiçbir provider tüketmiyor | Orta | Düşük |

---

## 5. Teknik Borç ve Kod Kokuları

### Aşırı Mühendislik

Önemli bir şey yok. 5 katmanlı ayar sistemi en karmaşık kısım ve admin kilitleri + modüle özgü override gereksinimiyle gerekçelendirilmiş.

### Dead Code

| Konum | Kod | Tür |
|-------|-----|-----|
| `StandardVideo.tsx` satır ~20 | `import { spring }` | Kullanılmayan import |
| `NewsBulletin.tsx` satır ~11 | `import { spring }` | Kullanılmayan import |
| `NewsBulletin.tsx` satır ~42 | `const globalFrame = useCurrentFrame()` | Kullanılmayan değişken |
| `GlobalSettings.tsx` satır 27-29 | `const SCOPE_TABS` | Kullanılmayan sabit |
| `AppShell.tsx` satır 21 | `"/admin/cost-tracker": "Maliyet Takibi"` | Hayalet route başlığı |
| `config.py` | `openai_api_key`, `elevenlabs_api_key`, `pixabay_api_key`, `kieai_api_key` | Tanımlı ama hiçbir provider tüketmiyor |

### Tekrarlanan Mantık

| Desen | Konumlar | Etkilenen Satır |
|-------|----------|----------------|
| `STATUS_CONFIG` (durum renkleri/etiketleri) | Dashboard, JobList, JobDetail, AdminJobs | ~40 satır × 4 = ~160 |
| `MODULE_INFO` (modül görünen adları) | Dashboard, JobList, AdminJobs | ~20 satır × 3 = ~60 |
| Frame hesaplama döngüsü | StandardVideo:244, NewsBulletin:96, ProductReview:525 | ~12 satır × 3 = ~36 |
| Vignette overlay bileşeni | StandardVideo:283, NewsBulletin:132, ProductReview (satır içi) | ~8 satır × 3 = ~24 |
| `DEFAULT_DURATION_SECONDS = 5` | StandardVideo, NewsBulletin, ProductReview | 3 konum |
| Root.tsx'de `calculateMetadata` deseni | Satır 85, 120, 156 | ~15 satır × 3 = ~45 |

### String Tabanlı Mantık

| Konum | Sorun |
|-------|-------|
| `video_resolution` `"1920x1080"` string olarak saklanıyor | composition.py'de `.split("x")` ile ayrıştırılıyor — kırılgan |
| SQLite'ta `settings.value` JSON metin olarak saklanıyor | Tip bilgisi kayboluyor; `"30"` string mi int mi belirsiz |

### Gizli Yan Etkiler

| Konum | Yan Etki |
|-------|----------|
| `backend/modules/registry.py` import'u | Import zamanında `_register_all_modules()` tetikleniyor |
| `backend/providers/registry.py` import'u | Import zamanında `_register_all_providers()` tetikleniyor |
| `backend/pipeline/steps/script.py` | Modül düzeyinde `_used_hook_types` listesi — oturum durumu işler arasında sızar |

### Konfigürasyon Karmaşası

| Sorun | Detay |
|-------|-------|
| API anahtarları 2 yerde | `.env` (başlangıç) + SQLite `settings` tablosu (çalışma zamanı) — DB, SettingsResolver aracılığıyla kazanır |
| Modül varsayılanları DB'de yok | `standard_video/config.py` DEFAULT_CONFIG hiçbir zaman settings tablosuna otomatik oluşturulmuyor |
| Frontend PIN'i farklı saklıyor | localStorage anahtarı `cm-admin-pin` vs backend `config.admin_pin` `.env`'den |

---

## 6. UI Öğesi Gerçeklik Tablosu

| Ekran / Öğe | Kullanıcıya Görünen Amaç | Erişilebilirlik | Gerçek Hedef | Çalışma Zamanı Etkisi | Kalıcılık | Geri Okuyan Tüketici | Geri Bildirim Dürüstlüğü | Karar |
|---|---|---|---|---|---|---|---|---|
| **Video Oluştur "İşi Başlat"** | Video işi oluştur | ✓ /create | POST /api/jobs → run_pipeline() | İş oluşturulur, pipeline başlar | SQLite jobs + job_steps | Pipeline runner | Dürüst (iş detayına yönlendiriyor) | **GERÇEK** |
| **İş Detayı "İptal Et"** | Çalışan işi iptal et | ✓ /jobs/:id | PATCH /api/jobs/{id} status=cancelled | DB güncellenir, pipeline mevcut adımdan sonra durur | SQLite jobs.status | Runner durum kontrolü | Dürüst (toast + SSE güncelleme) | **GERÇEK** |
| **İş Detayı SSE akışı** | Canlı ilerleme | ✓ /jobs/:id | GET /api/jobs/{id}/events | Gerçek zamanlı adım/log güncellemeleri | Bellek içi kuyruk | Frontend store | Kısmi (bağlantı kopma göstergesi yok) | **GERÇEK** ⚠ |
| **Kullanıcı Ayarları "Kaydet"** | Kullanıcı tercihlerini kaydet | ✓ /settings | Zustand persist → localStorage | localStorage güncellenir | localStorage cm-settings | Sonraki CreateVideo form varsayılanları | **Dürüst Değil** (backend'e gönderilmiyor ama "kaydedildi" diyor) | **KISMİ** |
| **Header Admin PIN** | Admin panelini aç | ✓ header | Sadece localStorage kontrolü | UI durum değişikliği | localStorage cm-admin-pin | API çağrılarında X-Admin-Pin header | Yanıltıcı (frontend bypass mümkün) | **KOZMETİK** (frontend) / **GERÇEK** (backend) |
| **Global Ayarlar CRUD** | Admin ayarlarını yönet | ✓ /admin/global-settings | POST/PUT/DELETE /api/settings | SQLite settings güncellenir | SQLite settings tablosu | SettingsResolver katman 2 | Dürüst | **GERÇEK** |
| **Global Ayarlar Kilit toggle** | Kullanıcı override'ını engelle | ✓ /admin/global-settings | PUT /api/settings/{id} locked=true | Kilit bayrağı kaydedilir | SQLite settings.locked | SettingsResolver kullanıcı katmanını atlar | Dürüst | **GERÇEK** |
| **Modül Yönetimi aktif toggle** | Modülü aktif/pasif yap | ✓ /admin/modules | PUT /api/settings/{id} | Ayar DB'ye kaydedilir | SQLite settings (modül scope) | **HİÇBİR ŞEY bunu okumuyor** | **Dürüst Değil** (toggle çalışıyor gibi görünüyor) | **KOZMETİK** |
| **Provider Yönetimi API anahtar kaydetme** | Provider anahtarını yapılandır | ✓ /admin/providers | PUT /api/settings/{id} | Anahtar kaydedilir | SQLite settings (provider scope) | Provider.execute() config üzerinden | Kısmi (doğrulama yok) | **GERÇEK** ⚠ |
| **Provider Yönetimi fallback sırası** | Provider önceliğini ayarla | ✓ /admin/providers | PUT /api/settings/{id} | DB'ye kaydedilir | SQLite settings | **HİÇBİR ŞEY bunu okumuyor** | **Dürüst Değil** | **DEAD** |
| **Admin İşler silme** | İş kaydını kaldır | ✓ /admin/jobs | DELETE /api/jobs/{id} | DB kayıtları silinir | SQLite (cascade delete) | Yok (kaldırıldı) | Kısmi (dosyalar yetim kalır) | **GERÇEK** ⚠ |
| **Dashboard sağlık kontrolü** | Sistem durumunu göster | ✓ /dashboard | GET /health | Salt okunur | Yok | UI gösterimi | Dürüst | **GERÇEK** |

---

## 7. Eylem Akışı İzleme Tablosu

| Eylem | Giriş Noktası | Handler | API Yolu | Backend Hedefi | Kalıcılık | Sonraki Tüketici | Gerçek Sonuç | Karar |
|---|---|---|---|---|---|---|---|---|
| Video oluştur | CreateVideo.tsx form | jobStore.createJob() | POST /api/jobs | JobManager.create_job() → asyncio.create_task(run_pipeline) | SQLite jobs+steps | PipelineRunner | İş kuyruğa alınır ve pipeline başlar | **GERÇEK** |
| İş iptal et | JobDetail.tsx buton | jobStore.cancelJob() | PATCH /api/jobs/{id} | JobManager.update_job_status("cancelled") | SQLite jobs.status | Runner her adımdan sonra kontrol eder | Durum değişir, pipeline mevcut adımdan sonra durur | **GERÇEK** |
| Kullanıcı ayarı kaydet | UserSettings.tsx form | settingsStore.setUserDefaults() | (yok) | Zustand persist middleware | localStorage | Sonraki CreateVideo form varsayılanları | Yerel olarak kaydedilir, sadece sonraki iş oluşturma formunu etkiler | **KISMİ** |
| Admin: ayar oluştur | GlobalSettings.tsx form | adminStore.createSetting() | POST /api/settings | SettingsResolver.upsert() | SQLite settings | SettingsResolver.resolve() iş oluşturmada | Ayar 5 katmanlı birleştirmede kullanılabilir | **GERÇEK** |
| Admin: ayar kilitle | GlobalSettings.tsx toggle | adminStore.updateSetting() | PUT /api/settings/{id} | Setting.locked = True | SQLite settings.locked | SettingsResolver kullanıcı override'ını engeller | Bu anahtar için kullanıcı katmanı yok sayılır | **GERÇEK** |
| Admin: API anahtarı kaydet | ProviderManager.tsx alan | adminStore.updateSetting() | PUT /api/settings/{id} | Setting.value güncellenir | SQLite settings (provider scope) | Provider.execute() config.get() ile okur | Anahtar sonraki iş oluşturmada kullanılabilir | **GERÇEK** |
| Admin: modül toggle | ModuleManager.tsx switch | adminStore.updateSetting() | PUT /api/settings/{id} | Setting(scope=module, key=enabled) kaydedilir | SQLite settings | **Hiçbir şey** | Ayar kaydedilir ama pipeline/registry tarafından yok sayılır | **KOZMETİK** |
| Admin: fallback sırası | ProviderManager.tsx editör | adminStore.updateSetting() | PUT /api/settings/{id} | Ayar kaydedilir | SQLite settings | **Hiçbir şey** | Sıra kaydedilir ama ProviderRegistry yok sayar | **DEAD** |
| Admin: iş sil | AdminJobs.tsx buton | adminStore.deleteJob() | DELETE /api/jobs/{id} | JobManager.delete_job() (sadece terminal) | SQLite (cascade delete) | Yok (kaldırıldı) | DB temiz, session dosyaları kalır | **GERÇEK** ⚠ |

---

## 8. Veri Kaynağı Tablosu

| Değer | Giriş Konumları | Yazma Yolları | Çalışma Zamanı Okuma Yolu | Override Kaynakları | Efektif Veri Kaynağı | Çatışmalar | Karar |
|---|---|---|---|---|---|---|---|
| `gemini_api_key` | .env, ProviderManager UI | .env → config.py; UI → SQLite | GeminiProvider'da `config.get("gemini_api_key")` | DB katmanları 2-4, .env'yi geçer | **SQLite (ayarlanmışsa), yoksa .env** | Her iki yol da çalışıyor ama öncelik belgelenmemiş | ⚠ Belgelenmeli |
| `pexels_api_key` | .env, ProviderManager UI | .env → config.py; UI → SQLite | PexelsProvider'da `config.get("pexels_api_key")` | Yukarıdaki ile aynı | **SQLite (ayarlanmışsa), yoksa .env** | Aynı | ⚠ |
| `openai_api_key` | .env, ProviderManager UI | .env → config.py; UI → SQLite | **Tüketilmiyor** — OpenAI provider implementasyonu yok | Yok | **Yok (dead config)** | config'de var ama kullanılmıyor | Dead |
| `admin_pin` | Sadece .env | .env → config.py | `_require_admin()` `app_settings.admin_pin` okur | Yok (DB katmanı yok) | **Sadece .env** | Frontend localStorage uyumsuz olabilir | ⚠ |
| `default_tts_provider` | .env, config.py varsayılan, admin ayarları, modül config, kullanıcı override | 5 katman | step_tts'de `config.get("tts_provider")` | Tam 5 katmanlı hiyerarşi | **Kilitli olmayan en yüksek katman kazanır** | Doğru çalışıyor | ✓ |
| `subtitle_style` | Modül config, admin ayarları, CreateVideo form | Modül config (kod), admin (SQLite), kullanıcı (istek override) | subtitles.py'de `config.get("subtitle_style")` | Tam 5 katmanlı hiyerarşi | **İş oluşturma snapshot'ı** | Doğru çalışıyor | ✓ |
| `video_resolution` | Modül config, admin ayarları | Kod varsayılan "1920x1080", SQLite | composition.py'de `config.get("video_resolution")` `.split("x")` ile | Tam 5 katmanlı hiyerarşi | **İş oluşturma snapshot'ı** | String ayrıştırma kırılgan | ⚠ |
| `tts_voice` | Modül config, provider ayarları, kullanıcı override | Modül config (kod), provider (SQLite), kullanıcı (istek) | EdgeTTSProvider'da `config.get("tts_voice")` | Tam hiyerarşi | **İş oluşturma snapshot'ı** | Doğru çalışıyor | ✓ |
| Modül `enabled` | ModuleManager UI | SQLite settings (modül scope) | **Okunmuyor** | Yok | **Uygulanmıyor** | Ayar kaydedilir ama yok sayılır | ❌ Dead |
| Provider fallback sırası | ProviderManager UI | SQLite settings (admin scope) | ProviderRegistry tarafından **okunmuyor** | Yok | **Uygulanmıyor** | Ayar kaydedilir ama yok sayılır | ❌ Dead |

---

## 9. Route-Yetenek Tablosu

| Route | Bileşen | Gerçek Backend Yeteneği | Tamlık | Karar |
|---|---|---|---|---|
| `/dashboard` | Dashboard.tsx | GET /jobs/stats, GET /jobs, GET /health | Tam | **İşlevsel** |
| `/create` | CreateVideo.tsx | POST /api/jobs → pipeline | Tam | **İşlevsel** |
| `/jobs` | JobList.tsx | GET /api/jobs (sayfalı, filtreli) | Tam | **İşlevsel** |
| `/jobs/:jobId` | JobDetail.tsx | GET /api/jobs/{id}, SSE akışı, PATCH iptal | Tam | **İşlevsel** |
| `/settings` | UserSettings.tsx | GET /api/settings/resolved (okuma) | Kısmi — yazma sadece localStorage | **Kısmi** |
| `/admin/dashboard` | AdminDashboard.tsx | GET /jobs/stats, GET /health | Tam | **İşlevsel** |
| `/admin/global-settings` | GlobalSettings.tsx | Tam CRUD /api/settings (admin scope) | Tam | **İşlevsel** |
| `/admin/modules` | ModuleManager.tsx | CRUD /api/settings (modül scope) | Kısmi — aktif toggle kozmetik | **Kısmi** |
| `/admin/providers` | ProviderManager.tsx | CRUD /api/settings (provider scope) | Kısmi — fallback sırası dead | **Kısmi** |
| `/admin/jobs` | AdminJobs.tsx | GET /api/jobs, DELETE /api/jobs/{id} | Tam (dosyalar temizlenmiyor) | **İşlevsel** ⚠ |
| `/admin/cost-tracker` | (yok) | Yok | PAGE_TITLES'da route başlığı var ama route yok | **Hayalet** |

---

## 10. Kaldırma Adayları

| Dosya / Öğe | Neden Kaldırılabilir | Güven | Kaldırılırsa Risk | Doğrulama |
|---|---|---|---|---|
| `spring` import'u `StandardVideo.tsx`'de | Kullanılmayan import | Yüksek | Yok | `tsc --noEmit` geçer |
| `spring` import'u `NewsBulletin.tsx`'de | Kullanılmayan import | Yüksek | Yok | `tsc --noEmit` geçer |
| `globalFrame` değişkeni `NewsBulletin.tsx`'de | Kullanılmayan değişken | Yüksek | Yok | `tsc --noEmit` geçer |
| `SCOPE_TABS` `GlobalSettings.tsx` satır 27-29 | Tanımlı ama hiç kullanılmıyor | Yüksek | Yok | SCOPE_TABS kullanımı için grep |
| `/admin/cost-tracker` `AppShell.tsx` satır 21 | Karşılık gelen route yok | Yüksek | Yok | App.tsx'de route yok |
| `backend/providers/composition/__init__.py` | Boş yer tutucu paket | Orta | Düşük (gelecek kullanım) | Import kontrolü |
| `config.py`: `kieai_api_key`, `pixabay_api_key`, `youtube_client_id`, `youtube_client_secret` | Tanımlı ama hiçbir provider tüketmiyor | Orta | Düşük | Grep ile kullanım doğrulama |

---

## 11. Birleştirme / Düzleştirme / Sadeleştirme Adayları

| İlgili Dosyalar | Neden Örtüşüyorlar | Önerilen Sadeleştirme | Beklenen Kazanım | Risk |
|---|---|---|---|---|
| Dashboard, JobList, JobDetail, AdminJobs | `STATUS_CONFIG` + `MODULE_INFO` tekrarlanmış | `frontend/src/lib/constants.ts`'e çıkar | -160 satır tekrar | Düşük |
| StandardVideo, NewsBulletin, ProductReview | Frame hesaplama döngüsü (12 satır × 3) | `remotion/src/utils/calculateSceneFrames.ts`'e çıkar | -24 satır, tek kaynak | Düşük |
| StandardVideo, NewsBulletin, ProductReview | Vignette bileşeni (8 satır × 3) | `remotion/src/components/Vignette.tsx`'e çıkar | -16 satır | Düşük |
| StandardVideo, NewsBulletin, ProductReview | `DEFAULT_DURATION_SECONDS = 5` | `remotion/src/constants.ts`'e çıkar | Tek sabit | Düşük |
| Root.tsx | `calculateMetadata` deseni × 3 | Fabrika fonksiyonu `createCalculateMetadata(itemsKey)` | -30 satır | Düşük |
| ProductReview.tsx | `SECTION_COLORS` + `SECTION_LABELS` + `SECTION_ICONS` (3 nesne) | Tek `SECTION_CONFIG` nesnesinde birleştir | Daha temiz lookup | Düşük |

---

## 12. Bağımlılık İncelemesi

### Python (requirements.txt)

| Paket | Amaç | Karar |
|-------|-------|-------|
| `aiohttp` (3.11.10) | Asenkron HTTP istemci | **Gereksiz** — `httpx` zaten asenkron HTTP sağlıyor; aiohttp kod tabanında kullanılmıyor |
| `ffmpeg-python` (0.2.0) | FFmpeg sarmalayıcı | **Kullanılmıyor** — Remotion video kompozisyonunu hallediyor; doğrudan ffmpeg çağrısı bulunamadı |
| `elevenlabs` (1.9.0) | ElevenLabs TTS | **Kullanılmıyor** — ElevenLabs provider implementasyonu yok |
| `openai` (1.57.2) | OpenAI API | **Kısmen kullanılmıyor** — Whisper subtitles.py'de referanslanmış ama provider sınıfı yok |
| `google-generativeai` (0.8.3) | Gemini LLM | **Deprecated** — Kütüphane FutureWarning gösteriyor; `google-genai`'ye geçilmeli |
| `aiofiles` (24.1.0) | Asenkron dosya I/O | **Muhtemelen kullanılmıyor** — Cache manager senkron dosya I/O kullanıyor |
| `python-multipart` (0.0.20) | Dosya yüklemeleri | **Muhtemelen kullanılmıyor** — Dosya yükleme endpoint'i bulunamadı |

### Frontend (package.json)

Tüm bağımlılıklar aktif olarak kullanılıyor. Gereksizlik tespit edilmedi. Radix UI bileşenleri gerçek Shadcn kullanımıyla eşleşiyor.

### Remotion (package.json)

Minimal ve doğru. `@remotion/player` dahil ama sadece Studio önizleme için gerekli olabilir, CLI render için değil.

---

## 13. Yeniden Düzenleme Strateji Seçenekleri

### Seçenek A: Muhafazakâr Temizlik (Önerilen)

**Ne zaman uygun:** Çekirdek sağlam ve sorunlar kenarlarda olduğunda.

**Ne yapılır:**
1. Dead import'ları/değişkenleri kaldır (StandardVideo, NewsBulletin, GlobalSettings)
2. AppShell'deki hayalet route başlığını kaldır
3. `STATUS_CONFIG`/`MODULE_INFO`'yu ortak sabitlere çıkar
4. Remotion ortak utils'lerini çıkar (frame hesap, Vignette, sabitler)
5. `run_pipeline()`'a modül aktif kontrolü ekle (5 satır)
6. `ProviderRegistry.get_ordered_providers()`'a fallback sırası okuma ekle (10 satır)
7. `delete_job()`'a session dizini silme ekle (3 satır)
8. UserSettings kaydetmeyi backend API çağrısı içerecek şekilde düzelt
9. Kullanılmayan Python paketlerini kaldır (aiohttp, ffmpeg-python)
10. API anahtarı önceliğini belgele (.env vs DB)

**Ne kalır:** Tüm mimari, tüm dosyalar, tüm route'lar.

**Kazanımlar:** Minimum risk, maksimum dürüstlük iyileştirmesi, < 1 günlük iş.
**Riskler:** Daha derin sorunları ele almıyor (SSE yeniden bağlanma, deprecated google-generativeai).
**Efor:** 4-6 saat.

### Seçenek B: Çekirdeği Koru, Kenarları Yeniden İnşa Et

**Ne zaman uygun:** Bazı alt sistemlerin önemli yeniden bağlantıya ihtiyaç duyduğunda.

**Ne yapılır:** Seçenek A'daki her şey, artı:
1. OpenAI TTS/LLM provider'larını implemente et (paketler zaten yüklü)
2. `google-generativeai` → `google-genai`'ye geçir
3. Üstel geri çekilme ile SSE yeniden bağlanma implemente et
4. Provider sağlık kontrolü/bağlantı test butonu ekle
5. Eşzamanlı iş sınırlayıcı implemente et (asyncio.Semaphore)
6. İlk çalıştırmada modül DEFAULT_CONFIG'un DB'ye otomatik oluşturulmasını ekle
7. API endpoint'lerini sürümlendir (`/api/v1/`)

**Ne kalır:** Çekirdek mimari, veritabanı şeması, pipeline mantığı, UI yapısı.

**Kazanımlar:** Üretime hazır güvenilirlik.
**Riskler:** google-generativeai geçişi regresyon getirebilir.
**Efor:** 2-3 gün.

### Seçenek C: Kontrollü Yeniden Yazma

**Ne zaman uygun:** Mimari temelden yanlış olduğunda. **Burada durum bu DEĞİL.**

Önerilmiyor. Mimari sağlam. Yeniden yazma, 10 fazlık artımlı çalışmayı anlamlı bir kazanım olmadan yok eder.

---

## 14. Önerilen Yol

**Seçenek A: Muhafazakâr Temizlik.**

**Neden:** Kod tabanı gerçekten iyi. 44 backend dosyasının 35'i ve 21 frontend dosyasının 19'u sıfır değişiklik gerektiriyor. Sorunlar yerelleşmiş: 2 dead UI özelliği (modül toggle, fallback sırası), 1 yanıltıcı kaydetme (UserSettings) ve bazı dead import'lar. Bunlar cerrahi düzeltmeler, mimari sorunlar değil.

**Önce ne yapılmalı:**
1. `run_pipeline()`'a modül aktif kontrolünü bağla — en yüksek etkili düzeltme (5 satır kod, kozmetik toggle'ı gerçek özelliğe dönüştürür)
2. `ProviderRegistry.get_ordered_providers()`'a fallback sırası okumayı bağla — ikinci en yüksek etki
3. UserSettings'i kaydetme sırasında backend API çağıracak şekilde düzelt

**Önce ne DOKUNULMAMALI:**
- Pipeline runner mantığı (doğru çalışıyor)
- Provider implementasyonları (doğru çalışıyor)
- Veritabanı şeması (değişiklik gerekmiyor)
- Ayar çözümleme hiyerarşisi (doğru çalışıyor)

**Derhal ne dondurulmalı:**
- `backend/pipeline/runner.py` — kritik yol, çalışıyor, dokunma
- `backend/services/job_manager.py` — durum makinesi, çalışıyor, dokunma
- `backend/services/settings_resolver.py` — 5 katmanlı hiyerarşi, çalışıyor, dokunma

**Hangi ayar akışı önce tek veri kaynağı olmalı:**
- API anahtarları için SQLite settings tablosunun .env değerlerini geçersiz kıldığını belgele
- İş oluşturmanın ayarları snapshot'ladığını belgele (değişiklikler çalışan işleri etkilemiyor)

---

## 15. Sıralı Kurtarma Planı

### Adım 1: Dead Code Temizliği (30 dk, sıfır risk)
- [ ] `StandardVideo.tsx`'den `spring` import'unu kaldır
- [ ] `NewsBulletin.tsx`'den `spring` import'unu ve `globalFrame`'i kaldır
- [ ] `GlobalSettings.tsx`'den `SCOPE_TABS`'ı kaldır
- [ ] `AppShell.tsx` PAGE_TITLES'dan `/admin/cost-tracker` kaldır
- [ ] Doğrulamak için frontend ve remotion'da `tsc --noEmit` çalıştır
- [ ] `requirements.txt`'den kullanılmayan paketleri kaldır: `aiohttp`, `ffmpeg-python`

### Adım 2: Dead UI Özelliklerini Bağla (1 saat, düşük risk)
- [ ] `backend/pipeline/runner.py`'de `_execute_step` döngüsünden önce modül aktif kontrolü ekle
- [ ] `backend/providers/registry.py` `get_ordered_providers()`'a fallback sırası okuma ekle — config dict'ten `fallback_order_{category}` oku
- [ ] `backend/services/job_manager.py` `delete_job()`'a session dizini silme ekle — `shutil.rmtree(session_dir)`

### Adım 3: UserSettings Dürüstlüğünü Düzelt (1 saat, düşük risk)
- [ ] `UserSettings.tsx` kaydetme handler'ını backend API çağıracak şekilde değiştir (POST /api/settings scope="user" ile)
- [ ] Başarı toast'ını sadece backend onayladıktan sonra göster
- [ ] localStorage'ı birincil depo değil önbellek olarak tut

### Adım 4: Ortak Sabitleri Çıkar (1 saat, düşük risk)
- [ ] `STATUS_CONFIG` ve `MODULE_INFO` ile `frontend/src/lib/constants.ts` oluştur
- [ ] Dashboard, JobList, JobDetail, AdminJobs'u ortak dosyadan import edecek şekilde güncelle
- [ ] `DEFAULT_DURATION_SECONDS` ile `remotion/src/constants.ts` oluştur
- [ ] Vignette'i `remotion/src/components/Vignette.tsx`'e çıkar
- [ ] Frame hesaplamayı `remotion/src/utils/calculateSceneFrames.ts`'e çıkar

### Adım 5: Konfigürasyon Önceliğini Belgele (30 dk, sıfır risk)
- [ ] DEVELOPER_GUIDE.md'ye "Konfigürasyon Önceliği" bölümü ekle
- [ ] Belgele: `.env` → kod varsayılanları → admin DB → modül DB → provider DB → kullanıcı override
- [ ] Belgele: iş oluşturma snapshot'ları oluşturulduktan sonra değişmez
- [ ] Belgele: DB'deki API anahtarları .env değerlerini geçersiz kılar

### Adım 6: Doğrulama (30 dk)
- [ ] Tam Python import testi çalıştır (21+ modül)
- [ ] Frontend'de `tsc --noEmit` çalıştır
- [ ] Remotion'da `tsc --noEmit` çalıştır
- [ ] Manuel test: iş oluştur, iş iptal et, admin ayarlar CRUD
- [ ] Modül aktif toggle'ının artık iş yürütmeyi engellediğini doğrula

---

## 16. Nihai Karar

**"Sıfırdan başlama; mevcut kod tabanını sadeleştir."**

**5 somut gerekçe:**

1. **Mimari sağlam.** 3 katmanlı ayrım (backend/frontend/remotion) probleme doğru eşleniyor. Modül sistemi genişletilebilir. Provider deseni değiştirme imkânı sağlıyor. 5 katmanlı ayar hiyerarşisi iyi tasarlanmış ve işlevsel.

2. **Kod kalitesi yüksek.** 44 Python dosyası, 21 TSX dosyası, kapsamlı tip ipuçları, düzgün async/await, dairesel bağımlılık yok, tanrı sınıfları (god class) yok, minimum dead code. Bu, çoğu üretim kod tabanından daha iyi.

3. **Sorunlar yerelleşmiş.** 3 kritik sorun (modül toggle, fallback sırası, UserSettings kaydetme) her biri < 20 satır kodla düzeltilebilir. Bunlar mimari çürüme değil — tasarlanmış ama çalışma zamanına bağlanmamış özellikleri gösteriyor.

4. **Pipeline uçtan uca çalışıyor.** Temel değer önerisi — bir metin isteğini LLM + TTS + görseller + Remotion aracılığıyla render edilmiş videoya dönüştürme — tamamen işlevsel. Senaryo üretimi, kelime düzeyinde zamanlamalı Edge TTS, Pexels medya indirme, altyazı senkronizasyonu ve Remotion CLI render hepsi çalışıyor.

5. **10 fazlık artımlı çalışma.** Her faz öncekinin üzerine temiz bir şekilde inşa edilmiş. Kod tabanı disiplin gösteriyor: hack yok, kestirme yok, "bunu sonra düzeltirim" TODO'su yok. Bunu çöpe atmak israf olur. Yukarıdaki temizlik planı tespit edilen her sorunu 1 günden kısa sürede ele alıyor.

---

*Bu rapor code-audit yeteneği tarafından üretilmiştir. Tüm bulgular varsayımlara değil, gerçek dosya okumalarına dayanmaktadır.*
