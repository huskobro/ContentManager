# Publishing Hub Mimarisi

**Faz:** 11.1A
**Tarih:** 2026-03-31
**Durum:** Temel altyapı tamamlandı — YouTube çalışıyor, diğer platformlar hazır bekliyor

---

## Özet

Publishing Hub, ContentManager'ın video üretim pipeline'ına bağlı,
platform-agnostik bir yayın katmanıdır. Tek platform (YouTube) etrafında
şekillenmiş dar mimarinin yerine aşağıdaki genişletilebilir yapıyı sunar.

---

## Katmanlar

```
pipeline/steps/publish.py          ← Pipeline entegrasyon noktası (order=7)
        │
        ▼
publishing/orchestrator.py         ← Merkez koordinatör + adapter registry
        │
        ├── publishing/adapters/youtube_adapter.py  ← YouTube
        ├── publishing/adapters/tiktok_adapter.py   ← (gelecek)
        ├── publishing/adapters/instagram_adapter.py ← (gelecek)
        └── publishing/adapters/facebook_adapter.py  ← (gelecek)
                │
                ▼
        backend/services/youtube_upload_service.py  ← Mevcut, korunur
```

---

## Veri Modeli

### PlatformAccount (`platform_accounts` tablosu)

| Alan | Tür | Açıklama |
|---|---|---|
| id | Integer PK | Otomatik artan |
| platform | String(32) | "youtube" \| "tiktok" \| "instagram" \| "facebook" |
| account_name | String(256) | İnsan okunabilir görünen ad |
| external_account_id | String(128) | Platform tarafından atanan ID (YouTube: UCxxxxxx) |
| credentials_json | Text | JSON: {access_token, refresh_token, token_expiry, ...} |
| is_active | Boolean | Bağlantı aktif mi |
| is_default | Boolean | Platform başına tek varsayılan |
| created_at | String(64) | ISO-8601 UTC |
| updated_at | String(64) | ISO-8601 UTC |

**Not:** `YouTubeChannel` tablosu korunur. `_youtube_channel_bridge()` gerektiğinde otomatik `PlatformAccount` satırı oluşturur (lazy migration).

### JobPublishTarget (`job_publish_targets` tablosu)

| Alan | Tür | Açıklama |
|---|---|---|
| id | String(32) UUID | |
| job_id | String(32) FK→jobs | CASCADE DELETE |
| platform_account_id | Integer FK→platform_accounts | SET NULL on delete |
| platform | String(32) | Platform adı |
| publish_type | String(32) | "video" \| "short" \| "reel" \| "story" \| "post" |
| content_type | String(64) | "standard_video" \| "news_bulletin" \| "product_review" |
| status | String(32) | pending \| publishing \| published \| failed \| skipped |
| privacy_status | String(32) | private \| unlisted \| public |
| scheduled_publish_time | String(64) | ISO-8601 (gelecek: planlı yayın) |
| external_object_id | String(128) | Platform tarafından atanan içerik ID'si |
| external_url | String(512) | Yayınlanan içeriğin tam URL'si |
| error_message | Text | Hata detayı |
| attempts_count | Integer | Girişim sayısı |
| last_attempt_at | String(64) | Son girişim zamanı |
| created_at | String(64) | |
| updated_at | String(64) | |

### PublishAttempt (`publish_attempts` tablosu)

| Alan | Tür | Açıklama |
|---|---|---|
| id | String(32) UUID | |
| publish_target_id | String(32) FK→job_publish_targets | CASCADE DELETE |
| status | String(32) | pending \| success \| failed \| cancelled |
| action_type | String(32) | publish \| retry \| cancel |
| request_payload_snapshot | Text | JSON (token içermez) |
| response_payload_snapshot | Text | JSON |
| error_message | Text | |
| started_at | String(64) | ISO-8601 |
| finished_at | String(64) | ISO-8601 |
| created_at | String(64) | |

---

## Adapter Sözleşmesi

```python
class BasePublishAdapter(ABC):
    platform: str = ""

    async def publish(
        self,
        target: JobPublishTarget,
        account: PlatformAccount,
        video_path: str,
        metadata: dict,
        privacy: str,
        progress_callback: Callable,
    ) -> str:  # external_object_id döner
        ...

    async def get_status(self, target, account) -> str:
        # "processing" | "published" | "failed" | "unknown"
        ...

    def health_check(self) -> bool: ...
```

---

## Adapter Registry

Yeni platform eklemek için:

```python
# backend/publishing/orchestrator.py — dosya sonuna ekle
from backend.publishing.adapters.tiktok_adapter import TikTokAdapter
register_adapter("tiktok", TikTokAdapter)
```

Ve `standard_video/pipeline.py` config'e `publish_to_tiktok: false` eklenir.

---

## SSE Olayları

| Event | Payload |
|---|---|
| `publish_progress` | `{job_id, platform, phase, percent?, external_id?, error_code?, timestamp}` |

Phase değerleri: `preparing` → `uploading` → `completed` \| `failed`

Mevcut `upload_progress` eventi (youtube_upload step order=6) korunur.

---

## Pipeline Entegrasyonu

```
order=6  youtube_upload  (eski, korunur)
order=7  publish          (yeni, Publishing Hub)
```

`publish` (order=7) `JobPublishTarget.status == "published"` kontrolü yapar.
`youtube_upload` (order=6) başarılı olduysa `Job.youtube_video_id` set edilir.
`publish` (order=7) `JobPublishTarget`'ta "published" durumu görür ve atlar.
Çift yükleme olmaz.

---

## Geriye Dönük Uyumluluk

| Eski | Yeni | Durum |
|---|---|---|
| `Job.youtube_*` alanları | `JobPublishTarget` | Compat: her iki kaynaktan okunabilir |
| `YouTubeChannel` tablosu | `PlatformAccount` | Korunur, bridge ile dönüştürülür |
| `youtube_upload_service.py` | `youtube_adapter.py` içinden çağrılır | Korunur |
| `step_youtube_upload` (order=6) | `step_publish` (order=7) | İkisi birlikte çalışır |
| `YoutubeUploadCard` (frontend) | `Job.youtube_*` compat alanlarda çalışır | Kırılmaz |

---

## Gelecek Fazlar (11.2B ve sonrası)

- `step_youtube_upload` (order=6) pipeline'dan kaldırılır, yalnızca `step_publish` kalır
- Frontend `JobDetail.tsx` → `JobPublishTarget` listesini gösterir (çoklu platform)
- Planlı yayın: `scheduled_publish_time` ve kuyruk mantığı
- Retry UI: `PublishAttempt` geçmişi görüntülenebilir
- `/api/publish/` endpoint seti: hedef listele, yeniden dene, iptal
- TikTok, Instagram, Facebook adapter'ları
