# Admin Controls Map
_Last updated: 2026-03-31 (category/hook override runtime verification + enabled=False bug fix)_

Maps every admin panel control to its concrete effect on the pipeline.
Only settings that are actually read somewhere in the codebase are included.
All wiring claims below were verified by source code audit (2026-03-31).
Schema source: `frontend/src/lib/constants.ts` (`SYSTEM_SETTINGS_SCHEMA` +
`PROMPT_SETTINGS_SCHEMA`). Pipeline wiring confirmed in `pipeline.py`,
`config.py` (all modules), `subtitles.py`, `composition.py`, `runner.py`,
and `edge_tts_provider.py`.

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
| `category` | select | `general` | Determines which category block is appended to the LLM system instruction by `get_category_prompt_enhancement()`. `"general"` appends nothing. Other values append KATEGORI/TON/ODAK/STIL_TALIMATI fields. A category with `enabled=False` override is also silently skipped (same as `general`). The text content of each category can be overridden via **Master Promptlar → Kategoriler** tab — see Category Content Override section below. |
| `use_hook_variety` | toggle | `true` | When `true`, `select_opening_hook()` picks one of 8 hook types (avoiding the last 6 used) and appends it to the user prompt. When `false`, no hook instruction is added. The text content of each hook type can be overridden via **Master Promptlar → Açılış Hook'ları** tab — see Hook Content Override section below. |
| `script_temperature` | number (0–2) | 0.8 | LLM `temperature` parameter for the script step. Per-module defaults: standard_video=0.8, news_bulletin=0.6, product_review=0.7. |
| `script_max_tokens` | number (1024–16384) | 4096 | LLM `max_output_tokens` parameter for the script step. All three modules default to 4096. |
| `job_timeout_seconds` | number (300–7200) | 1800 | (Also listed under System Settings — same key, placed in "script" category in UI.) |

---

## Video & Audio Settings

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `tts_voice` | select | `tr-TR-EmelNeural` | Passed directly as `voice` in the TTS provider `input_data`. Available options: `tr-TR-EmelNeural`, `tr-TR-AhmetNeural`, `en-US-AriaNeural`, `en-US-GuyNeural`, `de-DE-ConradNeural`. Default changed from AhmetNeural to EmelNeural in 2026-03-31 voice resolution fix. |
| `tts_speed` | number (0–3) | 1.0 | TTS speed multiplier. Read by `edge_tts_provider.py:81` as `config.get("tts_speed", 1.0)` and applied as rate offset in Edge TTS synthesis. Other TTS providers (ElevenLabs, OpenAI) receive `config` but may not read this key — effect is guaranteed only for Edge TTS. Per-module defaults: standard_video=1.0, news_bulletin=1.05, product_review=1.0. |
| `video_resolution` | select | `1920x1080` | Parsed by composition step to set Remotion `width` and `height`. Options: `1920x1080` (Full HD), `1080x1920` (Shorts/Vertical), `1280x720` (HD). |
| `video_fps` | select | `30` | Passed to Remotion as `fps`. Options: 24, 30, 60. |
| `subtitle_font_size` | number (24–96) | 48 | Written into the subtitles output JSON as `font_size` and consumed by Remotion for rendering subtitle text size. |
| `subtitle_use_whisper` | toggle | `false` | When `true` AND `openai_api_key` is set, the subtitles step uses OpenAI Whisper API (`whisper-1`) as fallback timing source instead of falling straight to equal-distribution. Cost: $0.006/minute. |
| `ken_burns_enabled` | toggle | `true` (false for news_bulletin) | Passed to Remotion composition props to enable/disable slow zoom-pan on visuals. |
| `ken_burns_intensity` | number (0–1) | 0.05 | Zoom magnitude for Ken Burns effect. Passed to Remotion composition props. `0.05` = subtle, `0.15` = noticeable. |

---

## Prompt Templates

Admin-editable LLM prompt templates stored per module. When a template is set,
it **replaces** the hardcoded system instruction. Unset (empty) → pipeline falls
back to hardcoded instruction.

**UI surface (2026-03-31):** All prompt templates are managed exclusively via the
**Master Promptlar** page (`/admin/prompts`, `PromptManager.tsx`). The GlobalSettings
page no longer contains prompt fields — the duplicate `PromptTemplatesCard` component
was removed.

**Save path:** PromptManager saves with `scope="module"`, `scope_id=<module_key>`,
`key=script_prompt_template` (or `metadata_prompt_template`). The `runner.py` aliasing
(`{module_key}_script_prompt → script_prompt_template`) remains in place for backwards
compatibility with any admin-scope records already in the database.

