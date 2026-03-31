# Admin Kontrol Haritası
_Last updated: 2026-03-31 (category/hook full CRUD — separate ORM tables, bootstrap seeding, builtin protection)_

Admin panel'deki her kontrolü pipeline'a olan somut etkisiyle eşleştirir.
Yalnızca kaynak kodda gerçekten okunan ayarlar dahildir.
Tüm bağlantı iddiaları kaynak kodu denetimiyle doğrulanmıştır (2026-03-31).
Şema kaynağı: `frontend/src/lib/constants.ts` (`SYSTEM_SETTINGS_SCHEMA` +
`PROMPT_SETTINGS_SCHEMA`). Pipeline bağlantısı `pipeline.py`,
`config.py` (tüm modüller), `subtitles.py`, `composition.py`, `runner.py`
ve `edge_tts_provider.py` dosyalarında doğrulanmıştır.

---

## Sistem Ayarları

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `max_concurrent_jobs` | number (1–10) | 2 | Controls how many jobs the background worker runs in parallel. Read by `SettingsResolver` layer 1 global defaults from `app_settings`. |
| `output_dir` | path | `""` | Composition step copies the final MP4 to this directory after render. Empty = no copy. |
| `video_format` | select (`long` / `shorts`) | `long` | UI-level suggestion for new job creation. Affects the resolution preset offered to the user; the resolved `video_resolution` setting determines actual render dimensions. |
| `language` | select (`tr`/`en`/`de`/`fr`/`es`) | `tr` | Default content language injected into `config["language"]`. Affects LLM prompt language name, TTS voice selection, Whisper transcription language, and hook pool selection. |
| `job_timeout_seconds` | number (300–7200) | 1800 | Maximum seconds a job may run before being cancelled by the job manager. |

---

## Pipeline Varsayılanları

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

## Senaryo Ayarları

| Admin Key | Type | Default | Pipeline Effect |
|-----------|------|---------|-----------------|
| `scene_count` | number (3–20) | 10 | Injected into the LLM system prompt as `{scene_count}`. Also used in `_normalize_script()` and `_fallback_parse_script()` to validate/pad scene lists. Per-module defaults: standard_video=10, news_bulletin=8, product_review=8. |
| `category` | select | `general` | Determines which category block is appended to the LLM system instruction by `get_category_prompt_enhancement()`. `"general"` appends nothing. Other values append KATEGORI/TON/ODAK/STIL_TALIMATI fields. A category with `enabled=False` override is also silently skipped (same as `general`). The text content of each category can be overridden via **Master Promptlar → Kategoriler** tab — see Category Content Override section below. |
| `use_hook_variety` | toggle | `true` | When `true`, `select_opening_hook()` picks one of 8 hook types (avoiding the last 6 used) and appends it to the user prompt. When `false`, no hook instruction is added. The text content of each hook type can be overridden via **Master Promptlar → Açılış Hook'ları** tab — see Hook Content Override section below. |
| `script_temperature` | number (0–2) | 0.8 | LLM `temperature` parameter for the script step. Per-module defaults: standard_video=0.8, news_bulletin=0.6, product_review=0.7. |
| `script_max_tokens` | number (1024–16384) | 4096 | LLM `max_output_tokens` parameter for the script step. All three modules default to 4096. |
| `job_timeout_seconds` | number (300–7200) | 1800 | (Also listed under System Settings — same key, placed in "script" category in UI.) |

---

## Video ve Ses Ayarları

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

## Prompt Şablonları

Her modül için ayrı saklanan, admin tarafından düzenlenebilen LLM prompt şablonları. Şablon ayarlandığında sabit kodlu sistem talimatının **yerini alır**. Ayarlanmamış (boş) bırakılırsa pipeline sabit kodlu talimata geri döner.

**UI yüzeyi (2026-03-31):** Tüm prompt şablonları yalnızca **Master Promptlar** sayfasından yönetilir (`/admin/prompts`, `PromptManager.tsx`). GlobalSettings sayfası artık prompt alanı içermez — yinelenen `PromptTemplatesCard` bileşeni kaldırıldı.

**Kaydetme yolu:** PromptManager `scope="module"`, `scope_id=<module_key>`, `key=script_prompt_template` (veya `metadata_prompt_template`) ile kaydeder. `runner.py`'deki takma ad (`{module_key}_script_prompt → script_prompt_template`) veritabanında halihazırda bulunan admin-scope kayıtları için geriye dönük uyumluluk adına korunmaktadır.

