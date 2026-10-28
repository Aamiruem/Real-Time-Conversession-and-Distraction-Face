"""MongoDB mirror: every record saved in the SQL database is also kept in MongoDB, one collection per table.

The SQL database (SQLite locally, PostgreSQL on AWS RDS) stays the system of record: logins, joins and
transactions run there. MongoDB gets a live, document-shaped copy for browsing in Compass, analytics and other
tools. How it stays in sync:
  * live:   after each successful commit, changed rows are upserted / deleted in MongoDB by a background thread,
            so requests never wait for (or fail because of) MongoDB
  * repair: full_sync() rebuilds every collection from SQL - runs when the backend starts and via
            `python -m app.db_cli mongo-sync`
Secrets are not mirrored: no one-time codes and no password hashes.
Turn it on with MONGODB_URI (and optionally MONGODB_DB) in backend/.env.
"""
import logging
import queue
import threading
import time

from sqlalchemy import Engine, event, inspect, select
from sqlalchemy.orm import Session

from app.config import settings

log = logging.getLogger("presence.mongo")

SKIP_TABLES = {"otp_codes"}
SKIP_FIELDS = {"users": {"password_hash"}}
BATCH = 500

_client = None
_queue: queue.Queue = queue.Queue()
_worker: threading.Thread | None = None
_last_error = 0.0


def enabled() -> bool:
    return bool(settings.MONGODB_URI)


def database():
    """The app's MongoDB database (client created on first use; fails fast when MongoDB is down)."""
    global _client
    if _client is None:
        from pymongo import MongoClient

        _client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000,
                              appname=settings.APP_NAME, tz_aware=True)
    return _client[settings.MONGODB_DB]


def ping() -> float | None:
    """Round-trip time in ms, or None if MongoDB is off or unreachable."""
    if not enabled():
        return None
    try:
        start = time.perf_counter()
        database().command("ping")
        return round((time.perf_counter() - start) * 1000, 1)
    except Exception:  # noqa: BLE001 - any driver error means "not reachable"
        return None


def to_doc(table: str, row: dict) -> dict:
    """A SQL row as a MongoDB document: the primary key becomes _id, secret fields are dropped."""
    skip = SKIP_FIELDS.get(table, set())
    doc = {k: v for k, v in row.items() if k not in skip and k != "id"}
    doc["_id"] = row["id"]
    return doc


# ---------- live sync: SQLAlchemy session events -> background writer ----------

def _row(obj) -> tuple[str, dict] | None:
    table = obj.__table__.name
    if table in SKIP_TABLES:
        return None
    mapper = inspect(obj).mapper
    return table, {attr.columns[0].name: getattr(obj, attr.key) for attr in mapper.column_attrs}


def _after_flush(session: Session, _ctx):
    if not enabled():
        return
    ops = session.info.setdefault("mongo_ops", [])
    changed = list(session.new) + [o for o in session.dirty if session.is_modified(o, include_collections=False)]
    for obj in changed:
        if r := _row(obj):
            ops.append(("upsert", r[0], to_doc(*r)))
    for obj in session.deleted:
        if obj.__table__.name not in SKIP_TABLES:
            ops.append(("delete", obj.__table__.name, obj.id))


def _after_commit(session: Session):
    for op in session.info.pop("mongo_ops", []):
        _queue.put(op)


def _after_rollback(session: Session):
    session.info.pop("mongo_ops", None)  # nothing was saved, so nothing to mirror


def _apply(op):
    kind, table, value = op
    coll = database()[table]
    if kind == "upsert":
        coll.replace_one({"_id": value["_id"]}, value, upsert=True)
    else:
        coll.delete_one({"_id": value})


def _work():
    global _last_error
    while True:
        op = _queue.get()
        try:
            _apply(op)
        except Exception as e:  # noqa: BLE001 - MongoDB down: log (at most once a minute), keep serving
            if time.time() - _last_error > 60:
                log.warning("MongoDB mirror: write failed (%s) - run `python -m app.db_cli mongo-sync` once "
                            "MongoDB is back to catch up", e.__class__.__name__)
                _last_error = time.time()
        finally:
            _queue.task_done()


def flush(timeout: float = 5.0) -> bool:
    """Wait until queued mirror writes are done (tests, shutdown). True if the queue drained in time."""
    deadline = time.time() + timeout
    while _queue.unfinished_tasks and time.time() < deadline:
        time.sleep(0.02)
    return not _queue.unfinished_tasks


def install():
    """Mirror every session's commits to MongoDB (no-op when MONGODB_URI is empty). Safe to call twice."""
    global _worker
    if not enabled() or _worker is not None:
        return
    event.listen(Session, "after_flush", _after_flush)
    event.listen(Session, "after_commit", _after_commit)
    event.listen(Session, "after_rollback", _after_rollback)
    _worker = threading.Thread(target=_work, name="mongo-mirror", daemon=True)
    _worker.start()


# ---------- full sync ----------

def full_sync(engine: Engine) -> dict[str, int]:
    """Make every MongoDB collection match its SQL table exactly. Returns {table: documents}."""
    from pymongo import ReplaceOne

    from app.database import Base
    from app import models  # noqa: F401  (register models)

    db, result = database(), {}
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name in SKIP_TABLES:
                continue
            coll, ids = db[table.name], []
            rows = conn.execute(select(table)).mappings()
            while batch := rows.fetchmany(BATCH):
                docs = [to_doc(table.name, dict(r)) for r in batch]
                ids += [d["_id"] for d in docs]
                coll.bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs], ordered=False)
            coll.delete_many({"_id": {"$nin": ids}})  # rows deleted in SQL while the mirror was off
            for column in table.columns:  # same lookups as SQL: by user, room, time...
                if column.index and column.name != "id":
                    coll.create_index(column.name)
            result[table.name] = coll.count_documents({})
    return result


def sync_in_background(engine: Engine):
    """full_sync() on a thread, so a slow or missing MongoDB never delays startup."""
    def run():
        try:
            counts = full_sync(engine)
            log.info("MongoDB mirror ready: %s", counts)
        except Exception as e:  # noqa: BLE001
            log.warning("MongoDB mirror: initial sync skipped (%s) - is MongoDB running at MONGODB_URI?",
                        e.__class__.__name__)

    threading.Thread(target=run, name="mongo-sync", daemon=True).start()
