# System Chains Map
_Last updated: 2026-03-31_

This document maps every processing chain that is actually implemented in the
codebase. Only chains that are wired end-to-end in source files are documented
here. References are to the files read: `pipeline.py`, `config.py` (all three
modules), `subtitles.py`, `script.py`, and `constants.ts`.

---

## 1. Script Generation Chain

**Flow:**

```
config["_job_title"] + config["scene_count"] + config["language"]
  → build_enhanced_prompt()            (script.py)
      ├── config["script_prompt_template"]  (admin override) or _SCRIPT_SYSTEM_INSTRUCTION (hardcoded fallback)
      ├── get_category_prompt_enhancement(config["category"])
      └── select_opening_hook(language)     (if config["use_hook_variety"] == True)
  → provider_registry.execute_with_fallback(category="llm", ...)
      input: { prompt, system_instruction, response_format="json",
               temperature=config["script_temperature"],
               max_output_tokens=config["script_max_tokens"] }
  → JSON parse / _fallback_parse_script()
  → _normalize_script()
  → cache.save_json("script", script_data)
```

**Hardcoded values:**
- Default title fallback: `"Yapay Zekanın Geleceği"` (used when `_job_title` absent)
- Language map: `{"tr": "Türkçe", "en": "English", "de": "Deutsch", "fr": "Français", "es": "Español"}`
- Default `scene_count`: 10 (standard_video), 8 (news_bulletin), 8 (product_review)
- Default `duration_hint_seconds` per scene when missing: `random.uniform(15, 22)`
- Fallback narration when scene text absent: `"Sahne {i+1} metni."`
- Minimum scenes in fallback parser: `max(scene_count // 2, 3)`
- Narration truncation in fallback parser: 500 characters per paragraph

**Config keys read by this step:**
`_job_title`, `scene_count`, `language`, `script_prompt_template`,
`category`, `use_hook_variety`, `script_temperature`, `script_max_tokens`

---

## 2. TTS Chain

**Flow:**

```
cache.load_json("script")  →  scenes[]
  for each scene:
    normalize_narration(scene["narration"])     (text.py utility)
    → provider_registry.execute_with_fallback(category="tts", ...)
        input: { text=tts_text, voice=config["tts_voice"] }
    → cache.save_binary("tts", audio_bytes, "scene_{NN}.mp3")
    → collect word_timings + duration_ms from result.data
  → cache.save_json("tts", tts_manifest)
      manifest keys: provider, voice, scene_count,
                     total_duration_seconds, files[]
```

**Hardcoded values:**
- Default voice fallback: `"tr-TR-AhmetNeural"` (when `tts_voice` absent)
- Audio filename pattern: `scene_{scene_num:02d}.{format}` where format comes from provider (`mp3`)
- `duration_sec = duration_ms / 1000.0`
- Step is **fatal** — any scene TTS failure raises `RuntimeError`

**Config keys read by this step:**
`tts_voice`

**Provider wired:**
- Primary: `edge_tts` (default in all three module configs)
- Fallback order controlled by `tts_fallback_order` admin setting (constants.ts default: `["edge_tts", "openai_tts"]`)

---

## 3. Subtitle Chain

**Flow (3-layer timing strategy, in priority order):**

```
cache.load_json("tts")   →  tts_files[]
cache.load_json("script") →  scenes[]   (matched by scene_number, not array index)

for each tts_file:
  normalize_narration(scene.narration)   ← same function as TTS step

  Strategy 1 — TTS Word-Timing (free, primary):
    tts_file["word_timings"] present?
      → _extract_word_timings_from_tts(word_timings, offset_sec)

  Strategy 2 — Whisper API (paid, fallback):
    config["subtitle_use_whisper"] == True AND config["openai_api_key"] present?
      → transcribe_with_whisper(audio_path, api_key, language)
          POST https://api.openai.com/v1/audio/transcriptions
          model="whisper-1", response_format="verbose_json",
          timestamp_granularity[]="word"
      → _extract_word_timings_from_whisper(response, offset_sec)

  Strategy 3 — Equal Distribution (last resort):
    no word_timings from either above?
      → _distribute_words_evenly(narration, duration_sec, offset_sec)

  → append subtitle_entry: { scene_number, text, start_time, end_time,
                              word_timings, timing_source }
  → current_offset_sec += duration_sec

→ cache.save_json("subtitles", subtitles_output)
    output keys: style, style_config, font_size, total_duration,
                 entry_count, timing_source, entries[]
```

