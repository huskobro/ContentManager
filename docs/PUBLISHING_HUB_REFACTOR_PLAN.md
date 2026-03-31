# Publishing Hub Refactor Planı

**Faz:** 11.1A (tamamlandı)
**Kaynak:** Faz 11.2 YouTube-first implementasyonu → Publishing Hub mimarisine geçiş

---

## Sorun

Faz 11.2 ile oluşturulan implementasyonda YouTube platformu tüm sistemin omurgası haline geldi:

| Sorun | Dosya | Detay |
|---|---|---|
| Job modeli YouTube'a bağımlı | `backend/models/job.py` | `youtube_video_id`, `youtube_upload_status` vb. 6 alan doğrudan Job'da |
| Platform-specific servis | `backend/services/youtube_upload_service.py` | Token refresh, upload, metadata — hepsi YouTube-only |
| Platform-specific step | `backend/pipeline/steps/youtube_upload.py` | YouTube çağrısını doğrudan yapar, genelleştirilmiş değil |
| Kilitlenme riski | `backend/modules/standard_video/pipeline.py` | youtube_upload adımı, yeni platform eklenince tek tek yeni step gerektirirdi |

---

## Karar: Sıfırdan Yıkma Değil, Doğru Mimariye Geçiş

### Korunan Parçalar (kurtarılabilir)

| Parça | Neden Korunur |
|---|---|
| `youtube_upload_service.py` | Tüm YouTube mantığı burada — token refresh, upload, error mapping, metadata normalizer. Adapter'ın alt servisi olarak kullanılır. |
| `youtube_upload` pipeline step (order=6) | Test coverage'ı var, mevcut işlerde çalışıyor. Geçiş döneminde korunur. |
| `YouTubeChannel` ORM modeli | OAuth flow (`/api/youtube/oauth/callback`) hâlâ bu modeli kullanıyor. Bridge ile PlatformAccount'a dönüştürülür. |
| `Job.youtube_*` alanlar | Frontend `YoutubeUploadCard` bu alanları okuyor. Compat olarak korunur. |
| 19 YouTube upload testi | Regresyon testi olarak kalır. |

### Taşınan Parçalar

| Kaynak | Hedef | Strateji |
|---|---|---|
| `youtube_upload_service.py` upload mantığı | `publishing/adapters/youtube_adapter.py` | Adapter, service'i import eder — kod kopyalanmaz |
| YouTube token/credential mantığı | `_ChannelProxy` (adapter içinde) | PlatformAccount.credentials_json ↔ YouTubeChannel sütun arayüzü köprüsü |
| Pipeline yayın adımı | `pipeline/steps/publish.py` | Platform-agnostik, multi-platform |

### Eklenen Parçalar

| Yeni Bileşen | Açıklama |
|---|---|
| `backend/models/platform_account.py` | Platform-genel hesap modeli |
| `backend/models/publish_target.py` | `JobPublishTarget` + `PublishAttempt` |
| `backend/publishing/adapters/base.py` | `BasePublishAdapter` ABC + `PublishError` |
| `backend/publishing/adapters/youtube_adapter.py` | `YouTubeAdapter` + `_ChannelProxy` |
| `backend/publishing/orchestrator.py` | `PublishOrchestrator` + adapter registry |
| `backend/pipeline/steps/publish.py` | Generic multi-platform pipeline step |

### Uyumluluk Köprüleri

| Köprü | Dosya | Açıklama |
|---|---|---|
| `_youtube_channel_bridge()` | `pipeline/steps/publish.py` | YouTubeChannel → PlatformAccount lazy migration |
| `_ChannelProxy` | `publishing/adapters/youtube_adapter.py` | PlatformAccount → YouTubeChannel duck-type arayüzü |
| `_mirror_youtube_compat()` | `publishing/orchestrator.py` | Her YouTube publish'te Job.youtube_* compat alanlarını günceller |

---

## Faz 11.1A Sonunda Ne Tamamlandı

✅ `PlatformAccount` modeli (platform_accounts tablosu)
✅ `JobPublishTarget` modeli (job_publish_targets tablosu)
✅ `PublishAttempt` modeli (publish_attempts tablosu)
✅ `database.py` → üç yeni tablo create_tables'ta
✅ `BasePublishAdapter` ABC + `PublishError` (platform-agnostik)
✅ `YouTubeAdapter` → mevcut youtube_upload_service.py'yi sarar
✅ `_ChannelProxy` → PlatformAccount ↔ YouTubeChannel köprüsü
✅ `PublishOrchestrator` → adapter registry + attempt log
✅ `step_publish` → multi-platform pipeline adımı (order=7)
✅ `_youtube_channel_bridge()` → lazy migration
✅ `orchestrator._mirror_youtube_compat()` → Job.youtube_* compat
✅ `main.py` → startup log kontrolü
✅ 40 yeni test (5 dosya) — tümü geçiyor
✅ 34 regresyon testi (önceki) — kırılmadı
✅ `tsc --noEmit` temiz

---

## Faz 11.2B'de Tamamlananlar ✅

- Frontend `JobDetail.tsx` → `PublishHubCard` ile `JobPublishTarget` API'sinden okuma
- `GET /api/jobs/{id}/publish-targets` endpoint
- `GET /api/publish-targets/{id}/history` endpoint
- `POST /api/publish-targets/{id}/retry` endpoint (202 Accepted, arka plan task)
- `step_youtube_upload` çift yükleme koruması güçlendirildi (2b guard)
- `PublishTargetResponse`, `PublishAttemptResponse` Pydantic şemaları
- `fetchPublishTargets`, `retryPublishTarget` jobStore aksiyonları
- `publish_progress` SSE handler (client.ts + jobStore)
- 12 API testi → tümü geçti
- `tsc --noEmit` temiz

## Bir Sonraki Fazda Ne Yapılacak (11.2C / 11.3)

- `step_youtube_upload` (order=6) pipeline'dan kaldırılır (önce tüm aktif job'ların order=7'ye geçtiği doğrulanmalı)
- `Job.youtube_*` DB sütunları kaldırılır (frontend `YoutubeUploadCard` tamamen kaldırılınca)
- TikTok adapter iskeleti (API credential'ları olmadan stub)
- `youtube_channel_bridge()` → migration tamamlanınca kaldırılabilir
- Planlı yayın desteği (`scheduled_publish_time` + kuyruk mantığı)
