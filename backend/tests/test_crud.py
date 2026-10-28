from datetime import datetime, timezone

REPORT = {"confidence": 70, "scores": {"fluency": 80, "pace": 90, "clarity": 70, "voice": 60, "assertiveness": 85},
          "metrics": {"duration_sec": 60, "wpm": 140, "fillers": 2}}


def test_profile_and_password(client, verified_user):
    headers, creds = verified_user
    assert client.patch("/auth/me", headers=headers, json={"full_name": "  New Name "}).json()["full_name"] == "New Name"
    bad = client.post("/auth/password", headers=headers, json={"current_password": "wrong", "new_password": "newpass123"})
    assert bad.status_code == 400
    weak = client.post("/auth/password", headers=headers, json={"current_password": creds["password"], "new_password": "short"})
    assert weak.status_code == 422
    ok = client.post("/auth/password", headers=headers, json={"current_password": creds["password"], "new_password": "newpass123"})
    assert ok.status_code == 200
    assert client.post("/auth/login", json={"identifier": creds["username"], "password": "newpass123"}).status_code == 200


def test_sessions_read_rename_and_ownership(client, verified_user):
    headers, _ = verified_user
    s = client.post("/attention/sessions", headers=headers, json={
        "started_at": datetime.now(timezone.utc).isoformat(), "duration_sec": 600, "focus_pct": 80,
        "distracted_pct": 15, "drowsy_pct": 5}).json()
    assert client.get(f"/attention/sessions/{s['id']}", headers=headers).json()["focus_pct"] == 80
    sp = client.post("/speech/sessions", headers=headers, json={"mode": "free", "report": REPORT, "prompt": "old"}).json()
    renamed = client.patch(f"/speech/sessions/{sp['id']}", headers=headers, json={"prompt": "My pitch v2"}).json()
    assert renamed["prompt"] == "My pitch v2"
    assert client.get(f"/speech/sessions/{sp['id']}", headers=headers).json()["report"]["confidence"] == 70
    assert client.get("/speech/sessions/999999", headers=headers).status_code == 404


def test_rooms_and_messages_permissions(client, verified_user, make_user):
    owner, _ = verified_user
    intruder, _ = make_user()
    room = client.post("/rooms", headers=owner, json={"name": f"crud-room-{id(owner)}"}).json()
    assert client.patch(f"/rooms/{room['id']}", headers=intruder, json={"description": "x"}).status_code == 403
    assert client.patch(f"/rooms/{room['id']}", headers=owner, json={"description": "Deep work"}).json()["description"] == "Deep work"

    msg = client.post(f"/rooms/{room['id']}/messages", headers=owner, json={"content": "I think this is bad"}).json()
    assert client.patch(f"/rooms/{room['id']}/messages/{msg['id']}", headers=intruder, json={"content": "hi"}).status_code == 403
    edited = client.patch(f"/rooms/{room['id']}/messages/{msg['id']}", headers=owner,
                          json={"content": "This is a great plan"}).json()
    assert edited["content"] == "This is a great plan" and edited["sentiment_label"] == "positive"
    assert client.delete(f"/rooms/{room['id']}/messages/{msg['id']}", headers=intruder).status_code == 403
    assert client.delete(f"/rooms/{room['id']}/messages/{msg['id']}", headers=owner).json()["ok"]
    assert client.get(f"/rooms/{room['id']}/messages", headers=owner).json() == []

    assert client.delete(f"/rooms/{room['id']}", headers=intruder).status_code == 403
    assert client.delete(f"/rooms/{room['id']}", headers=owner).json()["ok"]
    assert all(r["id"] != room["id"] for r in client.get("/rooms", headers=owner).json())


def test_delete_account_removes_everything(client, verified_user):
    headers, creds = verified_user
    client.post("/speech/sessions", headers=headers, json={"mode": "free", "report": REPORT})
    client.post("/rooms", headers=headers, json={"name": f"bye-room-{id(headers)}"})
    assert client.request("DELETE", "/auth/me", headers=headers, json={"password": "wrong"}).status_code == 400
    assert client.request("DELETE", "/auth/me", headers=headers, json={"password": creds["password"]}).json()["ok"]
    assert client.get("/auth/me", headers=headers).status_code in (401, 404)
    assert client.post("/auth/login", json={"identifier": creds["username"], "password": creds["password"]}).status_code == 401
