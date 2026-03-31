# Sabit Kodlu Değerler — Final Denetimi
_Created: 2026-03-31 — Comprehensive inventory of all hardcoded values and their wiring status._
_Covers backend pipeline, module configs, provider defaults, and frontend schema defaults._

---

## Amaç

Bu doküman, sistemdeki şu durumlardaki her değerin yetkili kaydıdır:
- **sabit kodlu** (admin paneli veya `.env` üzerinden erişilemeyen)
- **eski/hatalı** (yanlış sabit kodlanmış ve o zamandan beri düzeltilmiş)
- **teknik açıdan geçerli geri dönüş** (son çare olarak sabit kodlanmış, doğru değer, ancak yapılandırılamaz)

`ADMIN_CONTROLS_MAP.md`'yi (bağlı admin kontrollerini eşler) ve `SYSTEM_CHAINS_MAP.md`'yi (pipeline veri akışlarını belgeler) tamamlar.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ WIRED | Admin panel visible + DB saved + resolver reads it + pipeline uses it |
| 🔧 FIXED | Was hardcoded incorrectly; fixed in this audit pass |
| ⚠ TECHNICAL FALLBACK | Hardcoded last-resort value; correct; not configurable (acceptable) |
| 📌 VISIBLE BUT DISABLED | UI shows it but backend ignores it (documented) |
| ❌ NOT WIRED | Exists in UI or config but pipeline ignores it |
| ℹ INFO | Not a bug; design decision |

---

## Bölüm 1: TTS Ses Çözümleme Zinciri

Ses çözümleme iki geçişte denetlendi ve düzeltildi (2026-03-31).

### Mevcut Durum (düzeltme sonrası)

**Çözümleme sırası (en yüksek öncelik kazanır):**

```
1. input_data["voice"]     — direct caller override (per-request)
   ↓
2. config["tts_voice"]     — 5-layer resolved (admin → module → user)
   ↓
3. _app_settings.default_tts_voice  — config.py Field (default: "tr-TR-EmelNeural")
   ↓
4. .env DEFAULT_TTS_VOICE  — environment variable
```

**Files involved:**

| File | Layer | Status |
|------|-------|--------|
| `backend/config.py:163` | Layer 3: runtime default | ✅ `default="tr-TR-EmelNeural"` |
| `backend/services/settings_resolver.py:56` | Layer 1 global defaults | ✅ `"tts_voice": app_settings.default_tts_voice` |
| `backend/providers/tts/edge_tts_provider.py:85` | Provider fallback | ✅ `config.get("tts_voice") or _app_settings.default_tts_voice` |
| `backend/modules/standard_video/pipeline.py:289` | Step TTS fallback | 🔧 **Fixed in this audit** — was `"tr-TR-AhmetNeural"`, now `config.get("tts_voice") or _app_settings.default_tts_voice` |
| `frontend/src/lib/constants.ts:333` | UI schema placeholder | 🔧 **Fixed in this audit** — was `"tr-TR-AhmetNeural"`, now `"tr-TR-EmelNeural"` |
| `backend/providers/registry.py:16` | Health check test string | ⚠ TECHNICAL FALLBACK — `"tr-TR-AhmetNeural"` used in provider health check call only, not pipeline default |

**Decision:** `tr-TR-EmelNeural` is the system default. Configurable via admin panel `tts_voice` key.

---

## Bölüm 2: Admin Paneli Kontrolleri — Tam Envanter

`constants.ts` içindeki `SYSTEM_SETTINGS_SCHEMA` ve `PROMPT_SETTINGS_SCHEMA`'da listelenen tüm kontroller.

### Sistem Ayarları

| Key | Admin UI | DB Saved | Resolver | Pipeline | Status |
|-----|----------|----------|----------|----------|--------|
| `max_concurrent_jobs` | ✓ | ✓ | ✓ | ✓ (job_manager) | ✅ WIRED |
| `output_dir` | ✓ | ✓ (special endpoint) | ✓ | ✓ (composition copy) | ✅ WIRED |
| `video_format` | ✓ | ✓ | ✓ | ❌ not read by pipeline | ❌ NOT WIRED — UI formatting only; pipeline uses `video_resolution` |
| `language` | ✓ | ✓ | ✓ | ✓ (script, tts, subtitles) | ✅ WIRED |
| `job_timeout_seconds` | ✓ | ✓ | ✓ | ✓ (job_manager) | ✅ WIRED |

