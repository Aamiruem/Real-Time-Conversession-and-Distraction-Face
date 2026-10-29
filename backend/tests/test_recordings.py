import json

from app.config import settings

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
