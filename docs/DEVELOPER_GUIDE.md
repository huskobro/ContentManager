# ContentManager — Geliştirici Teknik Rehberi

> Son güncelleme: 2026-03-29 · Versiyon: v0.1.0

## İçindekiler

- [Mimari Özet](#mimari-özet)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Dizin Yapısı](#dizin-yapısı)
- [Backend Geliştirme](#backend-geliştirme)
- [Frontend Geliştirme](#frontend-geliştirme)
- [Remotion Geliştirme](#remotion-geliştirme)
- [Modül Sistemi](#modül-sistemi)
- [Provider Sistemi](#provider-sistemi)
- [Ayar Katmanları](#ayar-katmanları)
- [Veritabanı](#veritabanı)
- [Log Sistemi](#log-sistemi)
- [Yeni Özellik Ekleme Rehberi](#yeni-özellik-ekleme-rehberi)
- [Kodlama Standartları](#kodlama-standartları)

---

## Mimari Özet

ContentManager üç bağımsız katmandan oluşur:

```
┌──────────────┐     HTTP/SSE      ┌──────────────┐     subprocess     ┌──────────────┐
│   Frontend   │ ←——————————————→  │   Backend    │ ——————————————→    │   Remotion   │
│ React + Vite │   localhost:5173  │   FastAPI    │   npx remotion     │   Node.js    │
│ Tailwind     │   proxy → :8000   │   Python     │   render ...       │   React 18   │
│ Zustand      │                   │   SQLite WAL │                    │   H.264 MP4  │
└──────────────┘                   └──────────────┘                    └──────────────┘
```

**Tasarım İlkeleri:**
- Localhost-first: harici servis (Docker, Redis, Queue) kullanılmaz
- Tek süreç: Backend tek bir Uvicorn süreci olarak çalışır
- Modüler ama şişmemiş: her modülün tek ve net sorumluluğu var
- Genişletilebilir: yeni modül ve provider eklemek kolay, ama bugünkü kod gereksiz soyut değil

---

## Teknoloji Yığını

| Katman | Teknoloji | Versiyon | Neden Seçildi |
|--------|-----------|----------|---------------|
| Backend framework | FastAPI | 0.115+ | Async, tip güvenli, otomatik OpenAPI |
| ASGI sunucu | Uvicorn | 0.32+ | Hafif, hızlı, production-ready |
| Veritabanı | SQLite (WAL) | 3.x | Sıfır kurulum, concurrent read/write |
| ORM | SQLAlchemy | 2.0+ | Python standardı, tip desteği |
| Validation | Pydantic v2 | 2.10+ | Hızlı, BaseSettings entegrasyonu |
| Frontend framework | React | 18.3+ | Ekosistem, Remotion uyumu |
| Build tool | Vite | 5.4+ | Hızlı HMR, ESM native |
| CSS framework | Tailwind CSS | 3.4+ | Utility-first, dark mode, sıfır çalışma-anı bağımlılığı |
| State management | Zustand | 5.0+ | Minimal API, persist middleware |
| Video composition | Remotion | 4.0.290 | React-tabanlı programatik video |
| HTTP client (FE) | Native fetch | — | Gereksiz bağımlılık eklenmez |
| İkonlar | Lucide React | 0.468+ | Hafif, tree-shakeable |
| UI primitives | Radix UI | — | Erişilebilir, headless bileşenler |

---

## Dizin Yapısı

```
ContentManager/
├── backend/
│   ├── main.py              ← FastAPI app, lifespan, middleware, health endpoint
│   ├── config.py            ← Pydantic BaseSettings (tüm ayarlar)
│   ├── database.py          ← SQLite engine (WAL), Base, get_db(), create_tables()
│   ├── models/              ← SQLAlchemy ORM modelleri
│   ├── api/                 ← FastAPI router'ları
│   ├── modules/             ← İçerik modülleri (standard_video, news_bulletin, ...)
│   ├── providers/           ← Servis sağlayıcıları (TTS, LLM, visuals, composition)
│   ├── pipeline/            ← Pipeline runner, adım implementasyonları, cache
│   ├── services/            ← Paylaşılan iş mantığı (settings_resolver, job_manager)
│   └── utils/               ← Logger, dosya yardımcıları
├── frontend/
│   ├── src/
│   │   ├── api/client.ts    ← Fetch wrapper + SSE helper
│   │   ├── stores/          ← Zustand store'ları (ui, job, settings)
│   │   ├── components/      ← Layout (AppShell, Sidebar, Header) + paylaşılan bileşenler
│   │   ├── pages/           ← user/ ve admin/ sayfa bileşenleri
│   │   └── lib/utils.ts     ← cn() — clsx + tailwind-merge
│   └── [konfigürasyon dosyaları: vite, tailwind, tsconfig]
├── remotion/
│   ├── src/
│   │   ├── index.ts         ← registerRoot giriş noktası
│   │   ├── Root.tsx          ← Composition kayıtları (3 modül)
│   │   ├── types.ts          ← Paylaşılan tip tanımları
│   │   └── compositions/     ← StandardVideo, NewsBulletin, ProductReview
│   └── [konfigürasyon: remotion.config.ts, tsconfig, package.json]
├── docs/                     ← Yaşayan dokümantasyon
├── sessions/                 ← Job çıktıları (runtime oluşur)
├── logs/                     ← Uygulama logları (runtime oluşur)
├── .tmp/                     ← Pipeline ara dosyaları (gitignore'da)
├── .env                      ← Ortam değişkenleri (gitignore'da)
└── requirements.txt          ← Python bağımlılıkları
```

---

## Backend Geliştirme

### Ayağa Kaldırma

```bash
# Virtual environment oluştur ve aktive et
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# .env hazırla
cp .env.example .env

# Sunucuyu başlat (hot-reload aktif)
python -m backend.main
# → http://127.0.0.1:8000
# → Swagger UI: http://127.0.0.1:8000/docs
```

### Temel Dosya Açıklamaları

| Dosya | Sorumluluk |
|-------|------------|
| `main.py` | FastAPI uygulamasını oluşturur; lifespan'da DB tablolarını başlatır, CORS ve istek loglama middleware'lerini ekler. `/health` endpoint'ini sunar. |
| `config.py` | `Settings` sınıfı — tüm uygulama ayarları. `.env`'den okur, tip doğrulaması yapar. `settings` singleton nesnesi tüm modüller tarafından import edilir. |
| `database.py` | SQLAlchemy engine'i WAL modunda oluşturur. `Base` declarative sınıfı, `get_db()` FastAPI dependency'si, `create_tables()` ve `check_db_health()` fonksiyonları. |
| `utils/logger.py` | JSON formatlı log sistemi. `get_logger(__name__)` ile modül bazlı logger alınır. `job_id`, `step`, `provider`, `duration_ms` gibi keyword argümanlar doğrudan log çağrısına geçilebilir. |

### config.py Ayar Grupları

| Grup | Örnekler | Açıklama |
|------|----------|----------|
| Uygulama & Sunucu | `backend_host`, `backend_port`, `cors_origins`, `admin_pin` | Sunucu çalışma parametreleri |
| Veritabanı & Dosya | `database_path`, `sessions_dir`, `tmp_dir` | Dosya yolları |
| Pipeline Limitleri | `max_concurrent_jobs`, `job_timeout_seconds` | İş yönetimi sınırları |
| Provider API Keys | `gemini_api_key`, `elevenlabs_api_key`, `pexels_api_key` | Harici servis kimlik bilgileri |
| Pipeline Varsayımları | `default_language`, `default_tts_provider`, `default_llm_provider` | Bootstrap varsayılanları |

---

## Frontend Geliştirme

### Ayağa Kaldırma

```bash
cd frontend
npm install
npm run dev
# → http://127.0.0.1:5173
```

Vite proxy ayarı (`vite.config.ts`) sayesinde `/api/*` ve `/health` istekleri otomatik olarak backend'e (`:8000`) yönlendirilir.

### State Yönetimi (Zustand)

| Store | Dosya | Sorumluluk |
|-------|-------|------------|
| `useUIStore` | `stores/uiStore.ts` | Tema (dark/light), sidebar durumu, admin kilit, toast bildirimleri |
| `useJobStore` | `stores/jobStore.ts` | Job listesi, adım durumları, log stream, SSE güncellemeleri |
| `useSettingsStore` | `stores/settingsStore.ts` | Kullanıcı video varsayımları (dil, TTS, çözünürlük vb.) |

Persist middleware: `uiStore` ve `settingsStore` seçili alanları `localStorage`'a yazar.

### API İstekleri

```typescript
import { api, APIError, openSSE } from "@/api/client";

// GET isteği
const jobs = await api.get<Job[]>("/jobs");

// POST isteği
const newJob = await api.post<Job>("/jobs", { topic: "AI in Healthcare" });

// Admin isteği (PIN header'ı ile)
const settings = await api.get<Settings>("/admin/settings", { adminPin: "1234" });

// SSE stream
const close = openSSE(`/jobs/${jobId}/stream`, (data) => {
  const event = JSON.parse(data);
  // ... store güncelle
});
```

### Layout Yapısı

```
AppShell (mode: "user" | "admin")
├── Sidebar
│   ├── Logo + uygulama adı
│   ├── Navigasyon linkleri (mode'a göre değişir)
│   ├── Admin/User geçiş bağlantısı
│   └── Daralt/Genişlet butonu
├── Header
│   ├── Hamburger menü (mobil)
│   ├── Sayfa başlığı
│   ├── Dark/Light toggle
│   └── Admin PIN butonu
└── <Outlet /> — aktif sayfa bileşeni
```

---

## Remotion Geliştirme

### Ayağa Kaldırma

```bash
cd remotion
npm install
npx remotion studio
# → Remotion Studio tarayıcıda açılır
```

### Composition Yapısı

3 ana composition `Root.tsx`'de kayıtlıdır:

| Composition ID | Modül | Props Tipi |
|---------------|-------|------------|
| `StandardVideo` | Standart video | `StandardVideoProps` |
| `NewsBulletin` | Haber bülteni | `NewsBulletinProps` |
| `ProductReview` | Ürün inceleme | `ProductReviewProps` |

Her composition `calculateMetadata` kullanarak inputProps'taki sahne sürelerinden toplam frame sayısını dinamik olarak hesaplar.

### Yeni Composition Ekleme

1. `types.ts`'e yeni props arayüzü ekle
2. `compositions/` altına yeni `.tsx` dosyası oluştur
3. `Root.tsx`'de `<Composition>` ile kaydet

---

## Modül Sistemi

*(Faz 5'te detaylandırılacak)*

Mevcut modüller:
- `standard_video` — genel amaçlı video üretimi
- `news_bulletin` — RSS tabanlı haber bülteni
- `product_review` — yapılandırılmış ürün inceleme

Her modül kendi pipeline adımlarını, varsayılan ayarlarını ve Remotion composition'ını tanımlar.

---

## Provider Sistemi

*(Faz 6'da detaylandırılacak)*

Provider kategorileri: LLM, TTS, Visuals, Composition. Her kategori bir ABC (Abstract Base Class) ile tanımlanır; yeni provider eklemek ABC'yi implement etmekle yapılır.

---

## Ayar Katmanları

5 katmanlı override sırası (düşük → yüksek öncelik):

```
[1] Global defaults (config.py)
[2] Admin defaults (SQLite — admin panelinden)
[3] Module defaults (modül config)
[4] Provider defaults (provider config)
[5] User overrides (kullanıcı ayarları — en yüksek öncelik)
```

---

## Veritabanı

- Motor: **SQLite 3.x**, WAL (Write-Ahead Logging) modu
- Dosya: `contentmanager.db` (proje kökünde, gitignore'da)
- PRAGMA'lar: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `cache_size=-64000`, `temp_store=MEMORY`
- Concurrent read/write desteklenir

---

## Log Sistemi

Her log kaydı yapılandırılmış JSON formatındadır:

```json
{
  "timestamp": "2026-03-29T16:30:06.323Z",
  "level": "INFO",
  "logger": "backend.pipeline.tts",
  "message": "TTS sentezi tamamlandı",
  "job_id": "abc123",
  "step": "tts",
  "provider": "elevenlabs",
  "duration_ms": 1240
}
```

Log'lar hem `stdout`'a hem `logs/contentmanager.log` dosyasına yazılır. Dosya 10 MB'da döner (5 yedek).

---

## Yeni Özellik Ekleme Rehberi

1. İlgili modül veya provider dizinine yeni dosya ekle
2. ABC'yi implement et (modül için `BaseModule`, provider için `BaseProvider`)
3. Registry'ye kaydet
4. Gerekli API route'unu `api/` altına ekle
5. Frontend'de ilgili sayfayı veya bileşeni güncelle
6. `FEATURES_AND_ACTIONS.md`'yi güncelle
7. `CHANGELOG.md`'ye kayıt ekle

---

## Kodlama Standartları

- **Python**: Pydantic model + type hint zorunlu. Fonksiyon docstring (Türkçe).
- **TypeScript**: strict mode, `noUnusedLocals`, `noUnusedParameters`.
- **CSS**: Tailwind utility class — özel CSS sadece index.css'te.
- **İsimlendirme**: Python → `snake_case`, TS → `camelCase`, bileşen → `PascalCase`.
- **Dosya boyutu**: Tek dosya 300 satırı aşmamalı; gerekirse bölünmeli.
- **Yorum**: Yalnızca "neden" açıklayan yerlerde yorum ekle; "ne yapıyor" açık olan yerlerde ekleme.

---

*Bu doküman her faz tamamlandığında güncellenir.*
