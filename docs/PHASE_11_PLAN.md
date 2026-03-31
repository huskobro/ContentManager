# Faz 11 — Channel Hub (YouTube Publishing)

**Durum:** 11.1 ✅ | 11.2 ✅ | 11.1A ✅ Publishing Hub Temel Altyapı | 11.2B ✅ Frontend Geçişi + API | 11.2C ✅ Compat Temizlik | 11.3 ✅ Publishing Hub Frontend | 11.4–11.5 Backlog
**Ön koşul:** Faz 10 save standardizasyonu kapandı (2026-03-31)
**Hedef:** Üretilen videoları doğrudan YouTube kanallarına yükleyebilmek;
kanal yönetimi, upload kuyruğu ve yayın durumu izleme.

---

## Save Standard Guardrails

Faz 11'de eklenecek her yeni ekran ve bileşen şu kuralları zorunlu olarak uygulamalı:

### Alan Türü → Save Davranışı (değiştirilemez standart)

| Alan Türü | Standart | Hook |
|---|---|---|
| Toggle, Switch, Checkbox | **Anında kayıt** (`triggerSave`) | `useAutoSave` |
| Select, Radio | **Anında kayıt** (`triggerSave`) | `useAutoSave` |
| Text, Textarea, Number, Password | **800ms debounce + blur flush** | `useAutoSave.onChangeTrigger` + `onBlurTrigger` |
| CRUD formu (create/update/delete) | **Manuel Kaydet butonu** + toast | doğrudan fetch |
| Multiselect / Array | **Manuel Kaydet butonu** | doğrudan fetch |

### Toast Standardı

- Auto-save yüzeylerinde: toast yok → `saveState` inline gösterilir
- CRUD işlemlerinde: her olay için 1 toast (success/error/info)
- Hata mesajı: backend `detail` alanından, fallback HTTP status
- Referans: `docs/TOAST_EVENTS_MAP.md`

### Auto-Save Toggle

- `uiStore.autoSaveEnabled` tek kaynak
- Her yeni ayar sayfası başlığına "Otomatik kayıt" toggle butonu eklenmeli
- Toggle sadece `useAutoSave` kullanan yüzeyleri etkiler; CRUD formları etkilenmez

### Kontrol Listesi (yeni ekran eklerken)

- [ ] `useAutoSave` import edildi mi?
- [ ] Toggle/select alanlar `triggerSave` kullanıyor mu?
- [ ] Text/number alanlar `onChangeTrigger` + `onBlurTrigger` kullanıyor mu?
- [ ] `shouldAutoSave=false` durumunda manuel Kaydet butonu var mı?
- [ ] CRUD işlemleri sonrası toast var mı?
- [ ] Hata durumunda toast `type: "error"` kullanıyor mu?
- [ ] Optimistic update varsa rollback mekanizması var mı? (BST-001 fix'i bekleniyor)
- [ ] `tsc --noEmit` temiz mi?
- [ ] Yeni yüzey için en az 1 save behavior testi yazıldı mı?

---

## Faz 11 Kapsam

### 11.1 — YouTube OAuth ve Kanal Bağlantısı

- Google OAuth 2.0 flow (backend token yönetimi)
- Kanal bağlama: `youtube_channels` DB tablosu (`channel_id`, `name`, `access_token`, `refresh_token`, `expires_at`)
- Admin UI: `/admin/channels` — kanal listesi, bağla/çıkar, varsayılan kanal seç
- Token yenileme: pipeline öncesi otomatik refresh
- PIN koruması: kanal yönetimi admin-only

### 11.2 — Upload Pipeline Adımı

- `step_upload` — mevcut pipeline'a yeni adım olarak eklenir (composition sonrası)
- Upload: `googleapiclient` ile `youtube.videos().insert()`
- Metadata: `step_metadata` çıktısından `title`, `description`, `tags`, `category`
- Privacy: `youtubePrivacy` user setting'den (`private` / `unlisted` / `public`)
- Upload progress: SSE üzerinden frontend'e `upload_progress` eventi
- Hata yönetimi: quota exceeded, auth error, file not found — her biri ayrı job error kodu

### 11.3 — Upload Kuyruğu ve Durum

- `Job` modeline `youtube_video_id`, `youtube_upload_status`, `youtube_url` alanları
- JobList ve JobDetail'e upload durumu göstergesi
- Başarılı upload: direkt YouTube linki job detail'de
- Admin Dashboard: upload istatistikleri (uploaded today / failed / pending)

### 11.4 — Channel Hub UI (User)

- `/channels` sayfası (user): bağlı kanallar, varsayılan seçim
- `CreateVideo` formuna "Bu videoyu yükle" checkbox (publish_to_youtube)
- Upload sonrası: otomatik YouTube URL gösterimi + kopyalama butonu

### 11.5 — Quota Yönetimi ve Rate Limiting

- YouTube API günlük quota takibi
- Quota aşılınca: upload kuyruğa alınır, sırada bekler
- Admin paneli: kota durumu göstergesi

---

## Implementation Sırası

```
11.1 → 11.2 → 11.3 → 11.4 → 11.5
```

Her adım bir önceki tamamlanmadan başlamaz. 11.2 pipeline entegrasyonu kritik yol.

---

## First Implementation Target

**11.1 — YouTube OAuth ve Kanal Bağlantısı**

Neden önce bu:
- Upload adımı token olmadan yazılamaz
- DB schema en başta kurulmalı
- Admin UI basit CRUD — save standardına uymak kolay
- OAuth flow backend-only, frontend'e sadece "Bağla" butonu

**İlk commit hedefi:**
1. `backend/models/youtube_channel.py` — DB modeli
2. `backend/api/youtube.py` — OAuth callback + token refresh + CRUD endpoints
3. `frontend/src/pages/admin/ChannelManager.tsx` — kanal listesi + bağla butonu
4. `frontend/src/App.tsx` — `/admin/channels` route + Sidebar nav

---

## Blockers

**Yok** — Teknik ön koşullar karşılandı:
- Pipeline altyapısı mevcut (step sistemi)
- SSE hub mevcut (upload_progress eventi eklenebilir)
- Settings sistemi mevcut (youtubePrivacy zaten tanımlı)
- Admin PIN sistemi mevcut
- Test altyapısı mevcut

**Gereksinim:**
- Google OAuth Client ID + Secret (`.env`'e `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- YouTube Data API v3 etkin Google Cloud projesi
- Bunu sağlamak kullanıcıya ait — başlamadan önce confirm edilmeli

---

## Backlog ile İlişki

BST-001 (optimistic rollback) Faz 11'de yeni kanal toggle eklenirse aynı
riski taşır. **11.1 implementation sırasında BST-001 fix'i önce yapılması önerilir.**
