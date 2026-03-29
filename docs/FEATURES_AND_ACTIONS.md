# ContentManager — Özellik ve Ekran İşlev Dokümanı

> Son güncelleme: 2026-03-29 · Versiyon: v0.1.0

Bu doküman, her sayfanın, her bileşenin, her butonun ve her ayarın ne yaptığını tanımlar.

---

## Genel Arayüz Bileşenleri

### AppShell (`components/layout/AppShell.tsx`)

| Öğe | Davranış |
|-----|----------|
| Yerleşim | Sol sidebar + üst header + orta içerik alanı (`<Outlet />`) |
| Responsive | Sidebar genişliğine göre içerik alanı sol margin değiştirilir. Mobilde sidebar off-canvas, masaüstünde sabit. |
| Mode prop | `"user"` → kullanıcı navigasyonu, `"admin"` → admin navigasyonu |

### Sidebar (`components/layout/Sidebar.tsx`)

| Öğe | Davranış |
|-----|----------|
| Logo ("CM") | Tıklanınca modun ana sayfasına yönlendirir (user → `/dashboard`, admin → `/admin/dashboard`) |
| Navigasyon linkleri | `NavLink` ile aktif sayfa vurgulanır (mavi arka plan). Daraltılmış modda sadece ikon gösterilir. |
| Daralt/Genişlet butonu | Masaüstünde sidebar genişliğini 220px ↔ 60px arasında geçirir. Tercih `localStorage`'da saklanır. |
| Mobil overlay | Mobilde sidebar dışına tıklanınca sidebar kapanır (yarı saydam siyah backdrop). |
| Admin geçiş bağlantısı | User modunda sidebar altında "Admin Paneli" bağlantısı gösterilir (shield ikonu ile). |
| Mod etiketi | Daraltılmamış durumda "İçerik Üretimi" veya "Admin Paneli" yazısı üstte gösterilir. |

**User Modu Menü Öğeleri:**

| Öğe | İkon | Yol | Açıklama |
|-----|------|-----|----------|
| Dashboard | LayoutDashboard | `/dashboard` | Özet istatistikler ve sistem durumu |
| Video Oluştur | PlusCircle | `/create` | Yeni video pipeline başlatma |
| İşler | ListVideo | `/jobs` | Aktif ve geçmiş iş listesi |
| Ayarlar | Settings | `/settings` | Kullanıcı video varsayımları |

**Admin Modu Menü Öğeleri:**

| Öğe | İkon | Yol | Açıklama |
|-----|------|-----|----------|
| Admin Dashboard | LayoutDashboard | `/admin/dashboard` | Yönetim özeti |
| Modül Yönetimi | Boxes | `/admin/modules` | Modül açma/kapama |
| Provider Yönetimi | Plug | `/admin/providers` | API ve fallback |
| Global Ayarlar | Sliders | `/admin/global-settings` | Sistem varsayımları |
| Maliyet Takibi | BarChart3 | `/admin/cost-tracker` | Harcama raporu |
| Tüm İşler | ListVideo | `/admin/jobs` | Admin iş yönetimi |

### Header (`components/layout/Header.tsx`)

| Öğe | İkon | Konum | Davranış |
|-----|------|-------|----------|
| Hamburger menü | Menu | Sol (yalnızca mobil) | `mobileSidebarOpen` state'ini `true` yapar |
| Sayfa başlığı | — | Orta | Aktif rota'ya göre `PAGE_TITLES` eşleştirmesinden alınır |
| Admin modu etiketi | ShieldCheck | Orta alt | Admin modunda sarı renkli "Admin Modu" yazısı |
| Tema butonu | Sun / Moon | Sağ | Dark ↔ Light geçişi; `uiStore.toggleTheme()` çağrısı; `localStorage` ve `<html class>` güncellenir |
| Admin giriş butonu | KeyRound | Sağ (user modda) | PIN giriş modalını açar |
| Admin kilitle butonu | ShieldOff | Sağ (admin modda) | Admin oturumunu sonlandırır, `/dashboard`'a yönlendirir |

**Admin PIN Modalı:**

| Öğe | Davranış |
|-----|----------|
| PIN input | `type="password"`, `inputMode="numeric"`, max 8 karakter, ortalanmış tracking |
| Hatalı PIN | Input bordürü kırmızıya döner, "Hatalı PIN" mesajı gösterilir, input temizlenir |
| İptal butonu | Modalı kapatır, state'i sıfırlar |
| Giriş butonu | PIN doğrulanırsa `adminUnlocked = true` yapılır, `/admin/dashboard`'a yönlendirilir |
| Dış tıklama | Modalı kapatmaz (bilinçli karar — güvenlik) |

---

## Sayfa Bazlı İşlevler

### Dashboard (`pages/user/Dashboard.tsx`)

