"""SQLAlchemy engine/session. Works with SQLite locally and PostgreSQL on AWS RDS."""
import time

from sqlalchemy import Engine, create_engine, event, inspect, make_url, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def make_engine(url: str) -> Engine:
    """An engine tuned for the database behind `url` (also used by the db_cli copy tool for the target)."""
    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

        @event.listens_for(eng, "connect")
        def _sqlite_pragmas(conn, _):
            # WAL: readers don't wait for writers (API + WebSockets + MCP at once); NORMAL sync is safe with WAL
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return eng
    # PostgreSQL (AWS RDS): SSL, fail fast when unreachable, a small warm pool, and connections recycled before
    # RDS / load balancers drop idle ones
    args = {"connect_timeout": 10}
    if settings.DB_SSLMODE and "sslmode" not in url:
        args["sslmode"] = settings.DB_SSLMODE
    if settings.DB_SSLROOTCERT:
        args["sslrootcert"] = settings.DB_SSLROOTCERT
    return create_engine(url, connect_args=args, pool_pre_ping=True, pool_size=10, max_overflow=20,
                         pool_recycle=1800)


engine = make_engine(settings.DATABASE_URL)
IS_SQLITE = engine.dialect.name == "sqlite"
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def describe(url: str | None = None) -> dict:
    """Where data is stored, without credentials: {engine, location, host, database}."""
    u = make_url(url or settings.DATABASE_URL)
    if u.get_backend_name() == "sqlite":
        return {"engine": "sqlite", "location": "local", "host": None, "database": u.database}
    location = "aws-rds" if (u.host or "").endswith(".rds.amazonaws.com") else "remote"
    return {"engine": u.get_backend_name(), "location": location, "host": u.host, "database": u.database}


def ping(eng: Engine | None = None) -> float | None:
    """Round-trip time in ms for SELECT 1, or None if the database can't be reached."""
    try:
        start = time.perf_counter()
        with (eng or engine).connect() as conn:
            conn.execute(text("SELECT 1"))
        return round((time.perf_counter() - start) * 1000, 1)
    except Exception:  # noqa: BLE001 - any driver error means "not reachable"
        return None


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. create_all() never alters existing tables, so add them here.
# Accounts created before OTP verification existed are treated as verified.
_NEW_COLUMNS = {
    "users": {
        "full_name": ("VARCHAR(100) DEFAULT ''", None),
        "phone": ("VARCHAR(20)", None),
        "email_verified": ("BOOLEAN DEFAULT FALSE", "UPDATE users SET email_verified = TRUE"),
        "phone_verified": ("BOOLEAN DEFAULT FALSE", "UPDATE users SET phone_verified = TRUE"),
    },
    "attention_sessions": {
        "self_fatigue": ("INTEGER", None),
    },
}


def _migrate(eng: Engine):
    insp = inspect(eng)
    with eng.begin() as conn:
        for table, cols in _NEW_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, (ddl, backfill) in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    if backfill:
                        conn.execute(text(backfill))


def init_db(eng: Engine | None = None):
    """Create missing tables and columns (on the app's database, or on `eng`)."""
    from app import models  # noqa: F401  (register models)

    eng = eng or engine
    Base.metadata.create_all(bind=eng)
    _migrate(eng)


# Mirror every commit to MongoDB when MONGODB_URI is set (API, MCP server and scripts all save through here)
from app import mongo  # noqa: E402

mongo.install()
