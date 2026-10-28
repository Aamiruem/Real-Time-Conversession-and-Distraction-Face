"""Database setup: the local/aws switch, safe descriptions, and copying data between databases."""
import os
import shutil
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import func, make_url, select

from app import db_cli
from app.config import aws_database_url, database_url
from app.database import describe, init_db, make_engine
from app.models import Message, Room, User


def test_aws_url_handles_any_password(monkeypatch):
    monkeypatch.setenv("DB_HOST", "presence-db.abc123.ap-south-1.rds.amazonaws.com")
    monkeypatch.setenv("DB_PASSWORD", "p@ss:w/rd#1%")
    url = make_url(aws_database_url())
    assert url.password == "p@ss:w/rd#1%"
    assert (url.host, url.port, url.database, url.username) == (
        "presence-db.abc123.ap-south-1.rds.amazonaws.com", 5432, "focuslink", "focuslink")


def test_switch_between_local_and_aws(monkeypatch):
    monkeypatch.delenv("DATABASE_URL")
    monkeypatch.setenv("DATABASE", "local")
    assert database_url().endswith("backend/focuslink.db")
    monkeypatch.setenv("DATABASE", "aws")
    monkeypatch.delenv("DB_HOST", raising=False)
    with pytest.raises(RuntimeError, match="DB_HOST"):
        database_url()
    monkeypatch.setenv("DB_HOST", "db.example.rds.amazonaws.com")
    assert database_url().startswith("postgresql+psycopg2://")


def test_describe_never_shows_credentials():
    d = describe("postgresql+psycopg2://admin:s3cret@presence.abc.us-east-1.rds.amazonaws.com:5432/focuslink")
    assert d == {"engine": "postgresql", "location": "aws-rds", "host": "presence.abc.us-east-1.rds.amazonaws.com",
                 "database": "focuslink"}
    assert "s3cret" not in str(d)


def test_health_reports_database(client):
    db = client.get("/health").json()["database"]
    assert db["engine"] == "sqlite" and db["location"] == "local" and db["connected"] is True


def _count(eng, model):
    with eng.connect() as conn:
        return conn.scalar(select(func.count()).select_from(model.__table__))


@pytest.fixture
def tmp_dir():
    path = Path(tempfile.mkdtemp(prefix="presence-copy-"))
    yield path
    shutil.rmtree(path, ignore_errors=True)


def test_copy_moves_every_row_and_refuses_to_overwrite(capsys, tmp_dir):
    src_url, dst_url = (f"sqlite:///{(tmp_dir / name).as_posix()}" for name in ("src.db", "dst.db"))
    src = make_engine(src_url)
    init_db(src)
    with src.begin() as conn:
        conn.execute(User.__table__.insert(), [
            {"id": 5, "username": "asha", "email": "asha@example.com", "password_hash": "x"},
            {"id": 9, "username": "ravi", "email": "ravi@example.com", "password_hash": "y"},
        ])
        conn.execute(Room.__table__.insert(), [{"id": 3, "name": "Deep work", "created_by": 5}])
        conn.execute(Message.__table__.insert(), [
            {"room_id": 3, "user_id": 9, "content": f"m{i}"} for i in range(1200)  # more than one batch
        ])

    db_cli.main(["copy", "--from", src_url, "--to", dst_url])
    dst = make_engine(dst_url)
    assert [_count(dst, m) for m in (User, Room, Message)] == [2, 1, 1200]
    with dst.connect() as conn:  # ids are kept, so every foreign key still points at the right row
        assert conn.scalar(select(User.__table__.c.username).where(User.__table__.c.id == 9)) == "ravi"
    assert "1203 rows copied and verified" in capsys.readouterr().out

    with pytest.raises(SystemExit, match="already has data"):
        db_cli.main(["copy", "--from", src_url, "--to", dst_url])
    db_cli.main(["copy", "--from", src_url, "--to", dst_url, "--replace"])
    assert _count(dst, Message) == 1200

    with pytest.raises(SystemExit, match="same database"):
        db_cli.main(["copy", "--from", src_url, "--to", src_url])
    src.dispose()
    dst.dispose()


def test_status_explains_unreachable_database():
    with pytest.raises(SystemExit, match="security group"):
        db_cli.main(["status", "--db", "postgresql+psycopg2://u:p@127.0.0.1:1/none"])


@pytest.fixture(autouse=True)
def _keep_env():
    saved = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(saved)