### Pipeline Varsayılanları

| Key | Admin UI | DB Saved | Resolver | Pipeline | Status |
|-----|----------|----------|----------|----------|--------|
| `tts_provider` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `llm_provider` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `visuals_provider` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `subtitle_style` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `llm_fallback_order` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `tts_fallback_order` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `visuals_fallback_order` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |

### Senaryo Ayarları

| Key | Admin UI | DB Saved | Resolver | Pipeline | Status |
|-----|----------|----------|----------|----------|--------|
| `scene_count` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `category` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `use_hook_variety` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `script_temperature` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `script_max_tokens` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |

### Video & Ses Ayarları

| Key | Admin UI | DB Saved | Resolver | Pipeline | Status |
|-----|----------|----------|----------|----------|--------|
| `tts_voice` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `tts_speed` | ✓ | ✓ | ✓ | ✓ (Edge TTS only) | ✅ WIRED (Edge TTS) |
| `video_resolution` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `video_fps` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `subtitle_font_size` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `subtitle_use_whisper` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `ken_burns_enabled` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |
| `ken_burns_intensity` | ✓ | ✓ | ✓ | ✓ | ✅ WIRED |

### Prompt Şablonları

| Key | Admin UI | DB Saved | Resolver (alias) | Pipeline | Status |
|-----|----------|----------|----------|----------|--------|
| `standard_video_script_prompt` | ✓ | ✓ | `script_prompt_template` | ✓ | ✅ WIRED |
| `standard_video_metadata_prompt` | ✓ | ✓ | `metadata_prompt_template` | ✓ | ✅ WIRED |
| `news_bulletin_script_prompt` | ✓ | ✓ | `script_prompt_template` | ✓ | ✅ WIRED |
| `news_bulletin_metadata_prompt` | ✓ | ✓ | `metadata_prompt_template` | ✓ | ✅ WIRED |
| `product_review_script_prompt` | ✓ | ✓ | `script_prompt_template` | ✓ | ✅ WIRED |
| `product_review_metadata_prompt` | ✓ | ✓ | `metadata_prompt_template` | ✓ | ✅ WIRED |

---

## Bölüm 3: Yapılandırılamaz Sabit Kodlu Değerler (Kabul Edilebilir)

Admin paneli üzerinden değiştirilemeyen sabit kodlu değerler. Tamamı teknik açıdan doğru ve mevcut kapsam için kabul edilebilir tasarım kararlarıdır.

### Senaryo Sistemi

