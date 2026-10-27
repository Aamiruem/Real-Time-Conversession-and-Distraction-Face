"""SQLAlchemy engine/session. Works with SQLite locally and PostgreSQL on AWS RDS."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
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
    from backend import models  # noqa: F401  (register models)

    Base.metadata.create_all(bind=engine)
    _migrate()
