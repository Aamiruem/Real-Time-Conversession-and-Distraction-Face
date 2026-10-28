"""Database tool: check the connection, create tables, and move your data to the online (AWS RDS) database.

Run from backend/ (or `python db_cli.py ...` inside backend/app):
    python -m app.db_cli status                 where data is stored, connection time, rows per table
    python -m app.db_cli status --db aws        same, for the AWS database in backend/.env (DB_HOST, DB_USER, ...)
    python -m app.db_cli init  [--db aws]       create any missing tables
    python -m app.db_cli copy --to aws          copy every row from the current database to AWS, then verify counts
                                                (--from local|aws|URL, --replace to overwrite a non-empty target)
    python -m app.db_cli mongo-sync             rebuild the MongoDB mirror (MONGODB_URI) from the SQL database
--db / --from / --to take: local, aws, current (default), or a full SQLAlchemy URL.
"""
import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):  # started as a script: make the `app` package importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Engine, func, insert, inspect, select, text  # noqa: I001

from app.config import LOCAL_DATABASE_URL, aws_database_url, settings
from app import mongo
from app.database import Base, describe, init_db, make_engine, ping

BATCH = 500


def resolve(name: str) -> str:
    """local / aws / current, or a full database URL."""
    match name.lower():
        case "current":
            return settings.DATABASE_URL
        case "local":
            return LOCAL_DATABASE_URL
        case "aws":
            return aws_database_url()
    return name


def label(url: str) -> str:
    d = describe(url)
    return f"{d['engine']} ({d['location']}): {d['database']}" + (f" @ {d['host']}" if d["host"] else "")


def tables():
    from app import models  # noqa: F401  (register models)

    return Base.metadata.sorted_tables  # parents before children, so foreign keys are satisfied while copying


def counts(eng: Engine) -> dict[str, int | None]:
    existing = set(inspect(eng).get_table_names())
    with eng.connect() as conn:
        return {t.name: conn.scalar(select(func.count()).select_from(t)) if t.name in existing else None
                for t in tables()}


_ENGINES: list[Engine] = []


def connect_or_exit(url: str) -> Engine:
    eng = make_engine(url)
    _ENGINES.append(eng)  # closed when the command ends (Windows can't move or delete an open SQLite file)
    ms = ping(eng)
    if ms is None:
        hint = ("Check DB_HOST / DB_USER / DB_PASSWORD in backend/.env, that the RDS instance is 'Available', and "
                "that its security group allows port 5432 from your IP." if describe(url)["engine"] != "sqlite"
                else "Check the file path.")
        sys.exit(f"Can't connect to {label(url)}.\n{hint}")
    print(f"Connected to {label(url)} in {ms} ms")
    return eng


def cmd_status(args):
    eng = connect_or_exit(resolve(args.db))
    for name, n in counts(eng).items():
        print(f"  {name:<20} {'(missing - run init)' if n is None else n}")
    if not mongo.enabled():
        print("MongoDB mirror: off (set MONGODB_URI in backend/.env to turn it on)")
    elif (ms := mongo.ping()) is None:
        print(f"MongoDB mirror: can't reach {settings.MONGODB_URI} - is MongoDB running?")
    else:
        print(f"MongoDB mirror: connected in {ms} ms, database '{settings.MONGODB_DB}'")


def cmd_mongo_sync(args):
    if not mongo.enabled():
        sys.exit("MONGODB_URI is not set in backend/.env (e.g. MONGODB_URI=mongodb://localhost:27017/).")
    if mongo.ping() is None:
        sys.exit(f"Can't reach MongoDB at {settings.MONGODB_URI} - is it running?")
    eng = connect_or_exit(resolve(args.db))
    synced = mongo.full_sync(eng)
    sql = counts(eng)
    for name, n in synced.items():
        flag = "" if n == sql[name] else f"  (SQL has {sql[name]})"
        print(f"  {name:<20} {n} documents{flag}")
    print(f"MongoDB '{settings.MONGODB_DB}' matches the SQL database ({sum(synced.values())} documents; "
          f"{', '.join(sorted(mongo.SKIP_TABLES))} and password hashes are never mirrored).")


def cmd_init(args):
    eng = connect_or_exit(resolve(args.db))
    init_db(eng)
    print("Tables ready: " + ", ".join(t.name for t in tables()))


def reset_sequences(conn, table_names: list[str]):
    """PostgreSQL ids come from sequences; after inserting explicit ids, move each sequence past the max id."""
    for name in table_names:
        conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{name}', 'id'), "
                          f"COALESCE((SELECT MAX(id) FROM {name}), 1), "
                          f"(SELECT MAX(id) FROM {name}) IS NOT NULL)"))


def cmd_copy(args):
    src_url, dst_url = resolve(args.from_), resolve(args.to)
    if describe(src_url) == describe(dst_url):
        sys.exit("Source and target are the same database.")
    src, dst = connect_or_exit(src_url), connect_or_exit(dst_url)
    init_db(src)  # bring an older source schema up to date so every column exists
    init_db(dst)

    filled = {k: v for k, v in counts(dst).items() if v}
    if filled and not args.replace:
        sys.exit(f"The target already has data ({filled}). Nothing was copied. Use --replace to overwrite it.")

    with src.connect() as read, dst.begin() as write:  # one transaction: the target is all-or-nothing
        for t in reversed(tables()):
            write.execute(t.delete())
        for t in tables():
            copied, rows = 0, read.execute(select(t)).mappings()
            while batch := rows.fetchmany(BATCH):
                write.execute(insert(t), [dict(r) for r in batch])
                copied += len(batch)
            print(f"  {t.name:<20} {copied} rows")
        if dst.dialect.name == "postgresql":
            reset_sequences(write, [t.name for t in tables() if "id" in t.c])

    before, after = counts(src), counts(dst)
    if before != after:
        sys.exit(f"Row counts differ after copying - source {before}, target {after}")
    print(f"Done: {sum(after.values())} rows copied and verified.")
    if describe(dst_url)["location"] == "aws-rds":
        print("To use it, set DATABASE=aws in backend/.env (and remove any DATABASE_URL line), then restart the backend.")


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m app.db_cli", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    for name, fn in (("status", cmd_status), ("init", cmd_init), ("mongo-sync", cmd_mongo_sync)):
        s = sub.add_parser(name)
        s.add_argument("--db", default="current")
        s.set_defaults(fn=fn)
    c = sub.add_parser("copy")
    c.add_argument("--from", dest="from_", default="current")
    c.add_argument("--to", required=True)
    c.add_argument("--replace", action="store_true", help="delete the target's existing rows first")
    c.set_defaults(fn=cmd_copy)
    args = p.parse_args(argv)
    try:
        args.fn(args)
    except RuntimeError as e:  # e.g. --to aws without DB_HOST
        sys.exit(str(e))
    finally:
        while _ENGINES:
            _ENGINES.pop().dispose()


if __name__ == "__main__":
    main()