| Key Saved by PromptManager | Module | Pipeline Config Key | Variables Supported | Wiring Status |
|---------------------------|--------|---------------------|---------------------|---------------|
| `script_prompt_template` (scope=module, standard_video) | `standard_video` | `script_prompt_template` | `{scene_count}`, `{language_name}` | **WIRED** — `standard_video/pipeline.py:step_script` |
| `metadata_prompt_template` (scope=module, standard_video) | `standard_video` | `metadata_prompt_template` | _(free text)_ | **WIRED** — `standard_video/pipeline.py:step_metadata` |
| `script_prompt_template` (scope=module, news_bulletin) | `news_bulletin` | `script_prompt_template` | `{scene_count}`, `{language_name}` | **WIRED** — `news_bulletin/pipeline.py:step_script_bulletin` |
| `metadata_prompt_template` (scope=module, news_bulletin) | `news_bulletin` | `metadata_prompt_template` | _(free text)_ | **WIRED** — reuses `step_metadata` |
| `script_prompt_template` (scope=module, product_review) | `product_review` | `script_prompt_template` | `{scene_count}`, `{pros_count}`, `{cons_count}`, `{score_range}`, `{language_name}` | **WIRED** — `product_review/pipeline.py:step_script_review` |
| `metadata_prompt_template` (scope=module, product_review) | `product_review` | `metadata_prompt_template` | _(free text)_ | **WIRED** — reuses `step_metadata` |

**Fallback behaviour:** If the template field is empty or blank, the hardcoded
system instruction is used without modification. Unknown `{placeholder}` values
in custom templates are silently ignored (`KeyError` caught, template used as-is).

---

---

## Category Content Override

**UI surface:** Master Promptlar → Kategoriler tab (`/admin/prompts`).
**API:** `GET /api/admin/categories`, `PUT /api/admin/categories/{key}`.
**Storage:** `settings` table, `scope=admin`, `scope_id=""`, `key=category_content_{key}`.

**System type: Override/Edit. NOT full CRUD.**

| Capability | Supported? | Notes |
|---|---|---|
| View all categories | YES | Hardcoded 6: general, true_crime, science, history, motivation, religion |
| Edit tone/focus/style_instruction | YES | Override stored in DB; pipeline reads via `load_overrides_from_db()` |
| Enable/disable category | YES | `enabled=False` → `build_enhanced_prompt()` skips enhancement. Bug fixed 2026-03-31. |
| Reset to hardcoded default | YES | Empty body + `enabled=True` → DB row deleted |
| Add new category | NO | Hardcoded set, requires Python code change |
| Delete existing category | NO | Hardcoded set, removing from DB only removes override |
| Rename category key | NO | Keys are fixed identifiers |

**Runtime wiring (verified 2026-03-31):**
```
PUT /api/admin/categories/{key} → settings table
runner.py:141 → load_overrides_from_db(db) [every pipeline start]
build_enhanced_prompt() → _get_effective_category() → override merged
enabled=False → enhancement block skipped entirely
```

**Hardcoded category set:** `general`, `true_crime`, `science`, `history`, `motivation`, `religion`.
`general` never adds enhancement regardless of override — the `category != "general"` guard in `build_enhanced_prompt()` ensures this.

---

## Hook Content Override

**UI surface:** Master Promptlar → Açılış Hook'ları tab (`/admin/prompts`).
**API:** `GET /api/admin/hooks/{lang}`, `PUT /api/admin/hooks/{hook_type}/{lang}`.
**Storage:** `settings` table, `scope=admin`, `scope_id=""`, `key=hook_content_{type}_{lang}`.

**System type: Override/Edit. NOT full CRUD.**

| Capability | Supported? | Notes |
|---|---|---|
| View all hooks (tr + en) | YES | Hardcoded 8 types per language |
| Edit hook name/template | YES | Override stored in DB |
| Enable/disable individual hook | YES | `enabled=False` → filtered from pipeline hook pool by `_get_effective_hooks()` |
| Reset to hardcoded default | YES | Empty body + `enabled=True` → DB row deleted |
| All hooks disabled → fallback | YES | `_get_effective_hooks()` returns full base list if filtered result is empty |
| Add new hook type | NO | Hardcoded set, requires Python code change |
| Delete existing hook type | NO | Hardcoded set |

**Runtime wiring (verified 2026-03-31):**
```
PUT /api/admin/hooks/{type}/{lang} → settings table
runner.py:141 → load_overrides_from_db(db) [every pipeline start]
select_opening_hook() → _get_effective_hooks() → filtered + override applied
```

**Hardcoded hook types:** `shocking_fact`, `question`, `story`, `contradiction`, `future_peek`, `comparison`, `personal_address`, `countdown`.

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
