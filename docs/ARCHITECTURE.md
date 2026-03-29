# ContentManager — Mimari Karar Kayıtları

> Bu doküman seçilen her teknoloji, oluşturulan her mimari yapı için
> "neden bu yolu seçtik?" ve "alternatifleri neydi, neden eledik?" sorularını yanıtlar.

---

## ADR-001: Backend Framework — FastAPI

**Karar:** FastAPI (Python)
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
4 referans projeden 2'si (YTRobot, youtube_video_bot) Python tabanlı; TTS/LLM provider SDK'larının büyük çoğunluğu Python. Backend'in aynı dilde olması entegrasyon maliyetini minimize eder.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Express.js (Node) | YouTube StoryGenerator zaten JS; Remotion ile aynı runtime | Provider SDK'larının çoğu Python; ikili dil yükü oluşur |
| Django | Tam özellikli, admin paneli dahili | Bu proje için fazla ağır; REST endpoint odaklı bir yapıya Django'nun ORM+template+admin yükü gereksiz |
| Flask | Hafif, esnek | Async desteği zayıf; FastAPI'nin otomatik OpenAPI, Pydantic entegrasyonu ve async desteği üstün |

### Sonuç
FastAPI: async native, Pydantic v2 doğal entegrasyon, otomatik Swagger UI, tip güvenliği, minimal boilerplate.

---

## ADR-002: Veritabanı — SQLite (WAL modu)

