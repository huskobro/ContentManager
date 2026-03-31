# Compat Layer Durumu — Publishing Hub Geçişi

**Son güncelleme:** 2026-03-31 (Faz 11.2C)

Bu belge, YouTube-first mimarisinden Publishing Hub mimarisine geçiş sürecinde
hangi compat (geriye uyumluluk) katmanlarının nerede olduğunu, neden tutulduğunu
ve ne zaman kaldırılabileceğini belgeler.

---

## Özet: Kaynak Hakikati (Source of Truth)

| Veri | Faz 11.2B'den önce | Faz 11.2C sonrası |
|---|---|---|
| Yayın durumu | `Job.youtube_upload_status` | `JobPublishTarget.status` ✅ |
| Yayınlanan URL | `Job.youtube_video_url` | `JobPublishTarget.external_url` ✅ |
| Hata kodu | `Job.youtube_error_code` | `JobPublishTarget.error_message` ✅ |
| Yayın geçmişi | Yoktu | `PublishAttempt` ✅ |
| Upload adımı | `step_youtube_upload` (order=6) | `step_publish` (order=6) ✅ |
| Frontend UI | `YoutubeUploadCard` | `PublishHubCard` ✅ |

---

## Compat Katmanları — Detay

### 1. `Job.youtube_*` Alanları

**Durum:** `COMPAT-ONLY` — source of truth değil, sadece mirror

**Alanlar:**
- `youtube_video_id` (VARCHAR 32)
- `youtube_video_url` (VARCHAR 256)
- `youtube_channel_id` (VARCHAR 64)
- `youtube_upload_status` (VARCHAR 32)
- `youtube_error_code` (VARCHAR 64)
- `youtube_uploaded_at` (VARCHAR 32)

**Kim günceller:** `PublishOrchestrator._mirror_youtube_compat()` — her başarılı/başarısız YouTube yayınında bu alanları günceller.

**Kim okur:** Hiçbir aktif kod okumaz (Faz 11.2C sonrası). Frontend `YoutubeUploadCard` kaldırıldı. `jobStore.ts` `youtube_*` alanlarını `@deprecated` olarak işaretledi.

**Neden tutuldu:** SQLite sütun silme işlemi riskli (ALTER TABLE DROP COLUMN SQLite 3.35+ gerektirir). Veri kaybı riski yok, sütunlar boşta duruyor.

**Kaldırma koşulu:**
- `_mirror_youtube_compat()` kaldırılabilir (orchestrator.py)
- DB migration ile `ALTER TABLE jobs DROP COLUMN youtube_*` çalıştırılabilir
- `jobStore.ts` Job interface'inden `youtube_*` alanları silinebilir
- **Hedef faz:** 11.3

---

### 2. `step_youtube_upload.py`

**Durum:** `DEPRECATED` — pipeline'a bağlı değil, dosya historical reference için korunuyor

**Ne değişti (Faz 11.2C):**
- `standard_video/pipeline.py`'den import ve `PipelineStepDef` kaydı kaldırıldı
- Fonksiyonun başına erken-dönüş + deprecation warning eklendi
- Normal akışta artık hiçbir zaman çağrılmaz
- Eski test coverage (19 test) hâlâ korunuyor (regresyon izleme)

**Neden dosya korundu:**
1. `backend/tests/test_youtube_upload_step.py` — 19 kapsamlı test; silinirse coverage düşer
2. Eski `job_steps` kayıtlarında `key="youtube_upload"` olabilir — referans için

**Kaldırma koşulu:**
- `test_youtube_upload_step.py` testleri `step_publish` testlerine taşınınca
- Dosyanın kendisi ve test dosyası birlikte silinebilir
- **Hedef faz:** 11.3+

---

### 3. `PublishOrchestrator._mirror_youtube_compat()`

**Durum:** `COMPAT-ONLY` — yayın sonrası `Job.youtube_*` alanlarını günceller

**Neden tutuldu:** `Job.youtube_*` DB sütunları henüz silinmedi. Bu method sütunlar silinene kadar zararlı değil.

**Kaldırma koşulu:** `Job.youtube_*` DB sütunları kaldırılınca bu method da kaldırılır. Önce sütunlar, sonra method.

---

### 4. `jobStore.ts` — `onUploadProgress` SSE Handler

**Durum:** `DEPRECATED NO-OP` — artık hiçbir şey yapmıyor

**Ne değişti (Faz 11.2C):** Handler body boşaltıldı — gelen event varsa sessizce yoksayılır. `client.ts`'de `upload_progress` EventSource listener hâlâ var (zararlı değil).

**Kaldırma koşulu:** `client.ts`'den `upload_progress` listener kaldırılabilir, `SSEHandlers.onUploadProgress` tipi silinebilir. **Hedef faz:** 11.3.

---

### 5. `jobStore.ts` — `Job.youtube_*` Alanları

**Durum:** `@deprecated` TypeScript yorumu eklendi — aktif olarak kullanılmıyor

**Kaldırma koşulu:** Backend `Job.youtube_*` sütunları kaldırılınca bu tip alanları da silinebilir. Önce backend, sonra frontend.

---

## Faz 11.3'te Güvenle Kaldırılabilecekler

Aşağıdakiler Faz 11.3'te sırasıyla kaldırılabilir:

1. `PublishOrchestrator._mirror_youtube_compat()` kaldır
2. `backend/main.py` `_add_youtube_columns_if_missing()` kaldır (migration artık gereksiz)
3. SQLite migration: `ALTER TABLE jobs DROP COLUMN youtube_video_id` (+ diğer 5 alan)
4. `backend/models/job.py` — `youtube_*` Column tanımları kaldır
5. `jobStore.ts` — `Job` interface'inden `youtube_*` alanlar kaldır
6. `jobStore.ts` — `onUploadProgress` handler kaldır
7. `client.ts` — `SSEHandlers.onUploadProgress` + `upload_progress` listener kaldır
8. `backend/pipeline/steps/youtube_upload.py` — dosya sil
9. `backend/tests/test_youtube_upload_step.py` — dosya sil (test coverage taşındıktan sonra)

**Önkoşul:** Tüm aktif production job'ların `job_steps` tablosunda `youtube_upload` key'ine sahip satır kalmamış olmalı.

---

## Aktif Publishing Hub Akışı (Faz 11.2C Sonrası)

```
Pipeline çalışır
  └── step_publish (order=6, is_fatal=False)
        ├── publish_to_youtube=true → YouTubeAdapter.publish()
        │     └── PublishOrchestrator.publish_job()
        │           ├── JobPublishTarget oluştur/güncelle
        │           ├── PublishAttempt kaydı oluştur
        │           └── _mirror_youtube_compat() [compat-only]
        └── publish_to_youtube=false → tüm platformlar atlanır

Frontend
  └── JobDetail mount → fetchPublishTargets(jobId)
        └── GET /api/jobs/{id}/publish-targets
              └── PublishHubCard renders JobPublishTarget[]
                    ├── status, external_url, error_message
                    ├── retry butonu → POST /api/publish-targets/{id}/retry
                    └── girişim geçmişi → PublishAttempt[]
```