| Value | File | Configurable? | Decision |
|-------|------|--------------|----------|
| 6 category prompts (`general`, `true_crime`, `science`, `history`, `motivation`, `religion`) | `pipeline/steps/script.py` | ❌ No | ⚠ TECHNICAL FALLBACK — covering major YouTube niches; extensible in future |
| 8 hook types (`shocking_fact`, `question`, `story`, `contradiction`, `future_peek`, `comparison`, `personal_address`, `countdown`) | `pipeline/steps/script.py` | ❌ No | ⚠ TECHNICAL FALLBACK — well-designed variety set |
| Hook exclusion window: last 6 hooks avoided | `pipeline/steps/script.py` | ❌ No | ⚠ TECHNICAL FALLBACK — prevents repetition |
| Default title fallback: `"Yapay Zekanın Geleceği"` | `pipeline/steps/script.py` | ❌ No | ⚠ TECHNICAL FALLBACK — only used when `_job_title` missing (shouldn't happen in normal flow) |

### TTS / Ses

| Value | File | Configurable? | Decision |
|-------|------|--------------|----------|
| Audio filename pattern: `scene_{NN}.mp3` | `standard_video/pipeline.py` | ❌ No | ⚠ TECHNICAL FALLBACK — internal naming convention |
| `tts_speed` only affects Edge TTS | `edge_tts_provider.py` | Partial | ⚠ TECHNICAL FALLBACK — ElevenLabs/OpenAI providers don't implement this key |

### Altyazılar

| Value | File | Configurable? | Decision |
|-------|------|--------------|----------|
| 5 subtitle style definitions (`standard`, `neon_blue`, `gold`, `minimal`, `hormozi`) | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK — fully designed, Remotion-ready |
| Whisper API URL: `https://api.openai.com/v1/audio/transcriptions` | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK — OpenAI API stable |
| Whisper model: `whisper-1` | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK |
| Whisper cost rate: `$0.006/minute` | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK — for cost tracking only |
| Default `duration_seconds` per scene if TTS absent: `15.0` | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK |
| Whisper HTTP timeout: `120.0s` | `pipeline/steps/subtitles.py` | ❌ No | ⚠ TECHNICAL FALLBACK |

### Kompozisyon

| Value | File | Configurable? | Decision |
|-------|------|--------------|----------|
| `COMPOSITION_MAP`: module_key → Remotion component name | `pipeline/steps/composition.py` | ❌ No | ⚠ TECHNICAL FALLBACK — tied to Remotion component registry |
| `DEFAULT_WIDTH=1920`, `DEFAULT_HEIGHT=1080`, `DEFAULT_FPS=30` | `pipeline/steps/composition.py` | via `video_resolution`/`video_fps` | ✅ WIRED — these are the parse-failure fallbacks |
| `DEFAULT_SCENE_DURATION = 5.0s` | `pipeline/steps/composition.py` | ❌ No | ⚠ TECHNICAL FALLBACK — when TTS duration absent |
| Temp file server timeout `120s` | `pipeline/steps/composition.py` | ❌ No | ⚠ TECHNICAL FALLBACK |

### Sağlayıcı

| Value | File | Configurable? | Decision |
|-------|------|--------------|----------|
| kieai base URL: `https://api.kie.ai` | `providers/llm/kieai.py` | ❌ No | ⚠ TECHNICAL FALLBACK — vendor URL |
| kieai endpoint: `/gemini-2.5-flash/v1/chat/completions` | `providers/llm/kieai.py` | ❌ No | ⚠ TECHNICAL FALLBACK — vendor endpoint |
| kieai cost: `$0.075/$0.30 per 1M tokens` | `providers/llm/kieai.py` | ❌ No | ⚠ TECHNICAL FALLBACK — for cost tracking |
| Registry health check test voice: `"tr-TR-AhmetNeural"` | `providers/registry.py:16` | ❌ No | ⚠ TECHNICAL FALLBACK — health check only, not pipeline default |

---

## Bölüm 4: Görünür Ama Bağlı Değil (📌 GÖRÜNÜR AMA DEVRE DIŞI)

Bu ayarlar UI'da görünür ancak pipeline üzerinde hiçbir etkisi yoktur. Belgelenmiş ve kullanıcıya açıklanmıştır.

| Setting | Location | Effect | Status |
|---------|----------|--------|--------|
| `video_format` (`long`/`shorts`) | GlobalSettings + CreateVideo | UI suggestion only; `video_resolution` is the actual pipeline key | 📌 VISIBLE BUT DISABLED — intentional, CreateVideo maps format → resolution |
| `subtitle_enabled` | UserSettings (removed) | Was removed from UI in P1 fix | ✅ Removed |
| `metadata_enabled` | UserSettings (greyed) | Backend ignores; metadata step always runs | 📌 VISIBLE BUT DISABLED — amber banner shown |
| `thumbnail_enabled` | UserSettings (greyed) | Backend ignores; thumbnail not implemented | 📌 VISIBLE BUT DISABLED — amber banner shown |
| `publish_to_youtube` | UserSettings (greyed) | Backend ignores; YouTube upload not implemented | 📌 VISIBLE BUT DISABLED — amber banner shown |
| `youtube_privacy` | UserSettings (greyed) | Backend ignores | 📌 VISIBLE BUT DISABLED — amber banner shown |
| `tts_speed` (ElevenLabs/OpenAI) | GlobalSettings | Only Edge TTS reads this key | 📌 VISIBLE BUT DISABLED — description notes Edge TTS only |

---

## Bölüm 5: Dashboard Etkileşim Modeli — Doğrulama Özeti

Kod yolu izi 2026-03-31 tarihinde gerçekleştirildi. Tüm 8 davranış statik analizle doğrulandı.

| # | Behavior | Implementation | Result |
|---|----------|---------------|--------|
| 1 | Sol tık → JobDetailSheet | `RecentJobRow.onClick` → `setSheetJob(job)` → `<JobDetailSheet open>` | ✅ |
| 2 | Sağ tık → JobQuickLook | `onContextMenu → e.preventDefault() + openQuickLook(job)` | ✅ |
| 3 | Enter → JobDetailSheet | `useScopedKeyboardNavigation.onEnter` → `captureForRestore + setSheetJob` | ✅ |
| 4 | Space → JobQuickLook | `onSpace` → `openQuickLook` | ✅ |
| 5 | ESC → en üstteki panel kapanır | `useDismissOnEsc` priority stack: QuickLook=20 > Sheet=10 | ✅ |
| 6 | Panel kapanınca odak geri yüklenir | `restoreFocusDeferred(80/150)` in close helpers | ✅ |
| 7 | Hover → klavye odak sync | `onMouseEnter → setFocusedIdx(idx)`, `lastWasKeyboardRef=false` → no DOM focus() on hover | ✅ |
| 8 | ARIA/role | `role="listbox"` + `aria-activedescendant`, `role="option"` + `aria-selected/setsize/posinset` + roving tabindex | ✅ |

**Kritik yol güvenlik kontrolü:**
- `anyPanelOpen=true` → `disabled=true` in `useScopedKeyboardNavigation` → scope popped from stack → `isActive()=false` → keyboard handler does NOT fire while panel is open ✅
- `useDismissOnEsc` runs in capture phase (priority over Radix) — Radix's own ESC handler sets `defaultPrevented=true` for its dialogs, so our handler only fires for non-Radix panels ✅

---

## Bölüm 6: Bu Denetimde Yapılan Değişikliklerin Özeti

| File | Change | Type |
|------|--------|------|
| `backend/modules/standard_video/pipeline.py` | Added `_app_settings` import; `"tr-TR-AhmetNeural"` fallback → `config.get("tts_voice") or _app_settings.default_tts_voice` | 🔧 Fix |
| `frontend/src/lib/constants.ts` | `tts_voice` schema `default: "tr-TR-AhmetNeural"` → `"tr-TR-EmelNeural"` | 🔧 Fix |
| `docs/ADMIN_CONTROLS_MAP.md` | `tts_voice` default corrected to `tr-TR-EmelNeural` | 📄 Doc update |
| `docs/SYSTEM_CHAINS_MAP.md` | TTS chain hardcoded fallback corrected: `app_settings.default_tts_voice` → `"tr-TR-EmelNeural"` | 📄 Doc update |
| `docs/HARDCODED_FINAL_AUDIT.md` | This file created | 📄 New doc |

---

## Bölüm 7: Kalan Riskler

| Risk | Level | Description |
|------|-------|-------------|
| `tts_speed` not wired for ElevenLabs/OpenAI TTS | Low | By design — these providers have different speed API parameters. Document in provider guides when implemented. |
| `video_format` not pipeline-wired | Info | `CreateVideo.tsx:resolveResolution()` maps format → resolution client-side before job creation. Pipeline receives correct `video_resolution`. No bug. |
| Metadata prompt template `{placeholder}` substitution absent | Low | Templates are sent as-is to LLM. LLM infers context from user prompt. Add `format()` substitution if user requests. |
| `UserSettings` "Yayın & Ek Özellikler" section amber banner | Info | User-visible disclosure. Will be activated when YouTube OAuth publish is implemented. |
| Duplicate normalize functions already fixed (P1) | Resolved | `normalize_narration()` in `utils/text.py` is canonical. Both TTS and subtitle steps import from there. |
