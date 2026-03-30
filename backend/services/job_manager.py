"""
Job Manager — İş yaşam döngüsü yönetim servisi.

Sorumluluklar:
  • Job CRUD (oluşturma, listeleme, tekil sorgulama)
  • Job durum geçişleri (queued → running → completed | failed | cancelled)
  • JobStep yönetimi (oluşturma, güncelleme, durum takibi)
  • Session dizin oluşturma ve yönetimi
  • Resolved settings snapshot kaydetme
  • SSE event yayınlama (in-memory asyncio.Queue tabanlı)
  • Global SSE hub — tüm job değişikliklerini yayınlar (list/dashboard için)
  • Job Worker Loop — QUEUED işleri max_concurrent_jobs limitine göre başlatır

Tasarım kararları:
  • Harici broker yok — SQLite tek kaynak, asyncio in-process
  • Her Job için bir SSE event queue tutulur (subscriber pattern)
  • Global SSE hub ek olarak tüm job değişikliklerini yayınlar
  • Job durum geçişleri katı kurallara tabidir (invalid transition reddedilir)
  • Session dizinleri sessions/{job_id}/ altında izole edilir
  • Worker loop POST /api/jobs'dan bağımsız çalışır; iş QUEUED bırakılır, loop başlatır
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.config import settings as app_settings
from backend.models.job import Job, JobStep
from backend.models.schemas import JobCreate
from backend.services.settings_resolver import SettingsResolver
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Sabitler
# ─────────────────────────────────────────────────────────────────────────────

# İzin verilen durum geçişleri: {mevcut_durum: {hedef_durumlar}}
_VALID_TRANSITIONS: dict[str, set[str]] = {
    "queued":    {"running", "cancelled"},
    "running":   {"completed", "failed", "cancelled"},
    "completed": set(),          # terminal durum
    "failed":    {"queued"},     # retry: tekrar kuyruğa alınabilir
    "cancelled": {"queued"},     # iptal edilen iş tekrar başlatılabilir
}

# Standart video pipeline adımları (modül sistemi kurulana kadar burada tanımlı)
_DEFAULT_PIPELINE_STEPS: list[dict[str, str | int]] = [
    {"key": "script",      "label": "Senaryo Üretimi",       "order": 0},
    {"key": "metadata",    "label": "Metadata Üretimi",      "order": 1},
    {"key": "tts",         "label": "Ses Sentezi (TTS)",      "order": 2},
    {"key": "visuals",     "label": "Görsel İndirme",         "order": 3},
    {"key": "subtitles",   "label": "Altyazı Oluşturma",     "order": 4},
    {"key": "composition", "label": "Video Kompozisyon",      "order": 5},
]

# Modül bazlı pipeline tanımları (Faz 5'te modül sistemiyle değiştirilecek)
_MODULE_STEPS: dict[str, list[dict[str, str | int]]] = {
    "standard_video": _DEFAULT_PIPELINE_STEPS,
    "news_bulletin": _DEFAULT_PIPELINE_STEPS,
    "product_review": _DEFAULT_PIPELINE_STEPS,
}


# ─────────────────────────────────────────────────────────────────────────────
# SSE Event Hub — Subscriber Pattern
# ─────────────────────────────────────────────────────────────────────────────

class _SSEHub:
    """
    Job bazlı SSE event yayınlama merkezi.

    Her job_id için birden fazla subscriber (asyncio.Queue) tutabilir.
    Bir event yayınlandığında tüm subscriber'lara iletilir.
    Subscriber ayrıldığında kendi queue'su temizlenir.
    """

    def __init__(self) -> None:
        # job_id → set of asyncio.Queue
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, job_id: str) -> asyncio.Queue:
        """Yeni bir subscriber queue oluştur ve kaydet."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        async with self._lock:
            if job_id not in self._subscribers:
                self._subscribers[job_id] = set()
            self._subscribers[job_id].add(queue)
        log.debug("SSE subscriber eklendi", job_id=job_id[:8])
        return queue

    async def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        """Subscriber'ı kaldır ve gereksiz entry'yi temizle."""
        async with self._lock:
            subs = self._subscribers.get(job_id)
            if subs:
                subs.discard(queue)
                if not subs:
                    del self._subscribers[job_id]
        log.debug("SSE subscriber kaldırıldı", job_id=job_id[:8])

    async def publish(self, job_id: str, event_type: str, data: dict[str, Any]) -> None:
        """Tüm subscriber'lara event gönder."""
        message = {"event": event_type, "data": data}
        async with self._lock:
            subs = self._subscribers.get(job_id, set()).copy()
        for queue in subs:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                log.warning(
                    "SSE queue dolu, event atlandı",
                    job_id=job_id[:8],
                    event_type=event_type,
                )

    async def publish_and_close(self, job_id: str, event_type: str, data: dict[str, Any]) -> None:
        """Event gönder ve ardından tüm subscriber'lara kapanış sinyali yolla."""
        await self.publish(job_id, event_type, data)
        # None sentinel → subscriber'lar stream'i kapatır
        async with self._lock:
            subs = self._subscribers.get(job_id, set()).copy()
        for queue in subs:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass


