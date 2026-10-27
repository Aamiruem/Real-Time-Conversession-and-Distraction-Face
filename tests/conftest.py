"""Every test run uses a throw-away SQLite database and dev-mode OTPs (codes returned, nothing sent)."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(DATABASE_URL=f"sqlite:///{_db.as_posix()}", AWS_ENABLED="false", OTP_DEV_MODE="true",
                  OTP_RESEND_SECONDS="0", SECRET_KEY="test-secret")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_counter = {"n": 0}


@pytest.fixture(scope="session")
def client():
    from backend.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def verified_user(client):
    """Register + verify a fresh user and return (auth headers, credentials)."""
    _counter["n"] += 1
    n = _counter["n"]
    creds = {"username": f"user{n}", "full_name": "Test User", "email": f"user{n}@example.com",
             "phone": f"+9198765{n:05d}", "password": "secret123"}
    reg = client.post("/auth/register", json=creds).json()
    client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "email", "code": reg["dev_codes"]["email"]})
    res = client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "sms",
                                            "code": reg["dev_codes"]["sms"]}).json()
    return {"Authorization": f"Bearer {res['token']['access_token']}"}, creds
