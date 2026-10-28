"""MongoDB mirror: live sync of creates / updates / deletes, full sync, and no secrets copied.

Needs a MongoDB server at localhost:27017 (skipped otherwise). Uses its own database, dropped afterwards.
"""
import pytest

from app import mongo
from app.config import settings
from app.database import engine

URI, TEST_DB = "mongodb://localhost:27017/", "presence_ai_test"


@pytest.fixture()
def mirror(monkeypatch):
    monkeypatch.setattr(settings, "MONGODB_URI", URI)
    monkeypatch.setattr(settings, "MONGODB_DB", TEST_DB)
    monkeypatch.setattr(mongo, "_client", None)
    if mongo.ping() is None:
        pytest.skip("no MongoDB at localhost:27017")
    mongo.install()
    db = mongo.database()
    db.client.drop_database(TEST_DB)
    yield db
    mongo.flush()
    db.client.drop_database(TEST_DB)
    db.client.close()


def test_live_mirror_follows_create_update_delete(client, make_user, mirror):
    headers, creds = make_user()
    assert mongo.flush()
    doc = mirror.users.find_one({"username": creds["username"]})
    assert doc and doc["email"] == creds["email"] and doc["email_verified"] is True
    assert "password_hash" not in doc  # secrets stay in SQL only
    assert "otp_codes" not in mirror.list_collection_names()

    client.patch("/auth/me", headers=headers, json={"full_name": "Mongo Fan"})
    assert mongo.flush()
    assert mirror.users.find_one({"_id": doc["_id"]})["full_name"] == "Mongo Fan"

    room = client.post("/rooms", headers=headers, json={"name": "Mongo room", "description": "sync test"}).json()
    assert mongo.flush()
    assert mirror.rooms.find_one({"_id": room["id"]})["created_by"] == doc["_id"]

    client.request("DELETE", "/auth/me", headers=headers, json={"password": creds["password"]})
    assert mongo.flush()
    assert mirror.users.find_one({"_id": doc["_id"]}) is None
    assert mirror.rooms.find_one({"_id": room["id"]}) is None


def test_full_sync_matches_sql(client, make_user, mirror):
    make_user()
    mirror.users.insert_one({"_id": 999_999, "username": "ghost"})  # deleted in SQL while the mirror was off
    counts = mongo.full_sync(engine)
    with engine.connect() as conn:
        sql_users = conn.exec_driver_sql("SELECT COUNT(*) FROM users").scalar()
    assert counts["users"] == sql_users and mirror.users.find_one({"_id": 999_999}) is None
    assert "otp_codes" not in counts
    assert "user_id" in str(mirror.attention_sessions.index_information())  # same lookups as SQL are indexed


def test_health_reports_mongodb(client, mirror):
    assert client.get("/health").json()["mongodb"] == {
        "enabled": True, "connected": True, "latency_ms": pytest.approx(0, abs=2000)}
