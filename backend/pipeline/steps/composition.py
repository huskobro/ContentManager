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
import re
import shutil
import threading
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from http.server import HTTPServer
from pathlib import Path
from typing import Any

from backend.config import settings as app_settings
from backend.pipeline.cache import CacheManager
from backend.utils.logger import get_logger
from backend.services.job_manager import sse_hub

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


class _ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Her request'i ayrı thread'de handle eden HTTP server."""
    daemon_threads = True


class _SilentHandler(SimpleHTTPRequestHandler):
    """Log yazdırmayan HTTP handler."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass  # Sessiz — ana log'a karışmasın


def _start_media_server(directory: Path) -> tuple[_ThreadingHTTPServer, int]:
    """
    Verilen dizini serve eden geçici bir threaded HTTP file server başlatır.

    Boş bir port seçer, background thread'de çalıştırır.
    Returns: (server_instance, port)
    """
    handler = partial(_SilentHandler, directory=str(directory.resolve()))
    server = _ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def _safe_path(path: Path, base_url: str | None = None, public_dir: Path | None = None) -> str:
    """
    Dosya mevcutsa URL veya absolute path döndürür.

    base_url + public_dir verilmişse dosyayı HTTP URL olarak döndürür
    (ör. "http://127.0.0.1:9876/step_tts/scene_01.mp3").
    """
    if not path.exists():
        log.warning("Dosya bulunamadı, boş yol kullanılıyor", path=str(path))
        return ""
    if base_url and public_dir:
        try:
            rel = str(path.resolve().relative_to(public_dir.resolve()))
            return f"{base_url}/{rel}"
        except ValueError:
            pass
    return str(path.resolve())


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
    base_url: str | None = None,
    public_dir: Path | None = None,
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
            "audioSrc": _safe_path(tts_path, base_url, public_dir),
            "durationInSeconds": duration,
            "visualSrc": _safe_path(vis_path, base_url, public_dir),
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
    base_url: str | None = None,
    public_dir: Path | None = None,
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
            "audioSrc": _safe_path(tts_path, base_url, public_dir),
            "visualSrc": _safe_path(vis_path, base_url, public_dir),
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
    base_url: str | None = None,
    public_dir: Path | None = None,
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
            "audioSrc": _safe_path(tts_path, base_url, public_dir),
            "visualSrc": _safe_path(vis_path, base_url, public_dir),
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

    # ── 3. Medya dosyaları için HTTP file server başlat ──────────────────

    # Remotion render sırasında headless browser medya dosyalarını HTTP ile yükler.
    # Session dizinini serve eden geçici bir HTTP server başlatıyoruz.
    session_dir = cache.base_dir

    media_server, media_port = _start_media_server(session_dir)
    base_url = f"http://127.0.0.1:{media_port}"

    log.info(
        "Medya dosya sunucusu başlatıldı",
        job_id=job_id[:8],
        base_url=base_url,
        serve_dir=str(session_dir),
    )

    # ── 4. Props oluştur ───────────────────────────────────────────────────

    builder = _PROPS_BUILDERS.get(module_name, _build_standard_video_props)
    props = builder(
        config=config,
        script_data=script_data,
        tts_data=tts_data,
        visuals_data=visuals_data,
        subtitles_data=subtitles_data,
        cache=cache,
        base_url=base_url,
        public_dir=session_dir,
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
        "--timeout=120000",
    ]

    # Concurrency: medya dosyaları lokal HTTP server'dan yükleniyor,
    # çok fazla paralel tab server'ı boğabilir
    concurrency = config.get("render_concurrency", 2)
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
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(remotion_root),
            )

            stdout_lines: list[str] = []
            stderr_lines: list[str] = []

            # Render progress state (shared between coroutines)
            render_progress_state: dict[str, Any] = {
                "rendered_frames": 0,
                "total_frames": 0,
                "encoded_frames": 0,
                "phase": "bundling",   # bundling | rendering | encoding | done
                "last_pct": -1,
            }

            # Remotion stdout formatları:
            #   "Bundling 65%"
            #   "Rendering frame 120 (10 frames rendered)"
            #   "Rendering frame 1200/1500 (80%)"
            #   "Encoded 300 frames"
            #   "Time remaining: 1 min 23 sec"
            _RE_BUNDLING   = re.compile(r"Bundling\s+(\d+)%", re.IGNORECASE)
            _RE_RENDERING  = re.compile(r"Rendering.*?(\d+)/(\d+)", re.IGNORECASE)
            _RE_RENDERING2 = re.compile(r"Rendering\s+frame\s+(\d+)\s+\((\d+)\s+frames", re.IGNORECASE)
            _RE_ENCODED    = re.compile(r"Encoded\s+(\d+)\s+frames?", re.IGNORECASE)
            _RE_REMAINING  = re.compile(r"Time remaining[:\s]+(.+)", re.IGNORECASE)
            _RE_STITCHING  = re.compile(r"(Stitching|Muxing|Encoding video)", re.IGNORECASE)

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

                    # ── Progress parsing ──────────────────────────────────
                    progress_event: dict[str, Any] | None = None

                    m = _RE_BUNDLING.search(line)
                    if m:
                        pct = int(m.group(1))
                        if pct != render_progress_state["last_pct"]:
                            render_progress_state["phase"] = "bundling"
                            render_progress_state["last_pct"] = pct
                            progress_event = {
                                "phase": "bundling",
                                "bundling_pct": pct,
                                "rendered_frames": 0,
                                "total_frames": 0,
                                "overall_pct": round(pct * 0.1, 1),  # bundling = 0-10%
                                "eta": None,
                            }

                    m = _RE_RENDERING.search(line)
                    if m:
                        cur = int(m.group(1))
                        total = int(m.group(2))
                        render_progress_state["rendered_frames"] = cur
                        render_progress_state["total_frames"] = total
                        render_progress_state["phase"] = "rendering"
                        overall = round(10 + (cur / total * 70), 1) if total else 0
                        progress_event = {
                            "phase": "rendering",
                            "rendered_frames": cur,
                            "total_frames": total,
                            "overall_pct": overall,
                            "eta": None,
                        }

                    m = _RE_RENDERING2.search(line)
                    if m and not _RE_RENDERING.search(line):
                        cur = int(m.group(1))
                        total_so_far = int(m.group(2))
                        render_progress_state["rendered_frames"] = cur
                        render_progress_state["phase"] = "rendering"
                        progress_event = {
                            "phase": "rendering",
                            "rendered_frames": cur,
                            "total_frames": render_progress_state["total_frames"],
                            "overall_pct": None,
                            "eta": None,
                        }

                    m = _RE_ENCODED.search(line)
                    if m:
                        enc = int(m.group(1))
                        render_progress_state["encoded_frames"] = enc
                        render_progress_state["phase"] = "encoding"
                        total = render_progress_state["total_frames"]
                        overall = round(80 + (enc / total * 18), 1) if total else 80
                        progress_event = {
                            "phase": "encoding",
                            "encoded_frames": enc,
                            "total_frames": total,
                            "overall_pct": overall,
                            "eta": None,
                        }

                    m = _RE_STITCHING.search(line)
                    if m:
                        render_progress_state["phase"] = "encoding"
                        progress_event = {
                            "phase": "encoding",
                            "encoded_frames": render_progress_state["encoded_frames"],
                            "total_frames": render_progress_state["total_frames"],
                            "overall_pct": 90,
                            "eta": None,
                        }

                    # ETA satırını mevcut progress_event'e ekle
                    m = _RE_REMAINING.search(line)
                    if m:
                        eta_str = m.group(1).strip()
                        if progress_event is None:
                            progress_event = {
                                "phase": render_progress_state["phase"],
                                "rendered_frames": render_progress_state["rendered_frames"],
                                "total_frames": render_progress_state["total_frames"],
                                "overall_pct": None,
                                "eta": eta_str,
                            }
                        else:
                            progress_event["eta"] = eta_str

                    # SSE'ye yayınla (değişiklik varsa)
                    if progress_event is not None:
                        await sse_hub.publish(job_id, "render_progress", progress_event)

            await asyncio.gather(
                _read_stream(process.stdout, stdout_lines, "stdout"),
                _read_stream(process.stderr, stderr_lines, "stderr"),
            )

            # Render tamamlandı — %100 sinyali gönder
            await sse_hub.publish(job_id, "render_progress", {
                "phase": "done",
                "rendered_frames": render_progress_state["total_frames"],
                "total_frames": render_progress_state["total_frames"],
                "overall_pct": 100,
                "eta": None,
            })

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

    finally:
        # Medya dosya sunucusunu kapat
        media_server.shutdown()
        log.debug("Medya dosya sunucusu kapatıldı", job_id=job_id[:8])

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

    # ── 10. Videoyu output klasörüne kopyala ───────────────────────────────

    final_output_path = output_path  # Varsayılan: sessions içinde
    try:
        output_folder = app_settings.output_dir
        output_folder.mkdir(parents=True, exist_ok=True)

        # Çıktı dosyası adı: {job_id[:8]}.mp4
        output_filename = f"{job_id[:8]}.mp4"
        output_file_path = output_folder / output_filename

        # Eğer dosya zaten varsa (job rerun) → uyarı loguyla
        if output_file_path.exists():
            log.warning(
                "Video output dosyası üzerine yazılıyor (job rerun)",
                job_id=job_id[:8],
                output_file=str(output_file_path),
                previous_size_mb=round(output_file_path.stat().st_size / (1024 * 1024), 2),
            )

        # Dosyayı kopyala
        shutil.copy2(str(output_path), str(output_file_path))
        final_output_path = output_file_path

        log.info(
            "Video output klasörüne kopyalandı",
            job_id=job_id[:8],
            output_file=str(output_file_path),
            output_size_mb=round(output_file_path.stat().st_size / (1024 * 1024), 2),
        )
    except Exception as e:
        log.warning(
            "Video output klasörüne kopyalanırken hata oluştu (session klasöründe kalacak)",
            job_id=job_id[:8],
            error=str(e),
        )
        # Hata olsa bile render başarılı sayılır, final_output_path session'da kalır

    return {
        "provider": "remotion",
        "output_path": str(final_output_path.resolve()),
        "total_duration": round(total_duration, 3),
        "composition_id": composition_id,
        "render_elapsed_sec": round(render_elapsed, 2),
        "output_size_bytes": output_size,
        "cost_estimate_usd": 0.0,
    }
