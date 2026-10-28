"""SQLAlchemy engine/session. Works with SQLite locally and PostgreSQL on AWS RDS."""
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False}, pool_pre_ping=True)

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        # WAL: readers don't wait for writers (API + WebSockets + MCP at once); NORMAL sync is safe with WAL
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
else:
    # PostgreSQL (AWS RDS): a small warm pool; recycle before RDS / load balancers drop idle connections
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20,
                           pool_recycle=1800)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


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


def _migrate():
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in _NEW_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, (ddl, backfill) in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    if backfill:
                        conn.execute(text(backfill))


def init_db():
    from app import models  # noqa: F401  (register models)

    Base.metadata.create_all(bind=engine)
    _migrate()
