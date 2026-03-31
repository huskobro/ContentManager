# YouTube-First → Adapter Migrasyonu

**Faz:** 11.1A
**Tarih:** 2026-03-31

---

## Mevcut YouTubeChannel → PlatformAccount Geçiş Yolu

### Geçiş Dönemi (şu an)

İki model birlikte var:
- `YouTubeChannel` → OAuth flow ve `youtube.py` API endpoint'leri
- `PlatformAccount` → Publishing Hub'ın yeni kaynağı

### Lazy Migration

`step_publish` (order=7) çalıştığında:
1. `PlatformAccount` tablosunda `platform=youtube AND is_default=True AND is_active=True` arar
2. Yoksa `_youtube_channel_bridge(db)` çağrılır
3. `YouTubeChannel` tablosunda aktif+varsayılan kanal aranır
4. Bulunursa `PlatformAccount` satırı oluşturulur (credentials_json ile)
5. Sonraki çağrılarda 1. adımda direkt bulunur

### Mevcut Alanlar → Yeni Alanlar

| YouTubeChannel | PlatformAccount.credentials_json | PlatformAccount |
|---|---|---|
| `access_token` | `credentials_json.access_token` | — |
| `refresh_token` | `credentials_json.refresh_token` | — |
| `token_expiry` | `credentials_json.token_expiry` | — |
| `channel_id` | — | `external_account_id` |
| `channel_name` | — | `account_name` |
| `is_active` | — | `is_active` |
| `is_default` | — | `is_default` |

---

## youtube_upload_service.py → YouTubeAdapter

### Mevcut Durum

```
pipeline/steps/youtube_upload.py
        └── youtube_upload_service.py (doğrudan çağrı)
```

### Hedef (Faz 11.1A sonrası)

```
pipeline/steps/publish.py
        └── publishing/orchestrator.py
                └── publishing/adapters/youtube_adapter.py
                        └── youtube_upload_service.py (delege)
```

### `youtube_upload_service.py` Değişmeden Kalır

`youtube_upload_service.py` dosyasında **sıfır satır değiştirilmedi**.
`YouTubeAdapter.publish()` içinde lazy import ile çağrılır:

```python
# youtube_adapter.py içinde
from backend.services.youtube_upload_service import (
    YtUploadError,
    refresh_channel_token,
    upload_video_async,
)
```

### _ChannelProxy: Sıfır Değişiklikle Uyumluluk

`youtube_upload_service.py`, `YouTubeChannel` ORM arayüzünü (`.access_token`, `.refresh_token`, `.token_expiry` setter'ları) bekler.

`_ChannelProxy`, `PlatformAccount.credentials_json` üzerinde bu arayüzü duck-type olarak sunar:

```python
proxy = _ChannelProxy(platform_account)
proxy.access_token    # credentials_json["access_token"]
proxy.access_token = "yeni" # → credentials_json güncellenir
```

Servis kodu değiştirilmeden `PlatformAccount` nesneleri ile çalışır.

---

## Job.youtube_* Compat Alanları

### Neden Silmiyoruz?

`JobDetail.tsx` `YoutubeUploadCard` bileşeni şu alanları okur:
- `job.youtube_video_id`
- `job.youtube_upload_status`
- `job.youtube_video_url`
- `job.youtube_error_code`
- `job.youtube_uploaded_at`

Frontend refactor olmadan bu alanları kaldıramayız.

### Nasıl Senkronize Tutulur?

`PublishOrchestrator._mirror_youtube_compat()`:

```python
# Her başarılı YouTube publish'te:
job.youtube_video_id = external_id
job.youtube_upload_status = "completed"
job.youtube_video_url = external_url
job.youtube_channel_id = account.external_account_id
job.youtube_uploaded_at = utcnow()

# Her başarısız YouTube publish'te:
job.youtube_upload_status = "failed"
job.youtube_error_code = exc.code
```

**Kaynak değişti:** Artık `JobPublishTarget` ana veri kaynağı, `Job.youtube_*` compat.
Faz 11.2B'de frontend `JobPublishTarget` API'den okumaya başlayınca `Job.youtube_*` tamamen kaldırılabilir.

---

## Hata Kodu Dönüşümü

| youtube_upload_service | YouTubeAdapter | PublishOrchestrator |
|---|---|---|
| `YtUploadError(code, msg)` | → `PublishError(code, msg)` | kod korunur |

`YT_*` hata kodları `PublishError.code` olarak taşınır.
`PublishAttempt.error_message` = `str(exc)` = `[YT_QUOTA_EXCEEDED] Quota exceeded`

---

## Geçiş Tamamlanma Kriterleri

- [x] Tüm aktif `YouTubeChannel` kayıtları için `PlatformAccount` oluşturulmuş (lazy migration — Faz 11.1A)
- [x] Frontend `JobDetail.tsx` `JobPublishTarget` API'sinden okumaya geçti (Faz 11.2B — `PublishHubCard`)
- [x] `step_youtube_upload` (order=6) pipeline'dan kaldırıldı (Faz 11.2C — deprecated compat-only)
- [x] `YoutubeUploadCard` frontend'den kaldırıldı (Faz 11.2C)
- [ ] `Job.youtube_*` sütunları kaldırıldı (backlog — Faz 11.3)
- [x] Tüm testler başarılı (210 geçti — Faz 11.2C)