**Hardcoded values:**
- Whisper API URL: `https://api.openai.com/v1/audio/transcriptions`
- Whisper model: `whisper-1`
- Whisper cost rate: `$0.006 / minute`
- Default `duration_seconds` per scene if TTS data absent: `15.0`
- Whisper HTTP timeout: `120.0` seconds
- Step is **non-fatal** — errors do not stop the pipeline

**Config keys read by this step:**
`subtitle_style`, `subtitle_font_size`, `subtitle_use_whisper`,
`openai_api_key`, `language`

---

## 4. Provider Fallback Chain

Each pipeline step calls `provider_registry.execute_with_fallback(category=...)`.
The fallback order is controlled at runtime by admin settings. The declared
defaults from `constants.ts` and module `config.py` files are:

| Category | Primary (module default) | Fallback Order (admin default) |
|----------|--------------------------|-------------------------------|
| `llm`     | `kieai` (all modules)    | `["kieai", "gemini"]`          |
| `tts`     | `edge_tts` (all modules) | `["edge_tts", "openai_tts"]`   |
| `visuals` | `pexels` (all modules)   | `["pexels", "pixabay"]`        |

**Pipeline step fatality:**

| Step        | `is_fatal` | Behaviour on failure                         |
|-------------|------------|----------------------------------------------|
| script      | True       | Raises `RuntimeError`, job stops             |
| metadata    | False      | Uses `_fallback_metadata()`, job continues   |
| tts         | True       | Raises `RuntimeError` per scene, job stops   |
| visuals     | True       | Raises if zero real downloads, job stops     |
| subtitles   | False      | Falls back through 3 timing strategies       |
| composition | True       | Raises `RuntimeError`, job stops             |

**Visuals additional rule:** individual scene failures are non-fatal
(placeholder recorded) but if **all** scenes fail, the step raises.

---

## 5. Category System

**6 categories** (defined in `backend/pipeline/steps/script.py`):

| Key          | Turkish Name                  | English Name               |
|--------------|-------------------------------|----------------------------|
| `general`    | Genel                         | General                    |
| `true_crime` | Suç & Gizem                   | True Crime                 |
| `science`    | Bilim & Teknoloji             | Science & Technology       |
| `history`    | Tarih                         | History                    |
| `motivation` | Motivasyon & Kişisel Gelişim  | Motivation & Self-Development |
| `religion`   | Din & Maneviyat               | Religion & Spirituality    |

**How selected:** config key `"category"` (default: `"general"`).

**How it affects the pipeline:** `build_enhanced_prompt()` calls
`get_category_prompt_enhancement(category)` which appends a block containing
`KATEGORI`, `TON`, `ODAK`, and `STIL TALIMATI` fields to the system instruction
sent to the LLM. Category `"general"` skips this block entirely (no appended
text).

---

## 6. Hook Variety System

**Config key:** `"use_hook_variety"` (default: `True`)

**What it does in pipeline:**
When `use_hook_variety` is `True`, `build_enhanced_prompt()` calls
`select_opening_hook(language)` which:
1. Picks a random hook type from 8 available types (language-specific pool: `"tr"` or `"en"`).
2. Avoids repeating the last 6 used hook types (module-level `_used_hook_types` list, max length 6).
3. Resets the exclusion pool when all 8 types have been used.
4. Appends an `ACILIS HOOK TIPI` + `TALIMAT` block to the **user prompt** (not the system instruction).

