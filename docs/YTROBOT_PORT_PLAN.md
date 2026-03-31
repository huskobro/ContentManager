# YTRobot-v3 Kontrollü Port Planı

**Date:** 2026-03-31
**Status:** Phase 2 Complete

---

## Kapsam

YTRobot-v3'ten ContentManager'a seçili özelliklerin kontrollü portu.
Körü körüne kopyalama yok. Önce karşılaştır, minimum gerekeni port et, test et, belgele.

---

## Port Edilenler

### 1. TTS Text Preprocessing (`backend/utils/text.py`)

**Source:** `YTRobot/providers/tts/base.py`

| Function | Purpose | Integration |
|----------|---------|-------------|
| `clean_for_tts()` | Apostrophe removal, smart quote normalization, ellipsis merge | Called in `step_tts()` before TTS provider call |
| `trim_silence()` | ffmpeg-based leading silence removal from audio | Called in `step_tts()` after audio save |

**Config keys:**
- `tts_clean_apostrophes` (default: `true`) — apostrof kaldirma
- `tts_trim_silence` (default: `true`) — bastaki sessizlik kirpma

### 2. Karaoke Animation Presets (`remotion/src/components/Subtitles.tsx`)

**Source:** `YTRobot/remotion/src/Scene.tsx` (lines 116-256)

5 animation presets ported:
- `hype` — slide-up entrance + zoom-in + gold highlight + glow
- `explosive` — slide-left entrance + fire glow
- `vibrant` — pop-in bounce + subtle glow
- `minimal_anim` — color swap only
- `none` — no animation (default, backward-compatible)

**Mevcut stillerle bağımsız:**
SubtitleStyle (standard/neon_blue/gold/minimal/hormozi) renkleri kontrol eder.
SubtitleAnimation giriş/ölçek efektlerini kontrol eder. İkisi bağımsız çalışır.

### 3. Font Selection System (`remotion/src/components/Subtitles.tsx`)

**Source:** `YTRobot/remotion/src/Scene.tsx` (lines 11-34)

7 fonts: inter, roboto, montserrat, oswald, bebas, serif, sans.
Uses `@remotion/google-fonts` package with graceful fallback.

**Config key:** `subtitle_font` (default: `"inter"`)

### 4. Narration Humanize & TTS Enhance Prompts

**Source:** `YTRobot/pipeline/script.py` (lines 323-426)

3 prompt templates ported:
- `_TTS_ENHANCE_PROMPT` — adds CAPS, pauses, emphasis markers
- `_SCRIPT_HUMANIZE_PROMPT` — rewrites for natural speech
- `_COMBINED_HUMANIZE_ENHANCE_PROMPT` — single-pass of both

**Config keys:**
- `narration_humanize_enabled` (default: `false`)
- `narration_enhance_enabled` (default: `false`)

**Override:** `narration_enhance_prompt` via PromptManager (module scope)

### 5. NewsBulletin Visual Enhancements

**Source:** `YTRobot/remotion/src/templates/news-bulletin/components/LowerThird.tsx`

Ported elements:
- Spring-animated 3-phase lower third entrance (accent bar → panel → headline)
- Pulsing live indicator ("CANLI" badge)
- Fade-out at end of each item
- Accent color bar above headline

### 6. ProductReview Visual Enhancements

**Source:** `YTRobot/remotion/src/templates/product-review/components/ScoreCard.tsx`

Ported elements:
- Spring-based section badge entrance
- Dynamic score ring color (green/amber/orange/red by score)
- Glow pulse effect on score ring

---

## Faz 1'de Port Edilmeyenler (Faz 2'de Port Edildi)

| Özellik | Faz 1 Kararı | Faz 2 Aksiyonu |
|---------|-----------------|----------------|
| News bulletin ticker bar | Too complex | ✅ Ported with 9 style palettes |
| Breaking news overlay | Niche | ✅ Ported, auto-triggers on "breaking" style |
| Product review floating comments | No data | ✅ Ported with feature flag + data guard |
| Product review price badge / star rating | No data | ✅ Ported with feature flag + data guard |
| `apply_speed()` audio post-processing | Pre-synthesis sufficient | ✅ Ported as optional post-synthesis |
| Ken Burns pan directions | Center sufficient | ✅ 4 directions: center, pan-left, pan-right, random |
| Video effects (warm/cool/cinematic) | Low priority | ✅ 5 effects: none, vignette, warm, cool, cinematic |
| Background styles (box/pill) | System handles it | ✅ 3 styles: none, box, pill |

## Hâlâ Port Edilmeyenler (ve Nedenleri)

| Özellik | Neden |
|---------|--------|
| 9:16 separate composition files | Types exist; resolution selection covers use case |
| Whisper greedy alignment algorithm | Capability model ready; Edge TTS word timing primary |
| pycaps subtitle burning | We use Remotion exclusively |
| MoviePy fallback | Not needed; Remotion is our sole compositor |

---

## Faz 2: Port Detayları

### 7. News Ticker Bar (`remotion/src/components/NewsTicker.tsx`)

**Source:** `YTRobot-v3/remotion/src/templates/news-bulletin/components/NewsTicker.tsx`