# Tekil hub instance — tüm uygulama bunu kullanır
sse_hub = _SSEHub()


# ─────────────────────────────────────────────────────────────────────────────
# Global SSE Hub — Sistem Geneli Yayın (Dashboard / JobList için)
# ─────────────────────────────────────────────────────────────────────────────

class _GlobalSSEHub:
    """
    Sistem genelindeki herhangi bir job değişikliğini tüm subscriber'lara yayınlar.

    Dashboard ve JobList sayfaları bu hub'a abone olur; herhangi bir job
    durumu değiştiğinde polling yapmadan güncel veriyi alırlar.

    Subscriber'lar asyncio.Queue nesnesidir. Hub, her event'te tüm
    aktif subscriber'lara veriyi iletir.
    """

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        """Yeni global subscriber queue oluştur ve kaydet."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=512)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Subscriber'ı kaldır."""
        async with self._lock:
            self._subscribers.discard(queue)

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        """Tüm global subscriber'lara event gönder."""
        message = {"event": event_type, "data": data}
        async with self._lock:
            subs = self._subscribers.copy()
        for queue in subs:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                # Dolu queue'dan subscriber'ı temizle
                self._subscribers.discard(queue)


# Tekil global hub — sistem geneli yayın
global_sse_hub = _GlobalSSEHub()


# ─────────────────────────────────────────────────────────────────────────────
# Yardımcı fonksiyonlar
# ─────────────────────────────────────────────────────────────────────────────

def _utcnow_iso() -> str:
    """UTC zaman damgası, ISO-8601 formatında."""
    return datetime.now(timezone.utc).isoformat()


def _new_job_id() -> str:
    """UUID4 tabanlı benzersiz job kimliği."""
    return uuid.uuid4().hex


def _create_session_dir(job_id: str) -> Path:
    """Job'a ait session dizinini oluşturur ve döndürür."""
    session_dir = app_settings.sessions_dir / job_id
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


# ─────────────────────────────────────────────────────────────────────────────
# JobManager Sınıfı
# ─────────────────────────────────────────────────────────────────────────────