| Bileşen | Veri Kaynağı | İşlev |
|---------|-------------|-------|
| StatCard: Aktif İşler | `jobStore.getActiveJobs().length` | `queued` veya `running` statüsündeki iş sayısı |
| StatCard: Tamamlanan | `jobStore.getCompletedJobs()` filtrelenmiş | `completed` statüsündeki iş sayısı |
| StatCard: Başarısız | `jobStore.getCompletedJobs()` filtrelenmiş | `failed` statüsündeki iş sayısı |
| StatCard: Toplam | aktif + tamamlanan | Tüm işlerin sayısı |
| Sistem Durumu | `GET /health` (sayfa mount'unda) | API, veritabanı ve ortam durumunu renkli badge'lerle gösterir |
| Hızlı Başlat: Standart Video | — | `/create` sayfasına yönlendirir |
| Hızlı Başlat: İşleri Görüntüle | — | `/jobs` sayfasına yönlendirir |

### CreateVideo (`pages/user/CreateVideo.tsx`)

**Mevcut durum (Faz 1):** Bilgi ekranı — modül seçimi ve topic girişi Faz 3'te eklenecek.

### JobList (`pages/user/JobList.tsx`)

**Mevcut durum (Faz 1):** Bilgi ekranı — SSE tabanlı canlı liste Faz 3'te eklenecek.

### UserSettings (`pages/user/UserSettings.tsx`)

**Mevcut durum (Faz 1):** Bilgi ekranı — kullanıcı override formu Faz 3'te eklenecek.

### AdminDashboard (`pages/admin/AdminDashboard.tsx`)

| Bileşen | İşlev |
|---------|-------|
| Uyarı banner | "Admin modundasınız" bilgi mesajı (amber tonlu) |
| Modül Yönetimi kartı | `/admin/modules` sayfasına yönlendirir |
| Provider Yönetimi kartı | `/admin/providers` sayfasına yönlendirir |
| Global Ayarlar kartı | `/admin/global-settings` sayfasına yönlendirir |
| Maliyet Takibi kartı | `/admin/cost-tracker` sayfasına yönlendirir |

---

## State Yönetimi İşlevleri

### uiStore

| Fonksiyon | Tetikleyen | Etki |
|-----------|-----------|------|
| `toggleTheme()` | Header tema butonu | `<html>` class değişir, localStorage güncellenir |
| `toggleSidebar()` | Sidebar daralt butonu | Sidebar genişliği 220px ↔ 60px |
| `setMobileSidebarOpen(bool)` | Hamburger / overlay tıklama | Mobil sidebar açılır/kapanır |
| `unlockAdmin()` | PIN doğrulaması başarılı | `adminUnlocked = true` |
| `lockAdmin()` | Header kilitle butonu | `adminUnlocked = false` |
| `addToast(toast)` | Herhangi bir bileşen | Bildirim eklenir, `duration` ms sonra otomatik kalkar |
| `removeToast(id)` | Otomatik timer veya manuel | Bildirim kuyruğundan kaldırır |

### jobStore

| Fonksiyon | Açıklama |
|-----------|----------|
| `setJobs(jobs)` | Backend'den toplu yükleme |
| `upsertJob(job)` | Tekil iş ekleme veya güncelleme |
| `updateJobStatus(id, status, errorMessage?)` | İş durumu değişimi (SSE'den) |
| `updateStep(jobId, stepKey, update)` | Pipeline adım güncelleme (SSE'den) |
| `appendLog(jobId, entry)` | Log satırı ekleme (son 500 satır tutulur) |
| `setOutputPath(jobId, path)` | Final video çıktı yolu |
| `getActiveJobs()` | `queued` veya `running` durumundaki işler |
| `getCompletedJobs()` | `completed`, `failed` veya `cancelled` durumundaki işler |

### settingsStore

| Fonksiyon | Açıklama |
|-----------|----------|
| `setUserDefaults(partial)` | Birden fazla ayarı güncelle |
| `patchUserDefault(key, value)` | Tek ayar güncelle |
| `setLoaded(bool)` | Backend'den yükleme tamamlandı mı |

---

## API Client İşlevleri (`api/client.ts`)

| Fonksiyon | İmza | Açıklama |
|-----------|------|----------|
| `api.get<T>` | `(path, options?) → Promise<T>` | GET isteği |
| `api.post<T>` | `(path, body?, options?) → Promise<T>` | POST isteği |
| `api.put<T>` | `(path, body?, options?) → Promise<T>` | PUT isteği |
| `api.patch<T>` | `(path, body?, options?) → Promise<T>` | PATCH isteği |
| `api.delete<T>` | `(path, options?) → Promise<T>` | DELETE isteği |
| `openSSE` | `(path, onMessage, onError?) → () => void` | EventSource stream açar, cleanup fonksiyonu döner |
| `APIError` | `class extends Error { status, body }` | HTTP hata sınıfı |

`adminPin` options parametresi ile admin korumalı endpoint'lere `X-Admin-Pin` header'ı gönderilir.

---

*Bu doküman her yeni bileşen, buton veya ekran eklendiğinde güncellenir.*
