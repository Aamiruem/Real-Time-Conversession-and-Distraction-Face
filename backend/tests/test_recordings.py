import json

import pytest

from app import mongo
from app.config import settings
from app.database import engine
from app.routers import recording_routes

VIDEO = b"\x1aE\xdf\xa3" + b"fake webm bytes" * 100


def _upload(client, headers, **form):
    timeline = [{"t": 0, "focus": 90, "state": "Focused"}, {"t": 1, "focus": 50, "state": "Distracted"}]
    data = {"title": "My session", "duration_sec": "2", "quality": "high", "speed": "eco",
            "timeline": json.dumps(timeline), **form}
    return client.post("/recordings", headers=headers, data=data,
                       files={"video": ("rec.webm", VIDEO, "video/webm;codecs=vp9")})


def test_upload_list_download_delete(client, verified_user):
    headers, _ = verified_user
    res = _upload(client, headers)
    assert res.status_code == 200, res.text
    rec = res.json()
    assert rec["size_bytes"] == len(VIDEO) and rec["quality"] == "high" and rec["speed"] == "eco"
    assert rec["avg_focus"] == 70 and rec["focused_pct"] == 50
    assert rec["storage"] == "local" and rec["saved_to"] == ["sqlite", "disk"]

    assert [r["id"] for r in client.get("/recordings", headers=headers).json()] == [rec["id"]]
    detail = client.get(f"/recordings/{rec['id']}", headers=headers).json()
    assert detail["timeline"][1] == {"t": 1.0, "focus": 50.0, "state": "Distracted"}

    file = client.get(f"/recordings/{rec['id']}/file", headers=headers)
    assert file.status_code == 200 and file.content == VIDEO and file.headers["content-type"] == "video/webm"

    assert client.delete(f"/recordings/{rec['id']}", headers=headers).json() == {"ok": True}
    assert client.get("/recordings", headers=headers).json() == []
    assert not any(settings.RECORDINGS_DIR.rglob("*.webm"))


def test_recordings_are_private(client, verified_user, make_user):
    headers, _ = verified_user
    rec = _upload(client, headers).json()
    other, _ = make_user()
    assert client.get(f"/recordings/{rec['id']}/file", headers=other).status_code == 404
    assert client.delete(f"/recordings/{rec['id']}", headers=other).status_code == 404


def test_rejects_bad_uploads(client, verified_user):
    headers, _ = verified_user
    assert _upload(client, headers, timeline="not json").status_code == 422
    bad_type = client.post("/recordings", headers=headers, files={"video": ("a.txt", b"hi", "text/plain")})
    assert bad_type.status_code == 415


def test_direct_upload_without_s3_says_use_the_normal_upload(client, verified_user):
    headers, _ = verified_user
    res = client.post("/recordings/upload-url", headers=headers, json={"mime_type": "video/webm;codecs=vp9"})
    assert res.status_code == 409
    other = client.post("/recordings/register", headers=headers, data={"key": "user_999999/x.webm"})
    assert other.status_code == 403  # someone else's key


# ---------- Presence Studio videos in MongoDB (GridFS). Needs a MongoDB server at localhost:27017 (skipped otherwise). ----------

BIG_VIDEO = VIDEO * 5000  # over GridFS's 255 KB chunk size, so it's stored in several chunks


@pytest.fixture()
def videos(monkeypatch):
    test_db = "presence_ai_test_videos"
    monkeypatch.setattr(settings, "MONGODB_URI", "mongodb://localhost:27017/")
    monkeypatch.setattr(settings, "MONGODB_DB", test_db)
    monkeypatch.setattr(mongo, "_client", None)
    if mongo.ping() is None:
        pytest.skip("no MongoDB at localhost:27017")
    db = mongo.database()
    db.client.drop_database(test_db)
    yield db
    db.client.drop_database(test_db)
    db.client.close()


def _upload_presence(client, headers, video=VIDEO, **form):
    data = {"title": "Presence 84 · Pitch an idea", "source": "presence", "duration_sec": "61", **form}
    return client.post("/recordings", headers=headers, data=data,
                       files={"video": ("rec.webm", video, "video/webm;codecs=vp9")})


def _stored(db) -> tuple[int, int]:
    return db["recording_videos.files"].count_documents({}), db["recording_videos.chunks"].count_documents({})


