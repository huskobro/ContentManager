"""
Composition Adımı — Remotion CLI ile Final Video Render.

Önceki pipeline adımlarından (script, tts, visuals, subtitles) gelen
tüm varlıkları toplar, Remotion-uyumlu props.json oluşturur ve
Remotion CLI'ı çağırarak final MP4 videoyu render eder.

Desteklenen composition tipleri:
  - StandardVideo: Genel amaçlı video formatı
  - NewsBulletin: Haber bülteni formatı
  - ProductReview: Ürün inceleme formatı

Render süreci asyncio.create_subprocess_exec ile asenkron yürütülür;
stdout/stderr logger'a aktarılır.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.config import settings as app_settings
from backend.pipeline.cache import CacheManager
from backend.utils.logger import get_logger

log = get_logger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Sabitler
# ─────────────────────────────────────────────────────────────────────────────

COMPOSITION_MAP: dict[str, str] = {
    "standard_video": "StandardVideo",
    "news_bulletin": "NewsBulletin",
    "product_review": "ProductReview",
}

DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080
DEFAULT_FPS = 30
DEFAULT_SCENE_DURATION = 5.0


# ─────────────────────────────────────────────────────────────────────────────
# Yardımcı Fonksiyonlar
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_visual_type(file_type: str | None, filename: str | None) -> str:
    """
    Dosya türünü belirler: "video" veya "image".

    file_type MIME tipi (ör. "video/mp4") veya dosya uzantısı ile tespit eder.
    """
    if file_type:
        ft_lower = file_type.lower()
        if "video" in ft_lower:
            return "video"
        if "image" in ft_lower:
            return "image"

    if filename:
        ext = Path(filename).suffix.lower()
        if ext in (".mp4", ".webm", ".mov", ".avi", ".mkv"):
            return "video"
        if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"):
            return "image"

    return "video"


def _safe_path(path: Path) -> str:
    """Dosya mevcutsa mutlak yolunu, yoksa boş string döndürür."""
    if path.exists():
        return str(path.resolve())
    log.warning("Dosya bulunamadı, boş yol kullanılıyor", path=str(path))
    return ""


def _safe_duration(value: float | int | None) -> float:
    """Süre değerini kontrol eder; 0 veya None ise varsayılan döndürür."""
    if value and float(value) > 0:
        return float(value)
    return DEFAULT_SCENE_DURATION


def _compute_total_duration(durations: list[float]) -> float:
    """Sahne sürelerinin toplamını döndürür."""
    return round(sum(durations), 3)


def _build_subtitle_chunks(
    subtitle_entries: list[dict[str, Any]],
    scene_start_times: list[float],
) -> list[dict[str, Any]]:
    """
    step_subtitles.json entry'lerini Remotion SubtitleChunk formatına dönüştürür.

    Her entry'nin word_timings değerleri sahneye göreceli hale getirilir
    (sahne başlangıç zamanı çıkarılır).

    Args:
        subtitle_entries: step_subtitles.json'daki "entries" listesi.
        scene_start_times: Her sahnenin global başlangıç zamanı (saniye).

    Returns:
        [{words: [{text, start, end}]}, ...] formatında chunk listesi.
    """
    chunks: list[dict[str, Any]] = []

    for i, entry in enumerate(subtitle_entries):
        word_timings = entry.get("word_timings", [])
        scene_offset = scene_start_times[i] if i < len(scene_start_times) else 0.0

        words = []
        for wt in word_timings:
            words.append({
                "text": wt.get("word", ""),
                "start": round(wt.get("start", 0.0) - scene_offset, 3),
                "end": round(wt.get("end", 0.0) - scene_offset, 3),
            })

        chunks.append({"words": words})

    return chunks


# ─────────────────────────────────────────────────────────────────────────────
# Props Builder'lar — Her Composition Tipi İçin
# ─────────────────────────────────────────────────────────────────────────────

def _build_standard_video_props(
    config: dict[str, Any],
    script_data: dict[str, Any],
    tts_data: dict[str, Any],
    visuals_data: dict[str, Any],
    subtitles_data: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """StandardVideo composition için props dict'i oluşturur."""
    scenes_raw = script_data.get("scenes", [])
    tts_files = tts_data.get("files", [])
    visual_files = visuals_data.get("files", [])
    subtitle_entries = subtitles_data.get("entries", [])

    # TTS ve visual dosyalarını sahne numarasına göre indexle
    tts_by_scene: dict[int, dict] = {f["scene_number"]: f for f in tts_files}
    vis_by_scene: dict[int, dict] = {f["scene_number"]: f for f in visual_files}

    scenes = []
    scene_start_times: list[float] = []
    current_time = 0.0

    for scene in scenes_raw:
        scene_num = scene.get("scene_number", len(scenes) + 1)
        narration = scene.get("narration", "")

        # TTS dosya yolu ve süre
        tts_info = tts_by_scene.get(scene_num, {})
        tts_filename = tts_info.get("filename", f"scene_{scene_num:02d}.mp3")
        tts_path = cache.get_output_path("tts", tts_filename)
        duration = _safe_duration(tts_info.get("duration_seconds"))

        # Visual dosya yolu ve tür
        vis_info = vis_by_scene.get(scene_num, {})
        vis_filename = vis_info.get("filename", f"scene_{scene_num:02d}.mp4")
        vis_path = cache.get_output_path("visuals", vis_filename)
        visual_type = _resolve_visual_type(
            vis_info.get("file_type"),
            vis_filename,
        )

        scene_start_times.append(current_time)
        current_time += duration

        scenes.append({
            "index": scene_num,
            "narration": narration,
            "audioSrc": _safe_path(tts_path),
            "durationInSeconds": duration,
            "visualSrc": _safe_path(vis_path),
            "visualType": visual_type,
        })

    # Altyazı chunk'ları
    subtitle_chunks = _build_subtitle_chunks(subtitle_entries, scene_start_times)

    resolution = config.get("video_resolution", "1920x1080")
    res_parts = resolution.split("x")
    width = int(res_parts[0]) if len(res_parts) == 2 else DEFAULT_WIDTH
    height = int(res_parts[1]) if len(res_parts) == 2 else DEFAULT_HEIGHT
    fps = config.get("video_fps", DEFAULT_FPS)

    return {
        "title": config.get("_job_title", "Untitled Video"),
        "scenes": scenes,
        "subtitles": subtitle_chunks,
        "subtitleStyle": subtitles_data.get("style", "standard"),
        "settings": {"width": width, "height": height, "fps": fps},
        "kenBurnsEnabled": config.get("ken_burns_enabled", True),
        "kenBurnsZoom": config.get("ken_burns_intensity", 0.15),
    }


