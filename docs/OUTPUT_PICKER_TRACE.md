# Çıktı Seçici — Uçtan Uca İz

**Date:** 2026-03-31
**Verification method:** Live browser network log + curl backend tests
**Result: PASS — full chain verified**

---

## Chain Under Test

```
UI input → Kaydet click → POST /api/settings/admin/output-folder
  → validate_output_path() → DB upsert → runtime app_settings.output_dir update
  → page reload → GET /api/settings loads persisted value → input shows value
  → FolderPickerDialog → GET /api/admin/directories → "Bu Klasörü Seç"
  → POST /api/settings/admin/open-folder → subprocess.Popen(["open", path])
```

---

## Test Steps & Evidence

### 1. Save via text input

- Typed `/tmp/ui_output_test` into the `output_dir` input (placeholder: `/tam/dizin/yolu`)
- Clicked **Kaydet** button (found at DOM level 2 above input)
- **Network:** `[75517.179] POST /api/settings/admin/output-folder → 200 OK`
- **Response body:**
  ```json
  {
    "path": "/tmp/ui_output_test",
    "absolute_path": "/private/tmp/ui_output_test",
    "exists": true,
    "message": "Output klasörü ayarlandı: /private/tmp/ui_output_test"
  }
  ```
- Input updated to resolved absolute path: `/private/tmp/ui_output_test`

### 2. Persistence after reload

- Full page reload → navigated to `/admin/global-settings`
- `localStorage.setItem('cm-admin-pin', '0000')` set before check
- **Input value after reload:** `/private/tmp/ui_output_test` ✓
- **Network on page load:** `GET /api/settings?scope=admin&scope_id= → 200` returned persisted value

### 3. FolderPickerDialog

- Clicked "Klasör seç" button (title attr)
- **Network:** `[76023.118] GET /api/admin/directories?path=%2Fprivate%2Ftmp%2Fui_output_test → 200`
- Dialog rendered as `div.fixed.inset-0.z-50` overlay (not `role="dialog"`)
- Dialog showed: current path, "..(üst dizin)" nav button, "Bu Klasörü Seç" button
- Clicked "Bu Klasörü Seç" → dialog closed, input value: `/private/tmp/ui_output_test` ✓

### 4. Finder/Explorer button

- Clicked "Klasörü Finder/Explorer'da aç" button
- **Network:** `[76023.119] POST /api/settings/admin/open-folder → 200`
- Backend executes `subprocess.Popen(["open", str(target)])` on macOS ✓

---

## Old Double-Path Bug Status

**Bug:** Previous behavior stored path as `'"/path"'` in DB and some startup paths created `/ContentManager/"/ContentManager/output"/file.mp4`.

**Current status:**
- DB stores `'"/private/tmp/ui_output_test"'` (JSON-encoded string — canonical form)
- `_decode_value()` correctly unwraps: `json.loads('"..."')` → Python string
- `startup`: `strip('"').strip("'")` + `is_absolute()` guard applied
- Last 3 jobs in DB have correct paths (no double-path)
- Old jobs (before fix) still have corrupted `output_path` in DB — historical artifact, not actionable

---

## Code Path (Backend)

| Step | File | Function |
|------|------|----------|
| Validate path | `backend/utils/path_utils.py` | `validate_output_path()` |
| Update runtime | `backend/api/settings.py:set_output_folder` | `app_settings.output_dir = output_path` |
| Persist to DB | `backend/api/settings.py:set_output_folder` | `resolver.upsert("output_dir", str(output_path))` |
| Decode on load | `backend/services/settings_resolver.py:_decode_value` | iterative `json.loads` up to 5x |
| Apply at startup | `backend/main.py:439-457` | `settings.output_dir = resolved_path` |
| Open in Finder | `backend/api/settings.py:open_folder_in_explorer` | `subprocess.Popen(["open", ...])` |

---

## Verdict

| Check | Result |
|-------|--------|
| Save path via text input | PASS |
| Backend validates & resolves path | PASS |
| DB persists correctly | PASS |
| Page reload shows same value | PASS |
| FolderPickerDialog opens & navigates | PASS |
| "Bu Klasörü Seç" populates input | PASS |
| Finder/Explorer button fires API | PASS |
| Old double-path bug | FIXED (new jobs unaffected) |
