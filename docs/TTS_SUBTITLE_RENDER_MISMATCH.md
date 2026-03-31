# TTS/Altyazı Render Uyumsuzluğu — Kök Neden Analizi

**Date:** 2026-03-31
**Severity:** Critical (her videoda 8/10 sahne yanlish altyazi gosteriyor)
**Status:** FIXED

---

## Kullanicinin Gordugu Sorun

Final render edilen videoda:
- Scene 1 TTS "Bugun internetimiz..." okurken ekranda "Ates yokken hayat gercekten acimasizdi / Soguk" yaziyor
- Bu Scene 2'nin altyazisi — 1 sahne kayik

## Onceki Trace Neden Yetersizdi

Onceki trace (2026-03-31) sadece JSON artifact'lari karsilastirdi:
- `step_script.json` narration vs `step_subtitles.json` text → 10/10 match
- TTS word_timings vs subtitle word_timings → 10/10 match

Ama **composition/render katmanini incelemedi**. Sorun pipeline step'lerde degil,
Remotion render katmanindaydi.

---

## Root Cause

**Dosya:** `remotion/src/compositions/StandardVideo.tsx` satir 256-257

**Buggy code:**
```typescript
const subtitleChunk: SubtitleChunk | undefined =
  subtitles && subtitles[scene.index] ? subtitles[scene.index] : undefined;
```

**`scene.index`** = `props.scenes[].index` = `scene_number` from backend (1-based: 1, 2, 3, ..., 10)
**`subtitles`** = 0-based JavaScript array (indices: 0, 1, 2, ..., 9)

Sonuc:
- Scene 1 (`scene.index=1`) → `subtitles[1]` → Scene 2'nin altyazisi
- Scene 2 (`scene.index=2`) → `subtitles[2]` → Scene 3'un altyazisi
- ...
- Scene 9 (`scene.index=9`) → `subtitles[9]` → Scene 10'un altyazisi
- Scene 10 (`scene.index=10`) → `subtitles[10]` → **undefined** (array overflow, altyazi yok)

### Ikincil Bug: Sahne Sayaci

Ayni `scene.index` deger `sceneIndex` prop'u olarak geciyordu:
```typescript
<div>{sceneIndex + 1} / {totalScenes}</div>
```
Scene 1 icin: `1 + 1 = 2` → "2 / 10" gosteriyordu.

---

## Etki Analizi

| Sahne | TTS Okuyor | Ekranda Gosterilen Altyazi | Dogru mu |
|-------|-----------|--------------------------|----------|
| 1 | "Bugun internetimiz..." | "Ates yokken hayat..." (Scene 2) | YANLIS |
| 2 | "Ates yokken hayat..." | "Peki bu donusturucu..." (Scene 3) | YANLIS |
| 3 | "Peki bu donusturucu..." | "Zamanla insanlar..." (Scene 4) | YANLIS |
| 4 | "Zamanla insanlar..." | "Baslangicta atesi..." (Scene 5) | YANLIS |
| 5 | "Baslangicta atesi..." | "Ancak bir gun..." (Scene 6) | YANLIS |
| 6 | "Ancak bir gun..." | "Ates matkabi..." (Scene 7) | YANLIS |
| 7 | "Ates matkabi..." | "Ates sadece..." (Scene 8) | YANLIS* |
| 8 | "Ates sadece..." | "Ates ayni zamanda..." (Scene 9) | YANLIS* |
| 9 | "Ates ayni zamanda..." | "Bugun bile..." (Scene 10) | YANLIS |
| 10 | "Bugun bile..." | (altyazi yok) | YANLIS |

*Scene 7 ve 8 tesadufen ayni kelimeyle ("Ates") basliyor ama **farkli sahnenin tam metni** gosteriliyor.

**10/10 sahne yanlis altyazi gosteriyor.** Son sahnede hic altyazi yok.

---

## Fix

```diff
- {sceneFrames.map(({ scene, from, durationFrames }) => {
-   const subtitleChunk = subtitles && subtitles[scene.index] ? subtitles[scene.index] : undefined;
+ {sceneFrames.map(({ scene, from, durationFrames }, arrayIndex) => {
+   const subtitleChunk = subtitles && subtitles[arrayIndex] ? subtitles[arrayIndex] : undefined;
    return (
      <Sequence
        key={scene.index}
        from={from}
        durationInFrames={durationFrames}
-       name={`Sahne ${scene.index + 1}`}
+       name={`Sahne ${arrayIndex + 1}`}
      >
        <SceneContent
          scene={scene}
-         sceneIndex={scene.index}
+         sceneIndex={arrayIndex}
          ...
```

`arrayIndex` (0-based) artik hem subtitle lookup hem sahne sayaci hem Ken Burns alternation icin kullaniliyor.

---

## Neden Diger Composition'lar Etkilenmedi

- `NewsBulletin.tsx`: `items.map((item, idx))` → `subtitles[idx]` — `idx` zaten 0-based
- `ProductReview.tsx`: `sections.map((section, idx))` → `subtitles[idx]` — `idx` zaten 0-based

Bug sadece `StandardVideo.tsx`'de — `scene.index` (1-based scene_number) dogrudan array index olarak kullanilmisti.

---

## Kanitlar

### Frame Extraction (final.mp4)

- **t=1s (Scene 1):** Ekranda "Ates yokken hayat gercekten acimasizdi / Soguk" — Scene 2'nin altyazisi
- **t=184s (Scene 10):** Ekranda altyazi yok — `subtitles[10]` = undefined (array overflow)
- **Sag ust sayac:** "2 / 10" yaziyordu Scene 1'de (olmasi gereken: "1 / 10")

### props.json Verification

```python
# Scene 1 (scene.index=1): subtitles[1] first word = 'Ates' (WRONG - should be 'Bugun')
# Scene 1 (scene.index=1): subtitles[0] first word = 'Bugun' (CORRECT)
```

---

## Test Sonuclari

```
python3 -m pytest backend/tests/ -q → 100 passed, 1 skipped
npx tsc --noEmit (frontend) → clean
npx tsc --noEmit (remotion) → clean
```