- 64px height scrolling ticker bar
- 3x text repetition for seamless loop, 4px/frame scroll speed
- Left accent badge with localized "HABERLER"/"NEWS" label
- 9 style-specific accent color palettes
- Edge fade gradients for smooth appearance

**Config key:** `bulletin_ticker_enabled` (default: `true`)

### 8. Breaking News Overlay (`remotion/src/components/BreakingNewsOverlay.tsx`)

**Source:** `YTRobot-v3/remotion/src/templates/news-bulletin/components/BreakingOverlay.tsx`

- Spring-animated slide-in badge (left) + network name (right, 8-frame delay)
- 9 two-tone gradient color palettes
- clipPath arrow-head badge shape
- 3 sin-wave flash pulses in first 30 frames
- Auto-triggers when `bulletinStyle === "breaking"`

### 9. Product Review: PriceBadge, StarRating, FloatingComments

**Source:** `YTRobot-v3/remotion/src/templates/product-review/components/`

**PriceBadge:** Animated counter (0→price over 90 frames), slide-up spring, strikethrough original price, red discount badge.

**StarRating:** 5 SVG stars with sequential fill (8-frame stagger), fractional fill via CSS clip, spring entrance.

**FloatingComments:** Up to 5 floating speech bubble cards, pop-in spring (scale 0.3→1), sin-wave float, auto-dismiss after 3s.

**Özellik flag'leri (tümü varsayılan: false, yalnızca admin):**
- `review_price_enabled` — requires script `price` field
- `review_star_rating_enabled` — requires script `star_rating` field
- `review_comments_enabled` — requires script `top_comments` field

### 10. Video Effects Overlay (`remotion/src/components/VideoEffects.tsx`)

5 effects: none, vignette, warm (orange multiply), cool (blue multiply), cinematic (letterbox bars at 10.5% height).

**Config key:** `video_effect` (default: `"none"`)

### 11. Ken Burns Pan Directions (StandardVideo.tsx)

4 directions via `getTransformOrigin()` helper:
- `center` — default, centered zoom
- `pan-left` — left-edge origin
- `pan-right` — right-edge origin
- `random` — cycles through corner origins per scene index

**Config key:** `ken_burns_direction` (default: `"center"`)

### 12. Subtitle Backgrounds (StandardVideo.tsx)

3 styles: none (bottom gradient only), box (semi-transparent rectangle), pill (rounded capsule).

**Config key:** `subtitle_bg` (default: `"none"`)

### 13. Post-Synthesis Speed (`backend/utils/text.py`)

ffmpeg atempo filter chain for 0.25-4.0x speed range. Chains multiple atempo filters when outside 0.5-2.0 constraint.

**Config key:** `tts_apply_speed_post` (default: `false`)
**Safety:** Edge TTS has pre-synthesis speed, so this is off by default. Only enable for providers without native speed.

### 14. TTS Provider Capability Model (`backend/providers/tts/capabilities.py`)

Frozen dataclass `TTSCapability` with fields:
- `supports_word_timing`, `word_timing_format`, `supports_sentence_timing`
- `supports_pre_synthesis_speed`, `requires_post_synthesis_speed`
- `requires_alignment_fallback`, `recommended_subtitle_strategy`
- `timing_quality`, `notes`

Defined for: edge_tts (excellent), elevenlabs (none), openai_tts (none).
Unknown providers get safe default (equal_distribution).

### 15. Settings Pipeline Stage Labels (`frontend/src/lib/constants.ts`)

Every setting now has optional `pipelineStage` field describing which pipeline stage it affects. Rendered as blue micro-text below description in GlobalSettings.tsx admin panel.

New setting categories added: tts_processing, module_news, module_review.
~15 new settings with full pipeline stage descriptions.

---

## Güvenlik Önlemleri

### Faz 1
1. Tüm yeni prop'lar varsayılanlarla **opsiyonel** — geriye dönük uyumlu
2. `clean_for_tts` yalnızca TTS girdisini etkiler, altyazı metnini değil — kelime zamanlama hizalaması korunur
3. `trim_silence` ses dosyasını kayıttan SONRA, süre okunmadan önce işler
4. Narrasyon iyileştirme **varsayılan olarak kapalı** — pipeline davranışında değişiklik yok
5. Animasyon ön ayarları `"none"` varsayılır — mevcut videolar değişmez
6. Font varsayılanı `"inter"` — mevcut davranış korunur
7. Tüm config anahtarlarının modül config'inde açık varsayılanları var

### Faz 2
8. Ürün inceleme özellikleri **çift güvenlik** kullanır: admin toggle varsayılan KAPALI VE veri varlığı kontrolü
9. `apply_speed()` varsayılan KAPALI — Edge TTS ön sentez hızıyla çift hızı önler
10. Video efekti `"vignette"` çift uygulamayı önlemek için varsayılan vinyeti bastırır
11. Breaking news overlay yalnızca stil açıkça `"breaking"` olduğunda tetiklenir
12. Ticker verisi başlıklardan otomatik oluşturulur — ayrı veri pipeline'ı gerekmez
13. TTS capability modeli frozen (değiştirilemez) — çalışma zamanında mutasyon mümkün değil
14. All new Remotion components are in separate files — no risk to existing compositions