| Key Saved by PromptManager | Module | Pipeline Config Key | Variables Supported | Wiring Status |
|---------------------------|--------|---------------------|---------------------|---------------|
| `script_prompt_template` (scope=module, standard_video) | `standard_video` | `script_prompt_template` | `{scene_count}`, `{language_name}` | **WIRED** — `standard_video/pipeline.py:step_script` |
| `metadata_prompt_template` (scope=module, standard_video) | `standard_video` | `metadata_prompt_template` | _(free text)_ | **WIRED** — `standard_video/pipeline.py:step_metadata` |
| `script_prompt_template` (scope=module, news_bulletin) | `news_bulletin` | `script_prompt_template` | `{scene_count}`, `{language_name}` | **WIRED** — `news_bulletin/pipeline.py:step_script_bulletin` |
| `metadata_prompt_template` (scope=module, news_bulletin) | `news_bulletin` | `metadata_prompt_template` | _(free text)_ | **WIRED** — reuses `step_metadata` |
| `script_prompt_template` (scope=module, product_review) | `product_review` | `script_prompt_template` | `{scene_count}`, `{pros_count}`, `{cons_count}`, `{score_range}`, `{language_name}` | **WIRED** — `product_review/pipeline.py:step_script_review` |
| `metadata_prompt_template` (scope=module, product_review) | `product_review` | `metadata_prompt_template` | _(free text)_ | **WIRED** — reuses `step_metadata` |

**Geri dönüş davranışı:** Şablon alanı boş veya boşluktan oluşuyorsa, sabit kodlu sistem talimatı değiştirilmeden kullanılır. Özel şablonlardaki bilinmeyen `{placeholder}` değerleri sessizce görmezden gelinir (`KeyError` yakalanır, şablon olduğu gibi kullanılır).

---

---

## Kategori CRUD

**UI yüzeyi:** Master Promptlar → Kategoriler sekmesi (`/admin/prompts`, `PromptManager.tsx`).
**API:** Tam CRUD — `GET`, `POST`, `PUT`, `DELETE /api/admin/categories[/{key}]`.
**Depolama:** `categories` tablosu (ayrı ORM modeli — `backend/models/category.py`). Artık `settings` tablosunda saklanmıyor.

**Sistem tipi: Yerleşik koruma ile tam CRUD.**

### ORM Alanları

| Alan | Tür | Notlar |
|---|---|---|
| `key` | string (PK) | Benzersiz tanımlayıcı, ör. `science`, `true_crime` |
| `name_tr` | string | Türkçe görünen ad |
| `name_en` | string | İngilizce görünen ad |
| `tone` | string | LLM ton talimatı |
| `focus` | string | LLM odak talimatı |
| `style_instruction` | string | LLM stil talimatı |
| `enabled` | bool | `False` → pipeline iyileştirmeyi atlar |
| `is_builtin` | bool | Tohumlanmış 6 kategori için `True` — silinemez |
| `sort_order` | int | UI'daki görüntülenme sırası |

### Mevcut İşlemler

| İşlem | Destekleniyor mu? | Notlar |
|---|---|---|
| Tüm kategorileri listele | EVET | `GET /api/admin/categories` — yerleşikler dahil tüm satırları döner |
| Özel kategori oluştur | EVET | `POST /api/admin/categories` → 201; key zaten varsa 409 |
| Herhangi bir kategoriyi düzenle | EVET | `PUT /api/admin/categories/{key}` → 200; bulunamazsa 404 |
| Kategoriyi etkinleştir/devre dışı bırak | EVET | `PUT` ile `enabled=false` → pipeline iyileştirmeyi atlar |
| Özel kategoriyi sil | EVET | `DELETE /api/admin/categories/{key}` → `is_builtin=False` için 200 |
| Yerleşik kategoriyi sil | HAYIR | `is_builtin=True` üzerinde `DELETE` → **403 Forbidden** |
| Kategori key'ini yeniden adlandır | HAYIR | Key'ler sabit tanımlayıcılardır (PK) |

### Bootstrap Tohumlama