def _build_news_bulletin_props(
    config: dict[str, Any],
    script_data: dict[str, Any],
    tts_data: dict[str, Any],
    visuals_data: dict[str, Any],
    subtitles_data: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """NewsBulletin composition için props dict'i oluşturur."""
    scenes_raw = script_data.get("scenes", [])
    tts_files = tts_data.get("files", [])
    visual_files = visuals_data.get("files", [])
    subtitle_entries = subtitles_data.get("entries", [])

    tts_by_scene: dict[int, dict] = {f["scene_number"]: f for f in tts_files}
    vis_by_scene: dict[int, dict] = {f["scene_number"]: f for f in visual_files}

    items = []
    scene_start_times: list[float] = []
    current_time = 0.0

    for scene in scenes_raw:
        scene_num = scene.get("scene_number", len(items) + 1)

        tts_info = tts_by_scene.get(scene_num, {})
        tts_filename = tts_info.get("filename", f"scene_{scene_num:02d}.mp3")
        tts_path = cache.get_output_path("tts", tts_filename)
        duration = _safe_duration(tts_info.get("duration_seconds"))

        vis_info = vis_by_scene.get(scene_num, {})
        vis_filename = vis_info.get("filename", f"scene_{scene_num:02d}.mp4")
        vis_path = cache.get_output_path("visuals", vis_filename)
        visual_type = _resolve_visual_type(
            vis_info.get("file_type"),
            vis_filename,
        )

        scene_start_times.append(current_time)
        current_time += duration

        items.append({
            "headline": scene.get("visual_keyword", f"Haber {scene_num}"),
            "narration": scene.get("narration", ""),
            "audioSrc": _safe_path(tts_path),
            "visualSrc": _safe_path(vis_path),
            "visualType": visual_type,
            "durationInSeconds": duration,
            "category": scene.get("category", ""),
            "source": scene.get("source", ""),
        })

    subtitle_chunks = _build_subtitle_chunks(subtitle_entries, scene_start_times)

    resolution = config.get("video_resolution", "1920x1080")
    res_parts = resolution.split("x")
    width = int(res_parts[0]) if len(res_parts) == 2 else DEFAULT_WIDTH
    height = int(res_parts[1]) if len(res_parts) == 2 else DEFAULT_HEIGHT
    fps = config.get("video_fps", DEFAULT_FPS)

    return {
        "title": config.get("_job_title", "Haber Bülteni"),
        "items": items,
        "subtitles": subtitle_chunks,
        "subtitleStyle": subtitles_data.get("style", "standard"),
        "settings": {"width": width, "height": height, "fps": fps},
        "dateStamp": datetime.now().strftime("%Y-%m-%d"),
    }


def _build_product_review_props(
    config: dict[str, Any],
    script_data: dict[str, Any],
    tts_data: dict[str, Any],
    visuals_data: dict[str, Any],
    subtitles_data: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """ProductReview composition için props dict'i oluşturur."""
    scenes_raw = script_data.get("scenes", [])
    tts_files = tts_data.get("files", [])
    visual_files = visuals_data.get("files", [])
    subtitle_entries = subtitles_data.get("entries", [])

    tts_by_scene: dict[int, dict] = {f["scene_number"]: f for f in tts_files}
    vis_by_scene: dict[int, dict] = {f["scene_number"]: f for f in visual_files}

    # Bölüm tipleri sırasıyla atanır
    section_types = ["hook", "overview", "pros", "cons", "verdict"]

    sections = []
    scene_start_times: list[float] = []
    current_time = 0.0

    for idx, scene in enumerate(scenes_raw):
        scene_num = scene.get("scene_number", idx + 1)

        tts_info = tts_by_scene.get(scene_num, {})
        tts_filename = tts_info.get("filename", f"scene_{scene_num:02d}.mp3")
        tts_path = cache.get_output_path("tts", tts_filename)
        duration = _safe_duration(tts_info.get("duration_seconds"))

        vis_info = vis_by_scene.get(scene_num, {})
        vis_filename = vis_info.get("filename", f"scene_{scene_num:02d}.mp4")
        vis_path = cache.get_output_path("visuals", vis_filename)
        visual_type = _resolve_visual_type(
            vis_info.get("file_type"),
            vis_filename,
        )

        scene_start_times.append(current_time)
        current_time += duration

        # Bölüm tipi: scene'den gelirse kullan, yoksa sıraya göre ata
        section_type = scene.get(
            "section_type",
            section_types[idx] if idx < len(section_types) else "overview",
        )

        sections.append({
            "type": section_type,
            "heading": scene.get("visual_keyword", f"Bölüm {scene_num}"),
            "narration": scene.get("narration", ""),
            "audioSrc": _safe_path(tts_path),
            "visualSrc": _safe_path(vis_path),
            "visualType": visual_type,
            "durationInSeconds": duration,
        })

    subtitle_chunks = _build_subtitle_chunks(subtitle_entries, scene_start_times)

    resolution = config.get("video_resolution", "1920x1080")
    res_parts = resolution.split("x")
    width = int(res_parts[0]) if len(res_parts) == 2 else DEFAULT_WIDTH
    height = int(res_parts[1]) if len(res_parts) == 2 else DEFAULT_HEIGHT
    fps = config.get("video_fps", DEFAULT_FPS)

    return {
        "title": config.get("_job_title", "Ürün İnceleme"),
        "productName": config.get("_product_name", config.get("_job_title", "")),
        "overallScore": config.get("review_score", 0),
        "sections": sections,
        "subtitles": subtitle_chunks,
        "subtitleStyle": subtitles_data.get("style", "standard"),
        "settings": {"width": width, "height": height, "fps": fps},
    }


# Props builder dispatch tablosu
_PROPS_BUILDERS: dict[str, Any] = {
    "standard_video": _build_standard_video_props,
    "news_bulletin": _build_news_bulletin_props,
    "product_review": _build_product_review_props,
}


# ─────────────────────────────────────────────────────────────────────────────
# Ana Pipeline Step Fonksiyonu
# ─────────────────────────────────────────────────────────────────────────────

async def step_composition_remotion(
    job_id: str,
    step_key: str,
    config: dict[str, Any],
    cache: CacheManager,
) -> dict[str, Any]:
    """
    Composition Adımı — Remotion CLI ile final video render.

    Önceki adımlardan gelen tüm varlıkları toplayarak props.json oluşturur,
    ardından Remotion CLI'ı çağırarak MP4 render çıktısı üretir.

    Args:
        job_id: Pipeline işinin benzersiz kimliği.
        step_key: Bu adımın anahtarı (genelde "composition").
        config: Çözümlenmiş pipeline konfigürasyonu.
        cache: Bu job'a ait CacheManager instance'ı.

    Returns:
        Render sonuç bilgilerini içeren dict:
          - provider: "remotion"
          - output_path: Final MP4 dosya yolu
          - total_duration: Video toplam süresi (saniye)
          - composition_id: Kullanılan Remotion composition ID
          - cost_estimate_usd: Tahmini maliyet (yerel render = 0)

    Raises:
        RuntimeError: Önceki adım verileri eksikse veya Remotion render başarısız olursa.
    """
    log.info(
        "Composition adımı başlatılıyor",
        job_id=job_id[:8],
        step=step_key,
    )

    # ── 1. Önceki adım verilerini yükle ────────────────────────────────────

    script_data = cache.load_json("script")
    tts_data = cache.load_json("tts")
    visuals_data = cache.load_json("visuals")
    subtitles_data = cache.load_json("subtitles")

    if not script_data:
        raise RuntimeError(
            "Script verisi bulunamadı — composition öncesinde script adımı tamamlanmalı."
        )
    if not tts_data:
        raise RuntimeError(
            "TTS verisi bulunamadı — composition öncesinde TTS adımı tamamlanmalı."
        )
    if not visuals_data:
        raise RuntimeError(
            "Visuals verisi bulunamadı — composition öncesinde visuals adımı tamamlanmalı."
        )
    if not subtitles_data:
        log.warning(
            "Subtitles verisi bulunamadı, boş altyazı kullanılacak",
            job_id=job_id[:8],
        )
        subtitles_data = {"entries": [], "style": "standard"}

    # ── 2. Composition ID belirleme ────────────────────────────────────────

    module_name = config.get("_module_name", "standard_video")
    composition_id = COMPOSITION_MAP.get(module_name, "StandardVideo")

    log.info(
        "Composition tipi belirlendi",
        job_id=job_id[:8],
        module=module_name,
        composition_id=composition_id,
    )

    # ── 3. Props oluştur ───────────────────────────────────────────────────

    builder = _PROPS_BUILDERS.get(module_name, _build_standard_video_props)
    props = builder(
        config=config,
        script_data=script_data,
        tts_data=tts_data,
        visuals_data=visuals_data,
        subtitles_data=subtitles_data,
        cache=cache,
    )

    # ── 4. props.json yaz ──────────────────────────────────────────────────

    comp_dir = cache.base_dir / f"step_{step_key}"
    comp_dir.mkdir(parents=True, exist_ok=True)

    props_path = comp_dir / "props.json"
    with open(props_path, "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False, indent=2)

    log.info(
        "Props dosyası yazıldı",
        job_id=job_id[:8],
        path=str(props_path),
        size_bytes=props_path.stat().st_size,
    )

    # ── 5. Remotion proje dizinini belirle ─────────────────────────────────

    remotion_root = Path(__file__).resolve().parent.parent.parent.parent / "remotion"

    if not remotion_root.exists():
        raise RuntimeError(
            f"Remotion proje dizini bulunamadı: {remotion_root}"
        )

    # ── 6. Çıktı dosya yolu ───────────────────────────────────────────────

    output_path = comp_dir / "final.mp4"

    # ── 7. npx kontrolü ───────────────────────────────────────────────────

    npx_path = shutil.which("npx")
    if npx_path is None:
        log.error(
            "npx bulunamadı — Node.js ve npm yüklü olmalı",
            job_id=job_id[:8],
        )
        return {
            "provider": "remotion",
            "error": "npx bulunamadı — Node.js ve npm yüklü olmalı",
            "output_path": "",
            "total_duration": 0,
            "composition_id": composition_id,
            "cost_estimate_usd": 0.0,
        }

    # ── 8. Remotion CLI komutunu oluştur ───────────────────────────────────

    resolution = config.get("video_resolution", "1920x1080")
    res_parts = resolution.split("x")
    width = int(res_parts[0]) if len(res_parts) == 2 else DEFAULT_WIDTH
    height = int(res_parts[1]) if len(res_parts) == 2 else DEFAULT_HEIGHT
    fps = config.get("video_fps", DEFAULT_FPS)

    cmd = [
        npx_path,
        "remotion",
        "render",
        "src/index.ts",
        composition_id,
        str(output_path.resolve()),
        f"--props={props_path.resolve()}",
        f"--width={width}",
        f"--height={height}",
        f"--fps={fps}",
    ]

    # Ek Remotion CLI argümanları (opsiyonel)
    concurrency = config.get("render_concurrency")
    if concurrency:
        cmd.append(f"--concurrency={concurrency}")

    codec = config.get("codec", "h264")
    cmd.append(f"--codec={codec}")

    log.info(
        "Remotion render başlatılıyor",
        job_id=job_id[:8],
        composition_id=composition_id,
        output=str(output_path),
        width=width,
        height=height,
        fps=fps,
    )

    # ── 9. Remotion CLI'ı asenkron çalıştır ────────────────────────────────

    render_start = datetime.now()

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(remotion_root),
        )

        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        # stdout'u oku ve logla
        async def _read_stream(
            stream: asyncio.StreamReader,
            target: list[str],
            level: str,
        ) -> None:
            while True:
                line_bytes = await stream.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                target.append(line)
                if level == "stdout":
                    log.debug("Remotion stdout", line=line[:200])
                else:
                    log.debug("Remotion stderr", line=line[:200])

        await asyncio.gather(
            _read_stream(process.stdout, stdout_lines, "stdout"),
            _read_stream(process.stderr, stderr_lines, "stderr"),
        )

        return_code = await process.wait()

    except FileNotFoundError:
        log.error(
            "Remotion CLI çalıştırılamadı",
            job_id=job_id[:8],
            cmd=cmd[0],
        )
        return {
            "provider": "remotion",
            "error": "Remotion CLI çalıştırılamadı — npx veya remotion paketi bulunamadı",
            "output_path": "",
            "total_duration": 0,
            "composition_id": composition_id,
            "cost_estimate_usd": 0.0,
        }

    render_elapsed = (datetime.now() - render_start).total_seconds()

    # ── 10. Sonuç kontrolü ─────────────────────────────────────────────────

    if return_code != 0:
        stderr_text = "\n".join(stderr_lines[-50:])  # Son 50 satır
        log.error(
            "Remotion render başarısız",
            job_id=job_id[:8],
            return_code=return_code,
            stderr=stderr_text[:2000],
        )
        raise RuntimeError(
            f"Remotion render başarısız (exit code {return_code}):\n{stderr_text[:2000]}"
        )

    if not output_path.exists():
        raise RuntimeError(
            f"Remotion render tamamlandı ancak çıktı dosyası bulunamadı: {output_path}"
        )

    output_size = output_path.stat().st_size

    # Toplam süre hesapla
    total_duration = 0.0
    settings_data = props.get("settings", {})
    if "scenes" in props:
        total_duration = sum(s["durationInSeconds"] for s in props["scenes"])
    elif "items" in props:
        total_duration = sum(it["durationInSeconds"] for it in props["items"])
    elif "sections" in props:
        total_duration = sum(sec["durationInSeconds"] for sec in props["sections"])

    log.info(
        "Remotion render tamamlandı",
        job_id=job_id[:8],
        composition_id=composition_id,
        output_path=str(output_path),
        output_size_mb=round(output_size / (1024 * 1024), 2),
        total_duration_sec=round(total_duration, 2),
        render_elapsed_sec=round(render_elapsed, 2),
    )

    return {
        "provider": "remotion",
        "output_path": str(output_path.resolve()),
        "total_duration": round(total_duration, 3),
        "composition_id": composition_id,
        "render_elapsed_sec": round(render_elapsed, 2),
        "output_size_bytes": output_size,
        "cost_estimate_usd": 0.0,
    }