def test_presence_video_is_kept_in_mongodb_and_deleted_from_it(client, verified_user, videos):
    headers, _ = verified_user
    before = set(settings.RECORDINGS_DIR.rglob("*.webm"))
    rec = _upload_presence(client, headers, BIG_VIDEO).json()
    assert rec["storage"] == "mongo" and rec["saved_to"] == ["sqlite", "mongodb"]
    assert set(settings.RECORDINGS_DIR.rglob("*.webm")) == before  # no second copy on disk
    files, chunks = _stored(videos)
    assert files == 1 and chunks > 1

    file = client.get(f"/recordings/{rec['id']}/file", headers=headers)
    assert file.status_code == 200 and file.content == BIG_VIDEO
    assert file.headers["content-type"] == "video/webm" and file.headers["content-length"] == str(len(BIG_VIDEO))
    assert "filename*=UTF-8''Presence%2084" in file.headers["content-disposition"]

    assert client.delete(f"/recordings/{rec['id']}", headers=headers).json() == {"ok": True}
    assert _stored(videos) == (0, 0)  # the chunks go too, not just the file entry
    assert client.get(f"/recordings/{rec['id']}/file", headers=headers).status_code == 404


def test_mongodb_videos_are_private(client, verified_user, make_user, videos):
    headers, _ = verified_user
    rec = _upload_presence(client, headers).json()
    other, _ = make_user()
    assert client.get(f"/recordings/{rec['id']}/file", headers=other).status_code == 404
    assert client.delete(f"/recordings/{rec['id']}", headers=other).status_code == 404
    assert _stored(videos)[0] == 1


def test_list_keeps_one_source(client, make_user, videos):
    headers, _ = make_user()
    presence = _upload_presence(client, headers).json()
    rooms = _upload(client, headers, source="rooms").json()
    assert [r["id"] for r in client.get("/recordings?source=presence", headers=headers).json()] == [presence["id"]]
    assert {r["id"] for r in client.get("/recordings", headers=headers).json()} == {presence["id"], rooms["id"]}


def test_other_recordings_stay_out_of_mongodb(client, verified_user, videos):
    headers, _ = verified_user
    assert _upload(client, headers, source="rooms").json()["storage"] == "local"
    assert _stored(videos) == (0, 0)


def test_oversized_presence_video_stays_out_of_mongodb(client, verified_user, videos, monkeypatch):
    monkeypatch.setattr(recording_routes, "MONGO_VIDEO_MAX", len(VIDEO) - 1)
    headers, _ = verified_user
    assert _upload_presence(client, headers).json()["storage"] == "local"
    assert _stored(videos) == (0, 0)


def test_full_mongodb_falls_back_and_the_video_stays_playable(client, verified_user, videos, monkeypatch):
    monkeypatch.setattr(settings, "MONGO_VIDEO_QUOTA_MB", 1)
    videos["recording_videos.files"].insert_one({"length": 1024 * 1024})  # the quota is used up
    headers, _ = verified_user
    rec = _upload_presence(client, headers).json()
    assert rec["storage"] == "local"
    assert client.get(f"/recordings/{rec['id']}/file", headers=headers).content == VIDEO


def test_mongodb_down_falls_back_and_the_video_stays_playable(client, verified_user, videos, monkeypatch):
    monkeypatch.setattr(mongo, "save_video", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")))
    headers, _ = verified_user
    rec = _upload_presence(client, headers).json()
    assert rec["storage"] == "local"
    assert client.get(f"/recordings/{rec['id']}/file", headers=headers).content == VIDEO


def test_failed_delete_keeps_the_recording_for_a_retry(client, make_user, videos, monkeypatch):
    headers, _ = make_user()
    rec = _upload_presence(client, headers).json()
    with monkeypatch.context() as down:
        down.setattr(mongo, "delete_video", lambda key: (_ for _ in ()).throw(ConnectionError("down")))
        res = client.delete(f"/recordings/{rec['id']}", headers=headers)
    assert res.status_code == 503  # never reports "deleted" while the video is still stored
    assert [r["id"] for r in client.get("/recordings", headers=headers).json()] == [rec["id"]]

    assert client.delete(f"/recordings/{rec['id']}", headers=headers).json() == {"ok": True}
    assert _stored(videos) == (0, 0)


def test_full_sync_leaves_videos_alone(client, verified_user, videos):
    headers, _ = verified_user
    rec = _upload_presence(client, headers).json()
    mongo.full_sync(engine)
    assert client.get(f"/recordings/{rec['id']}/file", headers=headers).content == VIDEO


def test_deleting_the_account_deletes_its_videos(client, make_user, videos):
    headers, creds = make_user()
    _upload_presence(client, headers)
    assert client.request("DELETE", "/auth/me", headers=headers, json={"password": creds["password"]}).status_code == 200
    assert _stored(videos) == (0, 0)


def test_presence_skips_direct_s3_upload_so_it_reaches_mongodb(client, verified_user, videos, monkeypatch):
    class FakeS3:
        def generate_presigned_url(self, *a, **k):
            return "https://s3.example/upload"

    monkeypatch.setattr(recording_routes, "s3", FakeS3)
    headers, _ = verified_user
    body = {"mime_type": "video/webm"}
    assert client.post("/recordings/upload-url", headers=headers, json={**body, "source": "presence"}).status_code == 409
    assert client.post("/recordings/upload-url", headers=headers, json={**body, "source": "rooms"}).status_code == 200