İlk başlatmada `_seed_categories_and_hooks(db)` (`main.py` lifespan'ında çağrılır) 6 sabit kodlu kategoriyi `is_builtin=True` olarak ekler (zaten yoksa). Tohumlama idempotent'tir — sonraki başlatmalarda mevcut satırlar atlanır.

**Yerleşik kategori seti:** `general`, `true_crime`, `science`, `history`, `motivation`, `religion`.
`general` içerikten bağımsız olarak asla iyileştirme eklemez — `build_enhanced_prompt()` içindeki `category != "general"` koruması bunu sağlar.

### Çalışma Zamanı Bağlantısı (doğrulandı 2026-03-31)

```
POST/PUT/DELETE /api/admin/categories[/{key}] → categories table (ORM)
runner.py → config["_db"] = db  [injected at pipeline start]
standard_video/pipeline.py → passes db=config.get("_db") to script step
build_enhanced_prompt() → _get_effective_category(key, db=db)
  ├── db provided → query categories table
  └── db=None → hardcoded fallback dict
enabled=False → enhancement block skipped entirely
```

---

## Hook CRUD (Açılış Hook'ları)

**UI yüzeyi:** Master Promptlar → Açılış Hook'ları sekmesi (`/admin/prompts`, `PromptManager.tsx`).
**API:** Tam CRUD — `GET /api/admin/hooks/{lang}`, `POST /api/admin/hooks`, `PUT /api/admin/hooks/{type}/{lang}`, `DELETE /api/admin/hooks/{type}/{lang}`.
**Depolama:** `hooks` tablosu (ayrı ORM modeli — `backend/models/hook.py`). Artık `settings` tablosunda saklanmıyor.

**Sistem tipi: Yerleşik koruma ile tam CRUD.**

### ORM Alanları

| Alan | Tür | Notlar |
|---|---|---|
| `type` | string (bileşik PK) | Hook tipi anahtarı, ör. `shocking_fact`, `question` |
| `lang` | string (bileşik PK) | Dil kodu: `tr` veya `en` |
| `name` | string | UI'da gösterilen görünen ad |
| `template` | string | Kullanıcı promptuna eklenen hook talimat metni |
| `enabled` | bool | `False` → pipeline hook havuzundan çıkarılır |
| `is_builtin` | bool | Tohumlanmış 8×2 hook için `True` — silinemez |

### Mevcut İşlemler

| İşlem | Destekleniyor mu? | Notlar |
|---|---|---|
| Bir dil için tüm hook'ları listele | EVET | `GET /api/admin/hooks/{lang}` — o dildeki tüm satırları döner |
| Özel hook oluştur | EVET | `POST /api/admin/hooks` → 201; type+lang zaten varsa 409; geçersiz dilde 400 |
| Herhangi bir hook'u düzenle | EVET | `PUT /api/admin/hooks/{type}/{lang}` → 200; bulunamazsa 404 |
| Tek hook'u etkinleştir/devre dışı bırak | EVET | `PUT` ile `enabled=false` → pipeline havuzundan çıkarılır |
| Tüm hook'lar devre dışı → geri dönüş | EVET | `_get_effective_hooks()` filtre sonucu boşsa tam temel listeyi döner |
| Özel hook'u sil | EVET | `is_builtin=False` üzerinde `DELETE` → 200 |
| Yerleşik hook'u sil | HAYIR | `is_builtin=True` üzerinde `DELETE` → **403 Forbidden** |

### Bootstrap Tohumlama

İlk başlatmada `_seed_categories_and_hooks(db)`, 8 hook tipi × 2 dil (`tr`/`en`) için `is_builtin=True` olarak kayıt ekler (zaten yoksa).

**Yerleşik hook tipleri:** `shocking_fact`, `question`, `story`, `contradiction`, `future_peek`, `comparison`, `personal_address`, `countdown`.

### Çalışma Zamanı Bağlantısı (doğrulandı 2026-03-31)

```
POST/PUT/DELETE /api/admin/hooks[/{type}/{lang}] → hooks table (ORM)
runner.py → config["_db"] = db  [injected at pipeline start]
standard_video/pipeline.py → passes db=config.get("_db") to script step
select_opening_hook() → _get_effective_hooks(language, db=db)
  ├── db provided → query hooks table, filter enabled=True
  └── db=None → hardcoded fallback list
_get_effective_hooks() returns full base list if all hooks are disabled
```

---

## Provider Fallback Ayarları (Detay)

5 katmanlı `SettingsResolver` ayarları şu sırayla birleştirir (düşük → yüksek öncelik): global varsayılanlar → admin → modül → provider → kullanıcı override'ları. `locked=True` olan admin anahtarları kullanıcı katmanı tarafından geçersiz kılınamaz.

API anahtarları ortamdan (`.env`) katman 1'de okunur; admin paneli override edebilir:

| Admin Key | Used By |
|-----------|---------|
| `kieai_api_key` | LLM provider `kieai` |
| `openai_api_key` | LLM provider `openai`; also Whisper in subtitles step |
| `elevenlabs_api_key` | TTS provider `elevenlabs` |
| `pexels_api_key` | Visuals provider `pexels` |