**8 hook types** (same keys for both `tr` and `en` pools):
`shocking_fact`, `question`, `story`, `contradiction`,
`future_peek`, `comparison`, `personal_address`, `countdown`

**When `use_hook_variety` is `False`:** `hook_instruction` is an empty string;
no hook block is added to the prompt.

---

## 7. Video Composition Chain

**Flow:**

```
cache.load_json("script")    →  scenes[], video title
cache.load_json("tts")       →  tts_files[], total_duration_seconds
cache.load_json("visuals")   →  visual_files[]
cache.load_json("subtitles") →  subtitle entries[], style_config

→ Build Remotion props.json:
    composition   = COMPOSITION_MAP[module_key]
                    ("StandardVideo" | "NewsBulletin" | "ProductReview")
    width/height  = parsed from config["video_resolution"]  (default: 1920×1080)
    fps           = config["video_fps"]                     (default: 30)
    scenes[]      → each scene: narration, visual_url (HTTP via temp file server),
                    audio_url, duration_frames, ken_burns params, subtitles
    subtitleStyle = config["subtitle_style"]
    kenBurnsEnabled = config["ken_burns_enabled"]
    kenBurnsIntensity = config["ken_burns_intensity"]

→ cache.save_json("composition/props", props_data)
→ Start temporary HTTP file server (threading.Thread + ThreadingHTTPServer)
    serves cache directory at localhost:<dynamic_port>
→ asyncio.create_subprocess_exec("npx", "remotion", "render", ...)
→ Copy output MP4 to config["output_dir"] (if set)
→ Stop file server
```

**Hardcoded values:**
- `COMPOSITION_MAP`: `standard_video → "StandardVideo"`, `news_bulletin → "NewsBulletin"`, `product_review → "ProductReview"`
- `DEFAULT_WIDTH = 1920`, `DEFAULT_HEIGHT = 1080`, `DEFAULT_FPS = 30`
- `DEFAULT_SCENE_DURATION = 5.0` seconds (used when TTS duration absent)
- Visual type detection extensions: video = `{.mp4, .webm, .mov, .avi, .mkv}`, image = `{.jpg, .jpeg, .png, .webp, .gif, .bmp}`
- Step is **fatal**

**Config keys read by this step:**
`video_resolution`, `video_fps`, `subtitle_style`, `ken_burns_enabled`,
`ken_burns_intensity`, `output_dir`

---

## 8. Metadata Generation Chain

**Flow:**

```
cache.load_json("script")  →  first 3 scenes (max 100 chars each) as summary
config["_job_title"] + config["language"]
  → provider_registry.execute_with_fallback(category="llm", ...)
      input: { prompt, system_instruction=_METADATA_SYSTEM_INSTRUCTION,
               response_format="json", temperature=0.6,
               max_output_tokens=2048 }
  → JSON parse / _fallback_metadata()
  → setdefault guarantees: youtube_title, youtube_description, tags, category, language
  → cache.save_json("metadata", metadata)
```

**Hardcoded values:**
- `temperature = 0.6` (hardcoded in step, not from config)
- `max_output_tokens = 2048` (hardcoded in step, not from config)
- Fallback metadata category field value: `"Education"`
- Summary uses first 3 scenes, 100 chars each
- Step is **non-fatal**

---

## 9. Subtitle Style Definitions

5 styles are hardcoded in `backend/pipeline/steps/subtitles.py` as `SUBTITLE_STYLES`:

| Key        | Font Color | Position    | Glow  | Highlight Mode |
|------------|------------|-------------|-------|----------------|
| `standard` | `#FFFFFF`  | bottom      | No    | none           |
| `neon_blue`| `#00F5FF`  | center      | Yes (`#00AAFF`) | none  |
| `gold`     | `#FFD700`  | bottom      | Yes (`#FFA500`) | none  |
| `minimal`  | `#FFFFFF`  | bottom_left | No    | none           |
| `hormozi`  | `#FFFFFF`  | center      | No    | word (`#FFD700`) with black bg |

Unknown style name falls back to `"standard"`.
