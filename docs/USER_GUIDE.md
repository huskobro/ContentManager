# ContentManager — Kullanıcı Rehberi

> Son güncelleme: 2026-03-29 · Versiyon: v0.1.0

## İçindekiler

- [Kurulum](#kurulum)
- [İlk Çalıştırma](#ilk-çalıştırma)
- [Arayüz Genel Bakış](#arayüz-genel-bakış)
- [Kullanıcı Arayüzü](#kullanıcı-arayüzü)
- [Admin Paneli](#admin-paneli)
- [Tema Değiştirme](#tema-değiştirme)
- [SSS](#sss)

---

## Kurulum

### Gereksinimler

| Yazılım | Minimum Versiyon | Amaç |
|---------|-----------------|------|
| Python | 3.11+ | Backend (FastAPI) |
| Node.js | 18+ | Frontend (Vite + React) ve Remotion |
| FFmpeg | 6.0+ | Video işleme ve Remotion rendering |
| Git | 2.x | Kaynak kod yönetimi |

### Adım Adım Kurulum

```bash
# 1. Projeyi klonla
cd ~/Projects
git clone <repo-url> ContentManager
cd ContentManager

# 2. Backend ortamını kur
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. Ortam değişkenlerini hazırla
cp .env.example .env
# .env dosyasını düzenleyerek API anahtarlarını gir

# 4. Frontend bağımlılıklarını kur
cd frontend && npm install && cd ..

# 5. Remotion bağımlılıklarını kur
cd remotion && npm install && cd ..
```

### API Anahtarları

Minimum çalışma için gerekli olan anahtarlar:

| Anahtar | Provider | Zorunlu mu? | Açıklama |
|---------|----------|:-----------:|----------|
| `GEMINI_API_KEY` veya `KIEAI_API_KEY` | Google Gemini / kie.ai | Evet | Senaryo ve metadata üretimi için |
| `PEXELS_API_KEY` | Pexels | Evet | Stok görsel/video indirme |
| `ELEVENLABS_API_KEY` | ElevenLabs | Hayır | Ücretli TTS (Edge TTS ücretsiz alternatif) |
| `OPENAI_API_KEY` | OpenAI | Hayır | Whisper altyazı senkronizasyonu + GPT fallback |

---

## İlk Çalıştırma

```bash
# Terminal 1 — Backend
source .venv/bin/activate
python -m backend.main

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Tarayıcınızda `http://localhost:5173` adresine gidin. Dashboard sayfası açılacaktır.

Backend sağlık kontrolü: `http://localhost:8000/health` → `{"status": "ok"}` görmelisiniz.

---

## Arayüz Genel Bakış

ContentManager iki ayrı arayüz modu sunar:

### Kullanıcı Arayüzü (Varsayılan)
Günlük video üretimi için basitleştirilmiş deneyim. Uygulama açıldığında bu mod aktiftir.

### Admin Paneli
Sistem ayarları, provider yönetimi, modül konfigürasyonu ve maliyet takibi. Sol menü altındaki "Admin Paneli" bağlantısından veya Header'daki kilit ikonundan erişilir; PIN ile korunur.

---

## Kullanıcı Arayüzü

### Menü Yapısı (Sol Sidebar)

| Menü Öğesi | Yol | Açıklama |
|------------|-----|----------|
| Dashboard | `/dashboard` | Özet istatistikler, sistem durumu, hızlı eylemler |
| Video Oluştur | `/create` | Yeni video pipeline başlatma formu (Faz 3'te aktif) |
| İşler | `/jobs` | Aktif ve tamamlanan işlerin listesi (Faz 3'te aktif) |
| Ayarlar | `/settings` | Kullanıcı video varsayımları (Faz 3'te aktif) |

### Dashboard Sayfası

Dashboard, sisteme ilk girişte açılan ana sayfadır.

**Özet Kartları:**
- **Aktif İşler** — şu an pipeline'da çalışan iş sayısı
- **Tamamlanan** — başarıyla biten iş sayısı
- **Başarısız** — hata ile sonlanan iş sayısı
- **Toplam** — tüm işlerin sayısı

**Sistem Durumu:**
- API bağlantı durumu (yeşil / kırmızı)
- Veritabanı WAL modu doğrulaması
- Ortam bilgisi (development / production)

**Hızlı Başlat:**
- "Standart Video" — doğrudan video oluşturma formuna yönlendirir
- "İşleri Görüntüle" — iş listesi sayfasına yönlendirir

---

## Admin Paneli

Admin paneline erişmek için:
1. Sol menüdeki "Admin Paneli" bağlantısına tıklayın
2. Veya Header'daki 🔑 "Admin" butonuna tıklayın
3. PIN giriş modalında PIN kodunuzu girin (varsayılan: `0000`)
4. Başarılı girişte admin menüsü açılır

**Önemli:** Admin PIN'ini `.env` dosyasında mutlaka değiştirin (`ADMIN_PIN=xxxx`).

### Admin Menü Yapısı

| Menü Öğesi | Yol | Açıklama |
|------------|-----|----------|
| Admin Dashboard | `/admin/dashboard` | Yönetim özeti ve hızlı erişim kartları |
| Modül Yönetimi | `/admin/modules` | Modülleri etkinleştir/devre dışı bırak (Faz 4) |
| Provider Yönetimi | `/admin/providers` | API anahtarları, fallback sırası (Faz 4) |
| Global Ayarlar | `/admin/global-settings` | Sistem geneli varsayımlar (Faz 4) |
| Maliyet Takibi | `/admin/cost-tracker` | API kullanım raporları (Faz 4) |
| Tüm İşler | `/admin/jobs` | Admin seviyesinde tüm iş yönetimi (Faz 4) |

Kilitleme: Header'daki "Kilitle" butonuna tıklayarak admin oturumunu sonlandırabilirsiniz.

---

## Tema Değiştirme

- Uygulama varsayılan olarak **koyu tema (Dark Mode)** ile açılır.
- Header sağ üst köşedeki ☀️/🌙 ikonuna tıklayarak tema değiştirilir.
- Tema tercihi tarayıcıda saklanır; sonraki açılışlarda korunur.

---

## SSS

**S: Backend çalışmıyor, Dashboard'da "Backend bağlantısı kurulamadı" görüyorum.**
C: `python -m backend.main` komutunun hatasız çalıştığını ve 8000 portunda dinlediğini kontrol edin. `/health` endpoint'ini `curl http://localhost:8000/health` ile test edin.

**S: Admin PIN'imi unuttum.**
C: `.env` dosyasındaki `ADMIN_PIN` değerini yeni bir PIN ile değiştirin ve backend'i yeniden başlatın.

**S: Sidebar mobilde görünmüyor.**
C: Sol üstteki hamburger menü (☰) ikonuna tıklayın. Sidebar açılır panel olarak görünecektir.

---

*Bu doküman her yeni özellik eklenmesinde güncellenir. Son değişiklikler için [CHANGELOG](./CHANGELOG.md)'a bakın.*
