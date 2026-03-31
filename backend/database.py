"""
SQLite veritabanı bağlantı katmanı.

Tasarım kararları:
  • WAL (Write-Ahead Logging) modu etkin → eş zamanlı okuma/yazma
  • journal_mode=WAL + synchronous=NORMAL → performans/güvenlik dengesi
  • foreign_keys=ON → referans bütünlüğü
  • check_same_thread=False → FastAPI'nin async worker'larıyla uyumluluk
  • pool_pre_ping=True → bağlantı kopukluğuna karşı otomatik kontrol

Tablo tanımları (DDL) burada; ORM modelleri models/ altındadır.
"""

from __future__ import annotations

from sqlalchemy import event, text
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings
from backend.utils.logger import get_logger

log = get_logger(__name__)


# ─── Engine ──────────────────────────────────────────────────────────────────

def _create_engine() -> Engine:
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
        echo=False,          # SQL sorgularını loglamak için True yap (geliştirme)
    )

    # WAL modu ve PRAGMA'lar her yeni bağlantıda uygulanır
    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA cache_size=-64000")   # ~64 MB page cache
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()

    log.info(
        "Veritabanı motoru oluşturuldu",
        db_path=str(settings.database_path),
    )
    return engine


engine: Engine = _create_engine()

# Thread-safe session factory; her request kendi Session'ını alır.
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


# ─── Declarative Base ────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """
    Tüm ORM modelleri bu sınıftan türer.

    __allow_unmapped__ = True: Column() ile tanımlanmış alanların
    Mapped[] wrapper'ı olmadan da kabul edilmesini sağlar.
    Bu, `from __future__ import annotations` ile birlikte kullanılan
    legacy-style (Column-based) ORM tanımlarıyla uyumu korur.
    """

    __allow_unmapped__ = True


# ─── Dependency (FastAPI) ─────────────────────────────────────────────────────

def get_db() -> Session:  # type: ignore[return]  # generator
    """
    FastAPI Depends() ile kullanılır.

    Örnek:
        @router.get("/jobs")
        def list_jobs(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Tablo oluşturma ──────────────────────────────────────────────────────────

def create_tables() -> None:
    """
    Uygulama ilk açıldığında çağrılır.
    Mevcut tablolara dokunmaz (CREATE TABLE IF NOT EXISTS semantiği).
    """
    # Tüm modellerin import edilmiş olması gerekir ki Base.metadata dolsun.
    # Bu import'lar circular bağımlılığı önlemek için burada yapılır.
    from backend.models import job, settings as settings_model  # noqa: F401
    from backend.models import category, hook  # noqa: F401
    from backend.models import news_source, category_style_mapping  # noqa: F401
    from backend.models import youtube_channel  # noqa: F401
    # Publishing Hub modelleri (Faz 11.1A)
    from backend.models import platform_account  # noqa: F401
    from backend.models import publish_target    # noqa: F401

    Base.metadata.create_all(bind=engine)
    log.info("Veritabanı tabloları hazır")


def check_db_health() -> dict[str, str]:
    """
    /health endpoint'i için veritabanı bağlantı testi.
    Başarılıysa {"status": "ok", "mode": "wal"} döner.
    """
    with SessionLocal() as db:
        result = db.execute(text("PRAGMA journal_mode")).scalar()
    return {"status": "ok", "mode": str(result)}
