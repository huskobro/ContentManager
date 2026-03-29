"""
Yapılandırılmış JSON log sistemi.

Her log kaydı şu alanları içerir:
  timestamp  – ISO-8601 UTC
  level      – DEBUG / INFO / WARNING / ERROR / CRITICAL
  logger     – modül adı (örn. "pipeline.tts")
  message    – insan tarafından okunabilir mesaj
  job_id     – (opsiyonel) ilgili pipeline işinin ID'si
  step       – (opsiyonel) pipeline adımı (örn. "tts", "visuals")
  provider   – (opsiyonel) kullanılan provider adı
  duration_ms– (opsiyonel) işlem süresi (ms)
  extra      – (opsiyonel) serbest dict, provider-spesifik veriler

Kullanım:
    from backend.utils.logger import get_logger
    log = get_logger(__name__)
    log.info("TTS sentezi tamamlandı", job_id="abc123", step="tts",
             provider="elevenlabs", duration_ms=1240)
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Log dizini ──────────────────────────────────────────────────────────────
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "contentmanager.log"

# Rotating için eşik: 10 MB
_MAX_BYTES = 10 * 1024 * 1024
_BACKUP_COUNT = 5


# ─── JSON Formatter ───────────────────────────────────────────────────────────
class _JSONFormatter(logging.Formatter):
    """Her log kaydını tek satır JSON olarak üretir."""

    # Bu alanlar standart LogRecord'dan alınır; JSON'a taşımaya gerek yok.
    _SKIP = frozenset(
        {
            "args", "created", "exc_info", "exc_text", "filename",
            "funcName", "levelno", "lineno", "module", "msecs",
            "msg", "name", "pathname", "process", "processName",
            "relativeCreated", "stack_info", "taskName", "thread",
            "threadName",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        # Temel alanlar
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # LogRecord'a bind_context() ile eklenen özel alanlar
        for key, value in record.__dict__.items():
            if key not in self._SKIP and not key.startswith("_"):
                payload[key] = value

        # Exception bilgisi
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exception"] = record.exc_text

        return json.dumps(payload, ensure_ascii=False, default=str)


# ─── Context-aware Logger ─────────────────────────────────────────────────────
class _ContextLogger(logging.LoggerAdapter):
    """
    Standart logging.Logger'ı saran ince bir sarmalayıcı.
    Ekstra anahtar-değer çiftlerini (job_id, step, provider, …)
    doğrudan log metodlarına keyword argüman olarak geçirmeye izin verir.

    Örnek:
        log.info("adım tamamlandı", job_id="x", step="tts", duration_ms=900)
    """

    def process(
        self, msg: str, kwargs: dict[str, Any]
    ) -> tuple[str, dict[str, Any]]:
        extra = kwargs.pop("extra", {})
        # Bilinen keyword argümanları extra'ya taşı
        for key in ("job_id", "step", "provider", "duration_ms", "module_name"):
            if key in kwargs:
                extra[key] = kwargs.pop(key)
        # Kalan bilinmeyen keyword'lar da extra'ya
        leftover = {
            k: kwargs.pop(k)
            for k in list(kwargs)
            if k not in ("exc_info", "stack_info", "stacklevel")
        }
        extra.update(leftover)
        kwargs["extra"] = extra
        return msg, kwargs


# ─── Root kurulumu ────────────────────────────────────────────────────────────
def _configure_root(level: int = logging.DEBUG) -> None:
    """Root logger'ı yalnızca bir kez yapılandırır."""
    root = logging.getLogger()
    if root.handlers:
        return  # zaten yapılandırılmış

    root.setLevel(level)
    formatter = _JSONFormatter()

    # Stdout handler (uvicorn/systemd tarafından yakalanır)
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    root.addHandler(stdout_handler)

    # Rotating file handler
    from logging.handlers import RotatingFileHandler

    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=_MAX_BYTES,
        backupCount=_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    # Uvicorn'un kendi log'larını bizim formatter'ımızdan geçir
    for uvicorn_logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        ul = logging.getLogger(uvicorn_logger_name)
        ul.handlers = []
        ul.propagate = True


_configure_root()


# ─── Genel erişim noktası ─────────────────────────────────────────────────────
def get_logger(name: str) -> _ContextLogger:
    """
    Modül adıyla bir logger döndürür.

    Args:
        name: Genellikle __name__ — örn. "backend.pipeline.tts"

    Returns:
        Keyword-arg destekli _ContextLogger örneği.
    """
    return _ContextLogger(logging.getLogger(name), extra={})


def log_exception(logger: _ContextLogger, msg: str, **kwargs: Any) -> None:
    """
    Aktif bir exception bloğunda çağrılır; stack trace'i JSON'a gömer.

    Örnek:
        except Exception:
            log_exception(log, "Pexels indirme hatası", job_id="x", step="visuals")
    """
    kwargs["exc_info"] = True
    logger.error(msg, **kwargs)
