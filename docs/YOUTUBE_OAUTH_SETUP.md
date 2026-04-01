# YouTube OAuth Kurulum Kılavuzu

> Son güncelleme: 2026-04-01 (Round 2 — admin panel config UI eklendi)

Bu belge, ContentManager'da YouTube kanalı bağlama özelliğini aktif etmek için gereken Google Cloud Console ve `.env` yapılandırmalarını açıklar.

---

## Gereksinim: Google Cloud Project & OAuth Client

### 1. Google Cloud Console'da OAuth Client Oluştur

1. https://console.cloud.google.com/ adresine git
2. Proje seç veya yeni proje oluştur
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. **Authorized redirect URIs** kısmına şunu ekle:
   ```
   http://localhost:8000/api/youtube/oauth/callback
   ```
   > ⚠️ Bu URI **tam eşleşme** gerektirir. Trailing slash, http/https farkı veya port farkı `redirect_uri_mismatch` hatasına yol açar.

6. **YouTube Data API v3** etkinleştir:
   - APIs & Services → Library → "YouTube Data API v3" → Enable

---

## Yapılandırma: .env Dosyası

`.env` dosyasına aşağıdaki değerleri gir:

```env
# Google OAuth 2.0 — YouTube kanalı bağlama için
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
YOUTUBE_OAUTH_REDIRECT_URI=http://localhost:8000/api/youtube/oauth/callback

# Frontend URL — OAuth callback sonrası redirect hedefi
FRONTEND_URL=http://localhost:5173
```

> `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` da kullanılabilir (alias olarak).
> `GOOGLE_CLIENT_ID` önceliği daha yüksektir.

---

## Konfigürasyon Nerede Okunuyor?

```
.env
  └── backend/config.py (Settings modeli)
        ├── google_client_id       → GOOGLE_CLIENT_ID
        ├── google_client_secret   → GOOGLE_CLIENT_SECRET
        ├── youtube_oauth_redirect_uri → YOUTUBE_OAUTH_REDIRECT_URI
        └── frontend_url           → FRONTEND_URL

backend/api/youtube.py
  ├── _get_oauth_client_id()    → google_client_id || youtube_client_id
  ├── _get_oauth_client_secret() → google_client_secret || youtube_client_secret
  ├── _build_flow()             → redirect_uri = app_settings.youtube_oauth_redirect_uri
  └── oauth_callback()          → frontend_base = app_settings.frontend_url.rstrip("/")
```

**Secret güvenliği:** `client_secret` ve `access_token`/`refresh_token` hiçbir zaman frontend API response'larına dönmez. `ChannelResponse` Pydantic şeması bu alanları içermez.

---

## OAuth Akışı (Faz 11.3 Sonrası)

```
Kullanıcı: Platform Hesapları → "Kanal Bağla" tıkla
  ↓
PlatformAccountManager.handleConnectYouTube()
  → GET /api/youtube/oauth/url?redirect=/admin/platform-accounts (X-Admin-Pin header)
  → Backend: state token üretir, _OAUTH_STATE_STORE[state] = {pin, redirect} kaydeder
  → auth_url döner (prompt=select_account → hesap seçim ekranı)
  ↓
Frontend: popup window açar → Google hesap seçimi
  ↓
Google: http://localhost:8000/api/youtube/oauth/callback?code=...&state=...
  → Backend: state doğrula, token al, kanal bilgisi çek, YouTubeChannel upsert
  → RedirectResponse: http://localhost:5173/admin/platform-accounts?oauth_success=1
  ↓
Popup kapanır → PlatformAccountManager loadAccounts() çağrılır
  → toast: "Kanal bağlandı"
```

### Eski akış (kaldırıldı / internal):
- Eskiden "Kanal Bağla" → `/admin/channels` → ChannelManager → oradan tekrar OAuth başlatma
- Bu iki aşamalı yönlendirme kaldırıldı. `/admin/channels` route'u korunuyor (internal/compat).

---

## Redirect URI Mismatch Hatası

**Hata:** `Hata 400: redirect_uri_mismatch`

**Neden olur:**
- Google Cloud Console'daki URI ile backend'in ürettiği URI tam eşleşmiyor
- Yaygın nedenler:
  - `http` yerine `https` veya tam tersi
  - Port farkı (8000 vs 8001 vs başka)
  - Trailing slash farkı (`/callback` vs `/callback/`)
  - Farklı path (`/api/youtube/callback` vs `/api/youtube/oauth/callback`)

**Kontrol:**
- Backend'in kullandığı URI: `.env` → `YOUTUBE_OAUTH_REDIRECT_URI`
- Google Cloud Console: OAuth 2.0 Client → Authorized redirect URIs

Her ikisi **birebir aynı** olmalı.

---

## OAuth Durumu Kontrolü

```
GET /api/youtube/oauth/status  (X-Admin-Pin gerekli)
```

Yanıt:
```json
{
  "configured": true,
  "client_id_hint": "1041521064724-...",
  "redirect_uri": "http://localhost:8000/api/youtube/oauth/callback",
  "scopes": ["https://www.googleapis.com/auth/youtube.upload", ...]
}
```

`configured: false` dönüyorsa `.env` dosyasında `GOOGLE_CLIENT_ID` eksik demektir.
