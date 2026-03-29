<div align="center">

# 🎬 ContentManager

**Modüler, localhost-first YouTube içerik üretim ve yönetim platformu**

&nbsp;

`Python 3.11+` &nbsp; `FastAPI` &nbsp; `React 18` &nbsp; `Remotion` &nbsp; `SQLite WAL` &nbsp; `TypeScript`

&nbsp;

</div>

---

## ✨ Özellikler

| | | |
|:--|:--|:--|
| 🎯 **6 Adımlı Pipeline** | 🔄 **Provider Fallback** | 📡 **SSE Canlı İzleme** |
| Script → Metadata → TTS → Visuals → Subtitles → Composition | LLM, TTS, Görsel provider'lar arası otomatik geçiş | Adım adım ilerleme ve log streaming |
| 🎨 **5 Altyazı Stili** | 🎬 **Remotion Video** | 📦 **3 İçerik Modülü** |
| Standard, Neon Blue, Gold, Minimal, Hormozi | Ken Burns, crossfade, vignette, lower-third | Standart Video, Haber Bülteni, Ürün İnceleme |
| 🧠 **6 Kategori Promptu** | 🎣 **8 Açılış Hook'u** | 🔐 **Dual UI** |
| True Crime, Bilim, Tarih, Motivasyon, Din, Genel | Şok edici gerçek, soru, hikaye, çelişki + tekrar önleme | Kullanıcı + Admin paneli (PIN korumalı) |
| 💾 **Crash-Safe** | 💰 **Maliyet Takibi** | 🌙 **Dark Mode** |
| SQLite WAL + session cache ile kaldığın yerden devam | Provider bazlı tahmini API maliyeti | Glassmorphism UI tasarım |

---

## 🏗️ Mimari

```
React UI → FastAPI → Pipeline Runner → Providers (Gemini, Edge TTS, Pexels)
                ↓                          ↓
            SQLite WAL              Remotion CLI → MP4
                ↓
            SSE Stream → UI Live Progress
```

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji |
|:-------|:----------|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Shadcn UI, Zustand |
| **Video** | Remotion 4.0, ffmpeg (codec) |
| **Veritabanı** | SQLite WAL mode |
| **Gerçek Zamanlı** | Server-Sent Events (SSE) |

---

## 🚀 Kurulum (5 Dakikada Başla)

### Gereksinimler

- Python 3.11+
- Node.js 18+ (npm dahil)
- Git

### 1. Projeyi Klonla

```bash
git clone <repo-url>
cd ContentManager
```

### 2. Backend Kurulumu

```bash
# Sanal ortam oluştur
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Bağımlılıkları yükle
pip install -r requirements.txt

# .env dosyasını hazırla
cp .env.example .env
# .env dosyasını düzenle: API anahtarlarını gir
```

### 3. Frontend Kurulumu

```bash
cd frontend
npm install
cd ..
```

### 4. Remotion Kurulumu

```bash
cd remotion
npm install
cd ..
```

### 5. Başlat (3 Terminal)

```bash
# Terminal 1 — Backend
source venv/bin/activate
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Remotion Studio (opsiyonel, preview için)
cd remotion && npm start
```

### 6. Aç ve Kullan

| Servis | Adres |
|:-------|:------|
| 🖥️ **Kullanıcı Arayüzü** | http://localhost:5173 |
| ⚙️ **Admin Paneli** | http://localhost:5173/admin (PIN: .env'deki `ADMIN_PIN`) |
| 📚 **API Docs** | http://localhost:8000/docs |

---

## ⚙️ Ortam Değişkenleri (.env)

```env
# Zorunlu olmayan — provider aktifse gerekli
GEMINI_API_KEY=          # Google Gemini LLM (script üretimi)
PEXELS_API_KEY=          # Pexels stok video/fotoğraf (ücretsiz)
OPENAI_API_KEY=          # Whisper altyazı + OpenAI TTS (opsiyonel)
ELEVENLABS_API_KEY=      # ElevenLabs TTS (opsiyonel, yüksek kalite)

# Varsayılanlar
ADMIN_PIN=1234           # Admin panel erişim PIN'i
DEFAULT_LANGUAGE=tr      # Varsayılan içerik dili
DEFAULT_TTS_PROVIDER=edge_tts  # Ücretsiz Microsoft TTS
```

---

## 📁 Proje Yapısı

```
ContentManager/
├── backend/             # FastAPI + Pipeline + Providers
│   ├── api/             # REST endpoints (jobs, settings, admin)
│   ├── models/          # SQLAlchemy ORM (Job, JobStep, Setting)
│   ├── modules/         # İçerik modülleri (standard_video, news_bulletin, product_review)
│   ├── pipeline/        # Runner, cache, step fonksiyonları
│   ├── providers/       # LLM, TTS, Visuals provider'lar
│   └── services/        # Settings resolver, job manager, cost tracker
├── frontend/            # React + Vite + Tailwind + Shadcn
│   └── src/
│       ├── pages/       # user/ (5 sayfa) + admin/ (5 sayfa)
│       ├── stores/      # Zustand (job, settings, admin, ui)
│       └── components/  # Layout, progress, forms
├── remotion/            # Video composition engine
│   └── src/
│       ├── compositions/  # StandardVideo, NewsBulletin, ProductReview
│       └── components/    # Subtitles (5 stil)
├── docs/                # 7 yaşayan doküman
├── sessions/            # Job çıktıları (gitignore)
└── .env.example         # Ortam değişkenleri şablonu
```

---

## 🔌 Provider Sistemi

Her kategori için birden fazla provider tanımlanır. Birincil provider başarısız olursa, sıradaki otomatik olarak devreye girer:

```
LLM:     Gemini → OpenAI → (hata)
TTS:     Edge TTS (ücretsiz) → ElevenLabs → OpenAI TTS → (hata)
Görsel:  Pexels (ücretsiz) → Pixabay → (hata)
Video:   Remotion (yerel render)
```

> Edge TTS ve Pexels ücretsizdir — API anahtarı olmadan bile temel video üretimi yapılabilir.

---

## 📖 Dokümantasyon

| Doküman | Açıklama |
|:--------|:---------|
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | Kullanıcı rehberi |
| [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) | Geliştirici teknik rehberi |
| [`docs/FEATURES_AND_ACTIONS.md`](docs/FEATURES_AND_ACTIONS.md) | UI↔Backend eşleştirme tabloları |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 15 mimari karar kaydı (ADR) |
| [`docs/REQUEST_LOG.md`](docs/REQUEST_LOG.md) | Talep takip dokümanı |
| [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) | Faz bazlı karşılama raporu |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Detaylı sürüm notları |

---

## 📝 Lisans

Bu proje özel kullanım içindir.

---

<div align="center">

Built with ❤️ by Huseyin — Powered by Claude

</div>
