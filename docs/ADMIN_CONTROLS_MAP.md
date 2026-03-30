# Admin Controls Map
_Last updated: 2026-03-31_

Maps every admin panel control to its concrete effect on the pipeline.
Only settings that are actually read somewhere in the codebase are included.
Schema source: `frontend/src/lib/constants.ts` (`SYSTEM_SETTINGS_SCHEMA` +
`PROMPT_SETTINGS_SCHEMA`). Pipeline wiring confirmed in `pipeline.py`,
`config.py` (all modules), `subtitles.py`, and `settings_resolver.py`.

---

## System Settings

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `max_concurrent_jobs` | number (1–10) | 2 | Controls how many jobs the background worker runs in parallel. Read by `SettingsResolver` layer 1 global defaults from `app_settings`. |
| `output_dir` | path | `""` | Composition step copies the final MP4 to this directory after render. Empty = no copy. |
| `video_format` | select (`long` / `shorts`) | `long` | UI-level suggestion for new job creation. Affects the resolution preset offered to the user; the resolved `video_resolution` setting determines actual render dimensions. |
| `language` | select (`tr`/`en`/`de`/`fr`/`es`) | `tr` | Default content language injected into `config["language"]`. Affects LLM prompt language name, TTS voice selection, Whisper transcription language, and hook pool selection. |
| `job_timeout_seconds` | number (300–7200) | 1800 | Maximum seconds a job may run before being cancelled by the job manager. |

---

## Pipeline Defaults

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `tts_provider` | select | `edge_tts` | Sets the primary TTS provider passed to `provider_registry.execute_with_fallback(category="tts")`. |
| `llm_provider` | select | `kieai` | Sets the primary LLM provider used for both script and metadata generation steps. |
| `visuals_provider` | select | `pexels` | Sets the primary visuals provider used to search and download scene stock footage. |
| `subtitle_style` | select | `standard` | Selects which of the 5 hardcoded `SUBTITLE_STYLES` is embedded in the subtitles JSON output and passed to Remotion. Options: `standard`, `neon_blue`, `gold`, `minimal`, `hormozi`. |
| `llm_fallback_order` | multiselect | `["kieai", "gemini"]` | Ordered list of LLM providers tried in sequence when the primary fails. Consumed by `ProviderRegistry`. |
| `tts_fallback_order` | multiselect | `["edge_tts", "openai_tts"]` | Ordered list of TTS providers tried in sequence when the primary fails. |
| `visuals_fallback_order` | multiselect | `["pexels", "pixabay"]` | Ordered list of visuals providers tried in sequence when the primary fails. |

---

## Script Settings

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `scene_count` | number (3–20) | 10 | Injected into the LLM system prompt as `{scene_count}`. Also used in `_normalize_script()` and `_fallback_parse_script()` to validate/pad scene lists. Per-module defaults: standard_video=10, news_bulletin=8, product_review=8. |
| `category` | select | `general` | Determines which category block is appended to the LLM system instruction by `get_category_prompt_enhancement()`. `"general"` appends nothing. Other values append KATEGORI/TON/ODAK/STIL_TALIMATI fields. |
| `use_hook_variety` | toggle | `true` | When `true`, `select_opening_hook()` picks one of 8 hook types (avoiding the last 6 used) and appends it to the user prompt. When `false`, no hook instruction is added. |
| `script_temperature` | number (0–2) | 0.8 | LLM `temperature` parameter for the script step. Per-module defaults: standard_video=0.8, news_bulletin=0.6, product_review=0.7. |
| `script_max_tokens` | number (1024–16384) | 4096 | LLM `max_output_tokens` parameter for the script step. All three modules default to 4096. |
| `job_timeout_seconds` | number (300–7200) | 1800 | (Also listed under System Settings — same key, placed in "script" category in UI.) |

---

