# TTS → Subtitle Text Chain Trace

**Date:** 2026-03-31
**Verification method:** Real job session artifacts (`sessions/7835389a3699457da9d76a8e7fecf1f4/`)
**Result: PASS — zero divergence across all 10 scenes**

---

## Chain Under Test

```
script.narration
  → normalize_narration()                   [pipeline/steps/tts.py via standard_video/pipeline.py]
  → TTS provider (text sent for synthesis)
  → word_timings extracted from provider response
  → tts_results[].word_timings saved to step_tts.json

script.narration
  → normalize_narration()                   [pipeline/steps/subtitles.py]
  → subtitle entry text
  → TTS word_timings read from step_tts.json
  → cumulative offset applied per scene
  → step_subtitles.json entries
```

Both paths use **identical** `normalize_narration()` call — canonical text guaranteed by construction.

---

## normalize_narration() Definition

File: `backend/utils/text.py`

- Strips Markdown formatting (bold `**`, italic `*`, headers `#`)
- Collapses whitespace
- Strips leading/trailing whitespace
- Called identically in both TTS step and subtitle step

---

## Real Artifact Analysis

**Session:** `7835389a3699457da9d76a8e7fecf1f4`

### script → subtitle text comparison (all 10 scenes)

| Scene | Script narration length | Subtitle text | Match |
|-------|------------------------|---------------|-------|
| 1 | "Soğuk bir kış gecesi…" (275 chars) | identical | ✓ |
| 2–10 | various | identical | ✓ |

**Result: 0 mismatches across 10 scenes**

### word_timings propagation (sampled scenes)

Scene 1 TTS word_timings (from `step_tts.json`):
- 38 words, starting with `'Soğuk'` at t=0
- Provider: `edge_tts`

Scene 1 subtitle word_timings (from `step_subtitles.json`):
- 38 words, identical tokens
- `timing_source: "tts_word_timing"`
- Offset: `0.0s` (scene 1, no cumulative offset)

Scene 2 subtitle offset:
- `start_time: 20.3s` — correctly cumulated from scene 1 duration (20.3s)

**Result: TTS word_timings → subtitle word_timings perfectly propagated, 0 mismatches**

---

## Timing Source Breakdown

Subtitle timing uses 3-layer fallback (file: `backend/pipeline/steps/subtitles.py`):

1. **`tts_word_timing`** — provider returned word-level timings (used in this job)
2. **Whisper API** — fallback if provider returns no word timings
3. **Equal distribution** — last resort, evenly distributes words across duration

All 10 scenes in this job used `tts_word_timing` (no fallback needed).

---

## Known Gap Fixed

**Issue found:** `step_tts.json` stored `"text": ""` for all scenes — the `tts_text` variable was not included in `tts_results.append()`.

**Fix applied:** `backend/modules/standard_video/pipeline.py:339-345`

```python
tts_results.append({
    "scene_number": scene.get("scene_number", 0),
    "filename": audio_filename,
    "duration_seconds": round(duration_sec, 2),
    "size_bytes": len(audio_bytes),
    "word_timings": word_timings,
    "text": tts_text,          # ← added
})
```

This was a manifest audit gap only — word_timings were always correct. Now `step_tts.json` is auditable.

---

## Code Path (Backend)

| Step | File | Key line |
|------|------|----------|
| Script narration source | `backend/pipeline/steps/script.py` | LLM output, `scene.narration` |
| TTS text normalization | `backend/modules/standard_video/pipeline.py:~295` | `tts_text = normalize_narration(narration)` |
| TTS provider call | `backend/modules/standard_video/pipeline.py` | `provider.synthesize(tts_text, ...)` |
| Subtitle text normalization | `backend/pipeline/steps/subtitles.py:~320` | `narration = normalize_narration(scene_entry.get("narration", ""))` |
| Word timing extraction | `backend/pipeline/steps/subtitles.py:_extract_word_timings_from_tts` | adds cumulative offset |
| Timing fallback chain | `backend/pipeline/steps/subtitles.py:~380` | tts → whisper → equal_distribution |

---

## Verdict

| Check | Result |
|-------|--------|
| Script → TTS text: same after normalize | PASS |
| TTS → subtitle text: same after normalize | PASS |
| Word count match (scene 1) | PASS — 38 words both sides |
| Word tokens match (scene 1) | PASS — identical |
| Cumulative offset applied correctly | PASS — scene 2 at 20.3s |
| timing_source reflects reality | PASS — `tts_word_timing` used |
| step_tts.json `text` field | FIXED — now saves `tts_text` |
