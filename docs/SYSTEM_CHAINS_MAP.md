# Sistem Zinciri Haritası
_Last updated: 2026-03-31 (category/hook full CRUD — DB-backed resolution chains, config["_db"] injection, bootstrap seeding)_

Bu doküman, kod tabanında gerçekten uygulanmış her işleme zincirini eşler. Yalnızca kaynak dosyalarda uçtan uca bağlı zincirler belgelenir. Referanslar okunan dosyalara aittir: `pipeline.py`, `config.py` (tüm üç modül), `subtitles.py`, `script.py` ve `constants.ts`.

---

## 1. Senaryo Üretim Zinciri

**Akış:**

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

**Sabit kodlu değerler:**
- Default title fallback: `"Yapay Zekanın Geleceği"` (used when `_job_title` absent)
- Language map: `{"tr": "Türkçe", "en": "English", "de": "Deutsch", "fr": "Français", "es": "Español"}`
- Default `scene_count`: 10 (standard_video), 8 (news_bulletin), 8 (product_review)
- Default `duration_hint_seconds` per scene when missing: `random.uniform(15, 22)`
- Fallback narration when scene text absent: `"Sahne {i+1} metni."`
- Minimum scenes in fallback parser: `max(scene_count // 2, 3)`
- Narration truncation in fallback parser: 500 characters per paragraph

**Bu adımda okunan config anahtarları:**
`_job_title`, `scene_count`, `language`, `script_prompt_template`,
`category`, `use_hook_variety`, `script_temperature`, `script_max_tokens`

---

## 2. TTS Zinciri

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

**Sabit kodlu değerler:**
- Default voice fallback: `app_settings.default_tts_voice` → `"tr-TR-EmelNeural"` (overridable via `.env`). Both `edge_tts_provider.py` and `standard_video/pipeline.py` use `config.get("tts_voice") or _app_settings.default_tts_voice` — no hardcoded string.
- Audio filename pattern: `scene_{scene_num:02d}.{format}` where format comes from provider (`mp3`)
- `duration_sec = duration_ms / 1000.0`
- Step is **fatal** — any scene TTS failure raises `RuntimeError`

**Bu adımda okunan config anahtarları:**
`tts_voice`

**Provider wired:**
- Primary: `edge_tts` (default in all three module configs)
- Fallback order controlled by `tts_fallback_order` admin setting (constants.ts default: `["edge_tts", "openai_tts"]`)

---

## 3. Altyazı Zinciri

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

**Sabit kodlu değerler:**
- Whisper API URL: `https://api.openai.com/v1/audio/transcriptions`
- Whisper model: `whisper-1`
- Whisper cost rate: `$0.006 / minute`
- Default `duration_seconds` per scene if TTS data absent: `15.0`
- Whisper HTTP timeout: `120.0` seconds
- Step is **non-fatal** — errors do not stop the pipeline

**Bu adımda okunan config anahtarları:**
`subtitle_style`, `subtitle_font_size`, `subtitle_use_whisper`,
`openai_api_key`, `language`

---

## 4. Sağlayıcı Fallback Zinciri

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

## 5. Kategori Sistemi

**6 builtin categories** seeded at startup into the `categories` table (`backend/models/category.py`).
Admin can add custom categories and edit/disable any category via the CRUD API.

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
`_get_effective_category(key, db=None)` and then `get_category_prompt_enhancement()` to
append a block containing `KATEGORI`, `TON`, `ODAK`, and `STIL TALIMATI` to the LLM
system instruction.

**Skipped when:** `category == "general"` OR `_get_effective_category()["enabled"] == False`.

**Resolution chain (2026-03-31):**

```
_get_effective_category(key, db=None)
  ├── db provided (config["_db"] injected by runner.py)
  │     └── query categories table WHERE key=key
  │           → returns ORM row as dict (tone, focus, style_instruction, enabled, is_builtin)
  └── db=None (no DB available, e.g. tests or direct calls)
        └── hardcoded fallback dict in script.py
```

**Bootstrap seeding:** `_seed_categories_and_hooks(db)` called in `main.py` lifespan inserts
the 6 builtin categories as `is_builtin=True` if not already present. Idempotent.

**config["_db"] injection:** `runner.py` sets `config["_db"] = db` before calling the pipeline.
`standard_video/pipeline.py` passes `db=config.get("_db")` to script step functions.

**System type: Full CRUD** — builtin 6 categories (`is_builtin=True`) cannot be deleted (403);
custom categories are fully deletable.

---

## 6. Hook Çeşitlilik Sistemi

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

**Resolution chain (2026-03-31):**

```
_get_effective_hooks(language, db=None)
  ├── db provided (config["_db"] injected by runner.py)
  │     └── query hooks table WHERE lang=language AND enabled=True
  │           → returns list of hook dicts (type, name, template)
  │           → if result is empty → falls back to hardcoded base list for language
  └── db=None (no DB available)
        └── hardcoded fallback list in script.py, filtered by enabled flag in memory
```

**Bootstrap seeding:** `_seed_categories_and_hooks(db)` inserts 8 types × 2 languages as
`is_builtin=True` on first startup. Idempotent.

Individual hooks can be disabled via `PUT /api/admin/hooks/{type}/{lang}` (`enabled=false`).
Disabled hooks are excluded from `_get_effective_hooks()` — if all hooks are disabled,
the full hardcoded base list is returned as fallback.

**System type: Full CRUD** — builtin 8×2 hooks (`is_builtin=True`) cannot be deleted (403);
custom hooks are fully deletable.

---

## 7. Video Kompozisyon Zinciri

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

**Sabit kodlu değerler:**
- `COMPOSITION_MAP`: `standard_video → "StandardVideo"`, `news_bulletin → "NewsBulletin"`, `product_review → "ProductReview"`
- `DEFAULT_WIDTH = 1920`, `DEFAULT_HEIGHT = 1080`, `DEFAULT_FPS = 30`
- `DEFAULT_SCENE_DURATION = 5.0` seconds (used when TTS duration absent)
- Visual type detection extensions: video = `{.mp4, .webm, .mov, .avi, .mkv}`, image = `{.jpg, .jpeg, .png, .webp, .gif, .bmp}`
- Step is **fatal**

**Bu adımda okunan config anahtarları:**
`video_resolution`, `video_fps`, `subtitle_style`, `ken_burns_enabled`,
`ken_burns_intensity`, `output_dir`

---

## 8. Metadata Üretim Zinciri

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

**Sabit kodlu değerler:**
- `temperature = 0.6` (hardcoded in step, not from config)
- `max_output_tokens = 2048` (hardcoded in step, not from config)
- Fallback metadata category field value: `"Education"`
- Summary uses first 3 scenes, 100 chars each
- Step is **non-fatal**

---

## 9. Altyazı Stil Tanımları

5 styles are hardcoded in `backend/pipeline/steps/subtitles.py` as `SUBTITLE_STYLES`:

| Key        | Font Color | Position    | Glow  | Highlight Mode |
|------------|------------|-------------|-------|----------------|
| `standard` | `#FFFFFF`  | bottom      | No    | none           |
| `neon_blue`| `#00F5FF`  | center      | Yes (`#00AAFF`) | none  |
| `gold`     | `#FFD700`  | bottom      | Yes (`#FFA500`) | none  |
| `minimal`  | `#FFFFFF`  | bottom_left | No    | none           |
| `hormozi`  | `#FFFFFF`  | center      | No    | word (`#FFD700`) with black bg |

Unknown style name falls back to `"standard"`.