**Karar:** SQLite 3.x, WAL (Write-Ahead Logging) modu
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
Localhost-first yaklaşım; ayrı veritabanı sunucusu kurmak ve yönetmek istemiyoruz. Aynı anda en fazla 2 concurrent job çalışacak.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| PostgreSQL | ACID, JSON alanları, tam SQL desteği | Kurulum ve yönetim yükü; bu ölçekte gereksiz |
| Redis | Hızlı KV store, pub/sub | Kalıcı veri için uygun değil; ek process gerektirir |
| JSON dosyaları | Sıfır bağımlılık | Concurrent yazma sorunları (YTRobot'ta stats.json çakışmaları bunu kanıtlıyor) |
| MongoDB | Esnek şema | Ayrı sunucu; localhost-first prensibine aykırı |

### Sonuç
SQLite WAL: sıfır kurulum, tek dosya, concurrent read/write, `check_same_thread=False` ile FastAPI uyumlu, PRAGMA optimizasyonlarıyla yeterli performans.

---

## ADR-003: Frontend Framework — React + Vite

**Karar:** React 18 + Vite 5 + TypeScript
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
Remotion React tabanlı; aynı ekosistemi paylaşmak tip tanımlarını ve bileşen mantığını ortak kullanmayı kolaylaştırır.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Vue 3 + Vite | Öğrenme eğrisi daha düşük | Remotion sadece React destekliyor; iki farklı UI framework gereksiz |
| Svelte | Performans, minimal bundle | Remotion uyumsuzluğu, daha küçük ekosistem |
| Next.js | SSR, dosya tabanlı routing | Localhost-first app için SSR gereksiz; backend zaten FastAPI |
| Vanilla JS (YTRobot yaklaşımı) | Bağımlılık yok | 5300 satırlık monolitik HTML — YTRobot'un en büyük zayıflığı |

### Sonuç
React + Vite: Remotion ile doğal uyum, HMR hızı, TypeScript strict mode, geniş bileşen ekosistemi.

---

## ADR-004: CSS Framework — Tailwind CSS + Shadcn UI Yaklaşımı

**Karar:** Tailwind CSS 3 + CSS değişken tabanlı tema sistemi + Radix UI primitives
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
Dark mode zorunlu; modern, minimalist UI bekleniyor. Bileşen kütüphanesi olarak Shadcn UI'nin "kopyala ve sahiplen" yaklaşımı, npm'den indirilen hazır bileşenlerden daha fazla kontrol sağlıyor.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Material UI (MUI) | Kapsamlı bileşen seti | Ağır bundle, opinionated tasarım, özelleştirme maliyeti yüksek |
| Ant Design | Enterprise odaklı | Çin ekosistemi, bundle boyutu, dark mode zor |
| Chakra UI | Tailwind'e benzer utility | Tailwind kadar esnek değil, daha büyük runtime |
| Saf CSS | Tam kontrol | Bakım maliyeti çok yüksek, tutarlılık zor |

### Sonuç
Tailwind: sıfır runtime maliyeti, class-tabanlı dark mode, utility-first. Radix UI: erişilebilir headless primitives. Shadcn yaklaşımı: CSS değişkenlerle tema, kopyala-sahiplen bileşenler.

---

## ADR-005: State Management — Zustand

**Karar:** Zustand 5 + persist middleware
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
3 ayrı state alanı (UI, jobs, settings) var. Karmaşık normalize state veya middleware zinciri gerekmiyor.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Redux Toolkit | Standart, DevTools | Bu ölçek için fazla boilerplate (action, reducer, slice) |
| Jotai | Atom bazlı, minimal | Persist ve complex slice kalıpları daha az olgun |
| React Context | Sıfır bağımlılık | Re-render optimizasyonu zor, provider cehennemi |
| MobX | Otomatik reaktivite | Proxy tabanlı, debugging zorlaşabilir |

### Sonuç
Zustand: minimal API (create + hook), persist middleware, selector tabanlı re-render optimizasyonu, DevTools desteği, TypeScript tip güvenliği.

---

## ADR-006: Video Composition — Remotion

**Karar:** Remotion 4.0.290
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
YTRobot'ta Remotion zaten kullanılıyor ve sofistike animasyonlar (Ken Burns, karaoke altyazı) sağlıyor. youtube_video_bot'ta MoviePy kullanılıyor ancak daha yavaş ve animasyon desteği sınırlı.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| MoviePy | Saf Python, basit API | Yavaş rendering, sınırlı animasyon, CPU-intensive |
| FFmpeg doğrudan | En hızlı, tam kontrol | Karmaşık filter_complex chain'leri, bakımı zor |
| Shotstack API | Bulut rendering | Localhost-first prensibine aykırı, API maliyeti |

### Sonuç
Remotion: React tabanlı → frontend ile tip paylaşımı; programatik animasyon; `calculateMetadata` ile dinamik süre; headless rendering.

---

## ADR-007: Job State Management — SQLite-backed (Harici Broker Yok)

**Karar:** Uygulama-içi async job queue + SQLite state persistence
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
Kullanıcı Redis/Celery/RabbitMQ gibi harici broker istemiyor. Ancak işler uzun süreceği için (10-30 dk) yarım kalan işlerin kaybolmaması gerekiyor.

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Celery + Redis | Dağıtık, ölçeklenebilir | Ek 2 process (Redis + worker); localhost için gereksiz karmaşıklık |
| Dramatiq + Redis | Celery'den hafif | Yine Redis bağımlılığı |
| asyncio.Queue (YTRobot yaklaşımı) | Basit, sıfır bağımlılık | Uygulama kapanınca tüm iş durumu kaybolur |
| APScheduler | Zamanlama desteği | Job state persistence sınırlı |

### Sonuç
Hibrit yaklaşım: Python `asyncio` ile in-process job queue + SQLite'ta job/step durumu persist edilir. Uygulama yeniden başlatıldığında `running` durumdaki işler tespit edilir ve kaldığı adımdan devam edebilir (idempotent cache sayesinde). Harici servis gerekmez.

---

## ADR-008: API Client — Native Fetch (Axios Yok)

**Karar:** Fetch API etrafında hafif wrapper
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
Modern tarayıcılar fetch'i native destekliyor. Proxy üzerinden tüm istekler aynı origin'e gidiyor (CORS sorunsuz).

### Değerlendirilen Alternatifler

| Alternatif | Avantajları | Neden Elendi |
|-----------|------------|--------------|
| Axios | İnterceptor, request/response transform | 15 KB ek bundle; bu projedeki basit GET/POST kalıpları için gereksiz |
| ky | Fetch üstüne hafif sarmalayıcı | Ek bağımlılık, çok az fark |
| tRPC | Tip güvenli end-to-end | Backend FastAPI (Python) — tRPC sadece TS backend ile çalışır |

### Sonuç
Özel fetch wrapper: `APIError` sınıfı + `openSSE` helper + admin PIN header desteği. 80 satır kod, sıfır bağımlılık.

---

## ADR-009: Ayar Katmanları — 5 Seviyeli Override

**Karar:** Global → Admin → Module → Provider → User override
**Tarih:** 2026-03-29
**Durum:** Kabul edildi

### Bağlam
YTRobot'ta config.py + .env + channel settings + presets + request params şeklinde 5 katmanlı ama dağınık bir sistem var. Preset sistemi kırık, .env üzerine yazma hatası mevcut.

### Tasarım
```
Katman 1: config.py hardcoded defaults (en düşük öncelik)
Katman 2: Admin panelinden SQLite'a yazılan defaults
Katman 3: Modül bazlı defaults (standard_video farklı, news_bulletin farklı)
Katman 4: Provider bazlı defaults (elevenlabs → belirli ses ayarları)
Katman 5: Kullanıcı override'ları (en yüksek öncelik)
```

Her ayar için:
- Admin tarafından kilitlenebilir (`user_overridable: false`)
- Kilitli ayarlar kullanıcı arayüzünde görünmez veya disabled görünür

### Sonuç
Temiz, izlenebilir, çakışma durumunda hangi katmanın kazanacağı net. YTRobot'taki .env üzerine yazma ve preset kırıklığı sorunları yapısal olarak önlenir.

---

*Her yeni mimari karar `ADR-XXX` formatında bu dokümana eklenir.*