## Video & Audio Settings

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `tts_voice` | select | `tr-TR-AhmetNeural` | Passed directly as `voice` in the TTS provider `input_data`. Available options: `tr-TR-AhmetNeural`, `tr-TR-EmelNeural`, `en-US-AriaNeural`, `en-US-GuyNeural`, `de-DE-ConradNeural`. |
| `tts_speed` | number (0–3) | 1.0 | TTS speed multiplier. Per-module defaults: standard_video=1.0, news_bulletin=1.05, product_review=1.0. Passed to TTS provider. |
| `video_resolution` | select | `1920x1080` | Parsed by composition step to set Remotion `width` and `height`. Options: `1920x1080` (Full HD), `1080x1920` (Shorts/Vertical), `1280x720` (HD). |
| `video_fps` | select | `30` | Passed to Remotion as `fps`. Options: 24, 30, 60. |
| `subtitle_font_size` | number (24–96) | 48 | Written into the subtitles output JSON as `font_size` and consumed by Remotion for rendering subtitle text size. |
| `subtitle_use_whisper` | toggle | `false` | When `true` AND `openai_api_key` is set, the subtitles step uses OpenAI Whisper API (`whisper-1`) as fallback timing source instead of falling straight to equal-distribution. Cost: $0.006/minute. |
| `ken_burns_enabled` | toggle | `true` (false for news_bulletin) | Passed to Remotion composition props to enable/disable slow zoom-pan on visuals. |
| `ken_burns_intensity` | number (0–1) | 0.05 | Zoom magnitude for Ken Burns effect. Passed to Remotion composition props. `0.05` = subtle, `0.15` = noticeable. |

---

## Prompt Templates

Admin-editable LLM prompt templates stored per module. When a template is set,
it **replaces** the hardcoded `_SCRIPT_SYSTEM_INSTRUCTION` in `pipeline.py`.
Unset (empty) → pipeline falls back to hardcoded instruction.

Supported placeholder variables are listed below (from `constants.ts` placeholders).

| Admin Key | Module | Pipeline Config Key | Variables Supported |
|-----------|--------|---------------------|---------------------|
| `standard_video_script_prompt` | `standard_video` | `script_prompt_template` | `{scene_count}`, `{language_name}` (substituted in `step_script`); also `{topic}` per UI placeholder |
| `standard_video_metadata_prompt` | `standard_video` | _(not yet confirmed wired in metadata step)_ | `{topic}`, `{script_summary}` |
| `news_bulletin_script_prompt` | `news_bulletin` | `script_prompt_template` | `{news_items}` |
| `news_bulletin_metadata_prompt` | `news_bulletin` | _(not yet confirmed wired in metadata step)_ | `{news_summary}` |
| `product_review_script_prompt` | `product_review` | `script_prompt_template` | `{product_name}`, `{product_info}` |
| `product_review_metadata_prompt` | `product_review` | _(not yet confirmed wired in metadata step)_ | `{product_name}` |

> **Note on script prompt wiring:** `step_script()` in `pipeline.py` reads
> `config.get("script_prompt_template", "")`. It applies `str.format(scene_count=...,
> language_name=...)` and swallows unknown placeholder `KeyError`s gracefully.
> The metadata prompt keys are defined in the schema but their wiring into the
> metadata step was not confirmed in the files reviewed.

---

## Provider Fallback Settings (detail)

The 5-layer `SettingsResolver` merges settings in this order (lowest → highest
priority): global defaults → admin → module → provider → user overrides.
`locked=True` admin keys cannot be overridden by user layer.

API keys read from environment (`.env`) at layer 1; admin panel can override:

| Admin Key | Used By |
|-----------|---------|
| `kieai_api_key` | LLM provider `kieai` |
| `openai_api_key` | LLM provider `openai`; also Whisper in subtitles step |
| `elevenlabs_api_key` | TTS provider `elevenlabs` |
| `pexels_api_key` | Visuals provider `pexels` |
