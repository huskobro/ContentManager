"""
Pipeline Cache Manager — Adım çıktılarının oturum bazlı önbelleklenmesi.

Her pipeline işi (job) için sessions/{job_id}/ klasörü altında
adım çıktıları JSON, text veya binary olarak saklanır. Pipeline runner
bir adımı çalıştırmadan önce CacheManager üzerinden cache kontrolü yapar;
eğer geçerli bir çıktı varsa adım atlanır (idempotent execution).

Dosya yapısı:
    sessions/{job_id}/
        step_script.json          ← Script üretimi çıktısı
        step_metadata.json        ← Metadata çıktısı
        step_tts/                 ← TTS çıktıları (sahne bazlı)
            scene_01.wav
            scene_02.wav
        step_visuals/             ← Görsel çıktıları (sahne bazlı)
            scene_01.mp4
            scene_02.jpg
        step_subtitles.json       ← Altyazı verisi
        step_composition/         ← Final video
            final.mp4

Tasarım kararları:
    • Sade dosya sistemi tabanlı — harici cache backend yok
    • JSON çıktılar sıkıştırılmaz (okunabilirlik + debugging)
    • Binary dosyalar (wav, mp4) olduğu gibi saklanır
    • Cache invalidation yok — job yeniden çalıştırılırsa çıktılar üzerine yazılır
    • Thread-safe değil (asyncio tek-thread event loop yeterli)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.config import settings as app_settings
from backend.utils.logger import get_logger

log = get_logger(__name__)


class CacheManager:
    """
    Belirli bir job'a ait ara çıktıları dosya sisteminde yönetir.

    Her CacheManager instance'ı tek bir job_id'ye bağlıdır ve o işin
    session dizininde okuma/yazma işlemi yapar.

    Args:
        job_id: Pipeline işinin benzersiz kimliği.
        session_dir: Opsiyonel — önceden oluşturulmuş session dizini.
                     Verilmezse sessions/{job_id} kullanılır.
    """

    def __init__(self, job_id: str, session_dir: Path | None = None) -> None:
        self._job_id = job_id
        self._base_dir = session_dir or (app_settings.sessions_dir / job_id)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    # ── Properties ──────────────────────────────────────────────────────────

    @property
    def job_id(self) -> str:
        """Bu cache'in bağlı olduğu job kimliği."""
        return self._job_id

    @property
    def base_dir(self) -> Path:
        """Session kök dizini (sessions/{job_id}/)."""
        return self._base_dir

    # ── JSON kaydetme / okuma ───────────────────────────────────────────────

    def save_json(self, step_key: str, data: Any, filename: str | None = None) -> Path:
        """
        Bir pipeline adımının JSON çıktısını kaydeder.

        Args:
            step_key: Adım anahtarı (ör. "script", "metadata").
            data: JSON-serializable Python nesnesi.
            filename: Opsiyonel dosya adı. Verilmezse step_{step_key}.json kullanılır.

        Returns:
            Kaydedilen dosyanın tam yolu.
        """
        if filename:
            file_path = self._step_dir(step_key) / filename
        else:
            file_path = self._base_dir / f"step_{step_key}.json"

        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        log.debug(
            "Cache JSON kaydedildi",
            job_id=self._job_id[:8],
            step=step_key,
            path=str(file_path),
            size_bytes=file_path.stat().st_size,
        )

        return file_path

    def load_json(self, step_key: str, filename: str | None = None) -> Any | None:
        """
        Bir pipeline adımının JSON çıktısını okur.

        Args:
            step_key: Adım anahtarı.
            filename: Opsiyonel dosya adı. Verilmezse step_{step_key}.json aranır.

        Returns:
            JSON-decoded Python nesnesi, veya dosya yoksa None.
        """
        if filename:
            file_path = self._step_dir(step_key) / filename
        else:
            file_path = self._base_dir / f"step_{step_key}.json"

        if not file_path.exists():
            return None

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        log.debug(
            "Cache JSON okundu",
            job_id=self._job_id[:8],
            step=step_key,
            path=str(file_path),
        )

        return data

    # ── Text kaydetme / okuma ───────────────────────────────────────────────

    def save_text(self, step_key: str, content: str, filename: str | None = None) -> Path:
        """
        Bir pipeline adımının düz metin çıktısını kaydeder.

        Args:
            step_key: Adım anahtarı.
            content: Kaydedilecek metin.
            filename: Opsiyonel dosya adı. Verilmezse step_{step_key}.txt kullanılır.

        Returns:
            Kaydedilen dosyanın tam yolu.
        """
        if filename:
            file_path = self._step_dir(step_key) / filename
        else:
            file_path = self._base_dir / f"step_{step_key}.txt"

        file_path.parent.mkdir(parents=True, exist_ok=True)

        file_path.write_text(content, encoding="utf-8")

        log.debug(
            "Cache text kaydedildi",
            job_id=self._job_id[:8],
            step=step_key,
            path=str(file_path),
        )

        return file_path

    def load_text(self, step_key: str, filename: str | None = None) -> str | None:
        """
        Bir pipeline adımının düz metin çıktısını okur.

        Returns:
            Metin içeriği, veya dosya yoksa None.
        """
        if filename:
            file_path = self._step_dir(step_key) / filename
        else:
            file_path = self._base_dir / f"step_{step_key}.txt"

        if not file_path.exists():
            return None

        return file_path.read_text(encoding="utf-8")

    # ── Binary kaydetme / okuma ─────────────────────────────────────────────

    def save_binary(self, step_key: str, data: bytes, filename: str) -> Path:
        """
        Bir pipeline adımının binary çıktısını kaydeder (wav, mp4, jpg vb.).

        Args:
            step_key: Adım anahtarı.
            data: Binary veri.
            filename: Dosya adı (uzantı dahil, ör. "scene_01.wav").

        Returns:
            Kaydedilen dosyanın tam yolu.
        """
        file_path = self._step_dir(step_key) / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)

        file_path.write_bytes(data)

        log.debug(
            "Cache binary kaydedildi",
            job_id=self._job_id[:8],
            step=step_key,
            filename=filename,
            size_bytes=len(data),
        )

        return file_path

    def load_binary(self, step_key: str, filename: str) -> bytes | None:
        """
        Bir pipeline adımının binary çıktısını okur.

        Returns:
            Binary veri, veya dosya yoksa None.
        """
        file_path = self._step_dir(step_key) / filename

        if not file_path.exists():
            return None

        return file_path.read_bytes()

    # ── Cache kontrol ───────────────────────────────────────────────────────

    def has_output(self, step_key: str, filename: str | None = None) -> bool:
        """
        Belirli bir adımın cache'lenmiş çıktısı var mı?

        Args:
            step_key: Adım anahtarı.
            filename: Opsiyonel dosya adı. Verilmezse step_{step_key}.json kontrol edilir.

        Returns:
            True ise dosya mevcut ve boyutu > 0.
        """
        if filename:
            file_path = self._step_dir(step_key) / filename
        else:
            file_path = self._base_dir / f"step_{step_key}.json"

        return file_path.exists() and file_path.stat().st_size > 0

    def get_output_path(self, step_key: str, filename: str | None = None) -> Path:
        """
        Bir adımın çıktı dosya yolunu döndürür (var olup olmadığına bakmaz).

        Session dizinine göreceli (relative) yol değil, tam (absolute) yol döner.
        """
        if filename:
            return self._step_dir(step_key) / filename
        return self._base_dir / f"step_{step_key}.json"

    def get_relative_path(self, step_key: str, filename: str | None = None) -> str:
        """
        Çıktı dosya yolunu session dizinine göreceli string olarak döndürür.
        JobStep.output_artifact alanında saklanmak üzere kullanılır.
        """
        abs_path = self.get_output_path(step_key, filename)
        try:
            return str(abs_path.relative_to(self._base_dir))
        except ValueError:
            return str(abs_path)

    def list_step_files(self, step_key: str) -> list[Path]:
        """
        Bir adıma ait tüm cache dosyalarını listeler.

        Hem step_{step_key}.json hem de step_{step_key}/ dizini altındaki
        dosyalar dahil edilir.
        """
        files: list[Path] = []

        # Tekil dosya
        single = self._base_dir / f"step_{step_key}.json"
        if single.exists():
            files.append(single)

        single_txt = self._base_dir / f"step_{step_key}.txt"
        if single_txt.exists():
            files.append(single_txt)

        # Dizin altındaki dosyalar
        step_dir = self._step_dir(step_key)
        if step_dir.exists() and step_dir.is_dir():
            files.extend(sorted(step_dir.iterdir()))

        return files

    # ── Temizlik ────────────────────────────────────────────────────────────

    def clear_step(self, step_key: str) -> int:
        """
        Belirli bir adımın tüm cache dosyalarını siler.

        Returns:
            Silinen dosya sayısı.
        """
        files = self.list_step_files(step_key)
        count = 0

        for f in files:
            if f.is_file():
                f.unlink()
                count += 1

        # Boş dizini de temizle
        step_dir = self._step_dir(step_key)
        if step_dir.exists() and step_dir.is_dir() and not any(step_dir.iterdir()):
            step_dir.rmdir()

        if count > 0:
            log.info(
                "Step cache temizlendi",
                job_id=self._job_id[:8],
                step=step_key,
                deleted_files=count,
            )

        return count

    # ── Yardımcı ────────────────────────────────────────────────────────────

    def _step_dir(self, step_key: str) -> Path:
        """Bir adıma ait alt dizin yolunu döndürür: sessions/{job_id}/step_{step_key}/"""
        return self._base_dir / f"step_{step_key}"

    def __repr__(self) -> str:
        return f"<CacheManager job={self._job_id[:8]}… dir={self._base_dir}>"
