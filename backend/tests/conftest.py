"""Every test run uses a throw-away SQLite database and dev-mode OTPs (codes returned, nothing sent)."""
import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
_tmp = tempfile.mkdtemp(prefix="presence-tests-")


@atexit.register
def _cleanup():
    """Don't leave a database behind after every run (close SQLite first — Windows can't delete open files)."""
    from app.database import engine

    engine.dispose()
    shutil.rmtree(_tmp, ignore_errors=True)


_db = Path(_tmp) / "test.db"
os.environ.update(DATABASE_URL=f"sqlite:///{_db.as_posix()}", AWS_ENABLED="false", OTP_DEV_MODE="true",
                  OTP_RESEND_SECONDS="0", SECRET_KEY="test-secret-key-that-is-at-least-32-bytes",
                  REQUIRE_VERIFICATION="true")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_counter = {"n": 0}


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


def _make_user(client):
    _counter["n"] += 1
    n = _counter["n"]
    creds = {"username": f"user{n}", "full_name": "Test User", "email": f"user{n}@example.com",
             "phone": f"+9198765{n:05d}", "password": "secret123"}
    reg = client.post("/auth/register", json=creds).json()
    client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "email", "code": reg["dev_codes"]["email"]})
    res = client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "sms",
                                            "code": reg["dev_codes"]["sms"]}).json()
    return {"Authorization": f"Bearer {res['token']['access_token']}"}, creds


@pytest.fixture()
def verified_user(client):
    """Register + verify a fresh user and return (auth headers, credentials)."""
    return _make_user(client)


@pytest.fixture()
def make_user(client):
    """Factory for extra, independent users: make_user() -> (auth headers, credentials)."""
    return lambda: _make_user(client)