class JobManager:
    """
    Job yaşam döngüsü yöneticisi.

    Tüm CRUD ve durum geçiş operasyonlarını SQLite üzerinden yürütür.
    Her operasyon sonucunda SSE event'leri yayınlar.

    Args:
        db: Aktif SQLAlchemy Session nesnesi.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Job oluşturma ───────────────────────────────────────────────────────

    def create_job(self, payload: JobCreate) -> Job:
        """
        Yeni bir pipeline işi oluşturur.

        1. UUID4 tabanlı job ID üretir
        2. SettingsResolver ile ayarları çözümler ve snapshot'ı kaydeder
        3. Session dizinini oluşturur
        4. Modüle göre pipeline step'lerini oluşturur
        5. SQLite'a yazar

        Args:
            payload: JobCreate Pydantic şeması.

        Returns:
            Oluşturulmuş Job ORM nesnesi (steps dahil).
        """
        job_id = _new_job_id()

        # Ayarları çözümle ve snapshot al
        resolver = SettingsResolver(self._db)
        resolved = resolver.resolve(
            module_key=payload.module_key,
            user_overrides=payload.settings_overrides,
        )
        settings_snapshot = json.dumps(
            resolved.settings, ensure_ascii=False, default=str,
        )

        # Session dizini
        session_dir = _create_session_dir(job_id)

        # Job ORM nesnesi
        job = Job(
            id=job_id,
            module_key=payload.module_key,
            title=payload.title,
            language=payload.language,
            status="queued",
            session_dir=str(session_dir),
            resolved_settings_json=settings_snapshot,
        )
        self._db.add(job)

        # Pipeline step'lerini oluştur
        steps_template = _MODULE_STEPS.get(
            payload.module_key, _DEFAULT_PIPELINE_STEPS,
        )
        for step_def in steps_template:
            step = JobStep(
                job_id=job_id,
                key=str(step_def["key"]),
                label=str(step_def["label"]),
                order=int(step_def["order"]),
                status="pending",
            )
            self._db.add(step)

        self._db.commit()
        self._db.refresh(job)

        log.info(
            "Yeni job oluşturuldu",
            job_id=job_id[:8],
            module_key=payload.module_key,
            title=payload.title[:50],
            steps=len(steps_template),
        )

        return job

    # ── Job sorgulama ───────────────────────────────────────────────────────

    def get_job(self, job_id: str) -> Job | None:
        """
        Tekil job sorgulama — step'ler dahil (eager loading).

        Returns:
            Job nesnesi veya None (bulunamazsa).
        """
        return self._db.query(Job).filter(Job.id == job_id).first()

    def list_jobs(
        self,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        module_key: str | None = None,
    ) -> tuple[list[Job], int]:
        """
        Sayfalanmış job listesi.

        Args:
            page: Sayfa numarası (1-tabanlı).
            page_size: Sayfa başına kayıt sayısı.
            status: Opsiyonel durum filtresi.
            module_key: Opsiyonel modül filtresi.

        Returns:
            (job_listesi, toplam_sayı) tuple'ı.
        """
        query = self._db.query(Job)

        if status:
            query = query.filter(Job.status == status)
        if module_key:
            query = query.filter(Job.module_key == module_key)

        total = query.count()
        jobs = (
            query
            .order_by(Job.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return jobs, total

    # ── Job durum güncelleme ────────────────────────────────────────────────

    async def update_job_status(
        self,
        job_id: str,
        new_status: str,
        error_message: str | None = None,
    ) -> Job:
        """
        Job durumunu günceller ve SSE event yayınlar.

        Geçersiz durum geçişleri ValueError ile reddedilir.

        Args:
            job_id: Job kimliği.
            new_status: Hedef durum.
            error_message: Hata mesajı (sadece 'failed' durumu için).

        Returns:
            Güncellenmiş Job nesnesi.

        Raises:
            ValueError: Geçersiz durum geçişi.
            LookupError: Job bulunamadı.
        """
        job = self.get_job(job_id)
        if not job:
            raise LookupError(f"Job bulunamadı: {job_id}")

        current = job.status
        allowed = _VALID_TRANSITIONS.get(current, set())

        if new_status not in allowed:
            raise ValueError(
                f"Geçersiz durum geçişi: {current} → {new_status}. "
                f"İzin verilenler: {allowed or 'yok (terminal durum)'}"
            )

        now = _utcnow_iso()
        job.status = new_status

        if new_status == "running" and not job.started_at:
            job.started_at = now
        elif new_status in ("completed", "failed", "cancelled"):
            job.completed_at = now

        if new_status == "failed" and error_message:
            job.error_message = error_message

        self._db.commit()
        self._db.refresh(job)

        log.info(
            f"Job durumu güncellendi: {current} → {new_status}",
            job_id=job_id[:8],
        )

        # SSE event yayınla (tekil job stream)
        event_data = {
            "job_id": job_id,
            "status": new_status,
            "error_message": error_message,
            "timestamp": now,
        }

        if new_status in ("completed", "failed", "cancelled"):
            await sse_hub.publish_and_close(job_id, "job_status", event_data)
        else:
            await sse_hub.publish(job_id, "job_status", event_data)

        # Global SSE hub'a da yayınla (Dashboard / JobList için)
        await global_sse_hub.publish("job_status", event_data)

        return job

    # ── Job iptal ───────────────────────────────────────────────────────────

    async def cancel_job(self, job_id: str) -> Job:
        """
        İşi iptal eder. Sadece 'queued' veya 'running' durumundaki
        işler iptal edilebilir.

        Returns:
            Güncellenmiş Job nesnesi.
        """
        return await self.update_job_status(job_id, "cancelled")

    # ── Step güncelleme ─────────────────────────────────────────────────────

    async def update_step(
        self,
        job_id: str,
        step_key: str,
        status: str,
        message: str | None = None,
        provider: str | None = None,
        duration_ms: int | None = None,
        cost_estimate_usd: float | None = None,
        cached: bool = False,
        output_artifact: str | None = None,
    ) -> JobStep:
        """
        Belirli bir pipeline adımının durumunu günceller ve SSE event yayınlar.

        Args:
            job_id: İlgili job kimliği.
            step_key: Adım anahtarı (ör. "script", "tts").
            status: Yeni adım durumu.
            message: Özet mesaj veya hata detayı.
            provider: Kullanılan provider adı.
            duration_ms: Adım süresi (milisaniye).
            cost_estimate_usd: Tahmini API maliyeti.
            cached: Cache'den geldi mi?
            output_artifact: Çıktı dosya yolu.

        Returns:
            Güncellenmiş JobStep nesnesi.

        Raises:
            LookupError: Step bulunamadı.
        """
        step = (
            self._db.query(JobStep)
            .filter(JobStep.job_id == job_id, JobStep.key == step_key)
            .first()
        )
        if not step:
            raise LookupError(
                f"Step bulunamadı: job={job_id[:8]}, step={step_key}"
            )

        now = _utcnow_iso()
        step.status = status

        if status == "running" and not step.started_at:
            step.started_at = now
        elif status in ("completed", "failed", "skipped"):
            step.completed_at = now

        if message is not None:
            step.message = message
        if provider is not None:
            step.provider = provider
        if duration_ms is not None:
            step.duration_ms = duration_ms
        if cost_estimate_usd is not None:
            step.cost_estimate_usd = cost_estimate_usd
        if cached:
            step.cached = True
        if output_artifact is not None:
            step.output_artifact = output_artifact

        # Job'un current_step alanını güncelle
        job = self.get_job(job_id)
        if job and status == "running":
            job.current_step = step_key

        # Step maliyetini job toplamına ekle
        if cost_estimate_usd and job:
            total_cost = (
                self._db.query(func.sum(JobStep.cost_estimate_usd))
                .filter(JobStep.job_id == job_id)
                .scalar()
            ) or 0.0
            job.cost_estimate_usd = total_cost

        self._db.commit()
        self._db.refresh(step)

        log.info(
            f"Step güncellendi: {step_key} → {status}",
            job_id=job_id[:8],
            provider=provider or "-",
            duration_ms=duration_ms,
        )

        # SSE event yayınla (tekil job stream)
        step_event_data = {
            "job_id": job_id,
            "step_key": step_key,
            "status": status,
            "message": message,
            "provider": provider,
            "duration_ms": duration_ms,
            "cost_estimate_usd": cost_estimate_usd,
            "cached": cached,
            "output_artifact": output_artifact,
            "started_at": step.started_at,
            "timestamp": now,
        }
        await sse_hub.publish(job_id, "step_update", step_event_data)

        # Global SSE hub'a da yayınla (Dashboard / JobList step_update için)
        await global_sse_hub.publish("step_update", step_event_data)

        return step

    # ── Log mesajı yayınlama ────────────────────────────────────────────────

    async def emit_log(
        self,
        job_id: str,
        level: str,
        message: str,
        step: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """
        Pipeline çalışma sırasında SSE üzerinden canlı log mesajı yayınlar.
        Bu veriler veritabanına yazılmaz — sadece bağlı frontend'lere iletilir.

        Args:
            job_id: İlgili job kimliği.
            level: Log seviyesi ("INFO", "WARN", "ERROR", "DEBUG").
            message: Log mesajı.
            step: İlgili pipeline adımı (opsiyonel).
            extra: Ek alanlar (opsiyonel).
        """
        data: dict[str, Any] = {
            "job_id": job_id,
            "level": level,
            "message": message,
            "timestamp": _utcnow_iso(),
        }
        if step:
            data["step"] = step
        if extra:
            data.update(extra)

        await sse_hub.publish(job_id, "log", data)

    # ── Interrupted job kurtarma ────────────────────────────────────────────

    def recover_interrupted_jobs(self) -> list[Job]:
        """
        Sistem yeniden başlatıldığında 'running' durumundaki job'ları
        tespit eder ve durumlarını 'queued' olarak sıfırlar.
        Bu sayede frontend'de "Devam Et" butonu gösterilir.

        Returns:
            Kurtarılan job'ların listesi.
        """
        interrupted = (
            self._db.query(Job)
            .filter(Job.status == "running")
            .all()
        )

        for job in interrupted:
            log.warning(
                "Interrupted job tespit edildi, kuyruğa alınıyor",
                job_id=job.id[:8],
                module_key=job.module_key,
            )
            job.status = "queued"
            job.error_message = (
                "Sistem yeniden başlatıldı — iş otomatik olarak kuyruğa alındı. "
                "Pipeline kaldığı adımdan devam edebilir (cache'li adımlar atlanır)."
            )

        if interrupted:
            self._db.commit()
            log.info(
                f"{len(interrupted)} interrupted job kurtarıldı",
            )

        return interrupted

    # ── Job silme (admin) ────────────────────────────────────────────────────

    def delete_job(self, job_id: str) -> bool:
        """
        Bir işi ve ilişkili step kayıtlarını kalıcı olarak siler.
        Yalnızca terminal durumdaki (completed, failed, cancelled) işler silinebilir.

        Args:
            job_id: Silinecek iş kimliği.

        Returns:
            True ise silme başarılı.

        Raises:
            LookupError: İş bulunamadı.
            ValueError: İş hâlâ aktif (queued/running), silinemez.
        """
        job = self.get_job(job_id)
        if not job:
            raise LookupError(f"İş bulunamadı: {job_id}")

        if job.status in ("queued", "running"):
            raise ValueError(
                f"Aktif iş silinemez (durum: {job.status}). Önce iptal edin."
            )

        import os
        import shutil

        # Output dizinindeki final .mp4 dosyasını fiziksel olarak sil
        output_path_str = getattr(job, "output_path", None)
        if output_path_str:
            output_file = Path(output_path_str)
            if output_file.exists() and output_file.is_file():
                try:
                    os.remove(output_file)
                    log.info(
                        "Final video dosyası silindi",
                        job_id=job_id[:8],
                        path=str(output_file),
                    )
                except Exception as e:
                    log.warning(
                        "Final video silinemedi",
                        job_id=job_id[:8],
                        path=str(output_file),
                        error=str(e),
                    )

        # Session dizinini diskten temizle (ara dosyalar)
        if job.session_dir:
            session_path = Path(job.session_dir)
            if session_path.exists():
                shutil.rmtree(session_path, ignore_errors=True)
                log.info(
                    "Session dizini silindi",
                    job_id=job_id[:8],
                    session_dir=str(session_path),
                )

        # Step'leri sil
        self._db.query(JobStep).filter(JobStep.job_id == job_id).delete()
        # Job'u sil
        self._db.delete(job)
        self._db.commit()

        log.info(
            "İş silindi",
            job_id=job_id[:8],
        )

        return True

    # ── İstatistikler ───────────────────────────────────────────────────────

    def get_stats(self) -> dict[str, int]:
        """
        Sistem geneli job istatistiklerini döndürür.

        Returns:
            {"total": N, "queued": N, "running": N, "completed": N,
             "failed": N, "cancelled": N}
        """
        rows = (
            self._db.query(Job.status, func.count(Job.id))
            .group_by(Job.status)
            .all()
        )

        stats: dict[str, int] = {
            "total": 0,
            "queued": 0,
            "running": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
        }

        for status, count in rows:
            stats[status] = count
            stats["total"] += count

        return stats

    # ── ETA Hesaplama ────────────────────────────────────────────────────────

    def compute_eta(self, job: Job) -> int | None:
        """
        Kalan tahmini süreyi saniye cinsinden hesaplar.

        Strateji: Tamamlanan adımların ortalama süresini temel alır.
        Henüz hiç adım tamamlanmamışsa None döner.

        Args:
            job: Hesaplanacak Job nesnesi.

        Returns:
            Kalan saniye sayısı veya None (hesaplanamıyorsa).
        """
        completed_steps = [
            s for s in job.steps
            if s.status == "completed" and s.duration_ms and s.duration_ms > 0
        ]
        pending_steps = [
            s for s in job.steps
            if s.status in ("pending", "running")
        ]

        if not completed_steps or not pending_steps:
            return None

        avg_ms = sum(s.duration_ms for s in completed_steps) / len(completed_steps)  # type: ignore[arg-type]
        eta_seconds = int((avg_ms / 1000) * len(pending_steps))
        return eta_seconds


# ─────────────────────────────────────────────────────────────────────────────
# Job Worker Loop — Arka Plan Kuyruğu
# ─────────────────────────────────────────────────────────────────────────────

async def job_worker_loop() -> None:
    """
    Arka plan worker döngüsü.

    Sürekli çalışır (while True) ve:
      1. Şu an RUNNING durumundaki iş sayısını sorgular.
      2. Eğer running_count < max_concurrent_jobs ise:
         - En eski QUEUED işi alır.
         - run_pipeline() ile başlatır.
      3. Her kontrol döngüsü arasında 2 saniye bekler.

    Hata yönetimi:
      - Her iterasyon ayrı try/except ile sarılır → döngü asla çökmez.
      - DB erişim hataları loglanır, döngü devam eder.

    Import notu: run_pipeline burada import edilir (circular import önleme).
    """
    # Circular import'u önlemek için lazy import
    from backend.pipeline.runner import run_pipeline
    from backend.database import SessionLocal

    log.info("Job worker loop başlatıldı")

    while True:
        try:
            with SessionLocal() as db:
                # Şu an kaç iş çalışıyor?
                running_count = (
                    db.query(func.count(Job.id))
                    .filter(Job.status == "running")
                    .scalar()
                ) or 0

                available_slots = app_settings.max_concurrent_jobs - running_count

                if available_slots > 0:
                    # Slotlar dolana kadar ya da QUEUED iş bitene kadar başlat
                    started = 0
                    while started < available_slots:
                        # En eski QUEUED işi al (FIFO)
                        next_job = (
                            db.query(Job)
                            .filter(Job.status == "queued")
                            .order_by(Job.created_at.asc())
                            .first()
                        )
                        if not next_job:
                            break

                        # Status'u running'e al ki başka döngü tekrar almasın
                        next_job.status = "running"
                        if not next_job.started_at:
                            next_job.started_at = _utcnow_iso()
                        db.commit()

                        # Asyncio task olarak pipeline'ı başlat
                        asyncio.create_task(
                            run_pipeline(next_job.id),
                            name=f"pipeline-worker-{next_job.id[:8]}",
                        )

                        log.info(
                            "Worker loop: pipeline başlatıldı",
                            job_id=next_job.id[:8],
                            module_key=next_job.module_key,
                            running_after=running_count + started + 1,
                        )

                        # Global SSE üzerinden queued→running bildir
                        asyncio.create_task(
                            global_sse_hub.publish("job_status", {
                                "job_id": next_job.id,
                                "status": "running",
                                "error_message": None,
                                "timestamp": _utcnow_iso(),
                            })
                        )

                        started += 1

        except Exception as exc:
            log.error(
                "Job worker loop hatası (döngü devam ediyor)",
                error=str(exc),
            )

        # Her kontrol arasında 2 saniye bekle
        await asyncio.sleep(2)
