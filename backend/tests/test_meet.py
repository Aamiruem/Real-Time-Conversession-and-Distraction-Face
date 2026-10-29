"""Video meetings (signaling over WebSocket) and guest access."""
import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.routers import meet_routes


def _token(headers):
    return headers["Authorization"].split()[1]


def test_guest_gets_a_working_account(client):
    tok = client.post("/auth/guest").json()
    assert tok["user"]["username"].startswith("guest-") and tok["user"]["email_verified"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {tok['access_token']}"})
    assert me.status_code == 200
    other = client.post("/auth/guest").json()
    assert other["user"]["id"] != tok["user"]["id"]  # every visitor gets their own guest


def test_guest_can_give_a_name(client):
    tok = client.post("/auth/guest", json={"name": "  Priya   Sharma "}).json()
    assert tok["user"]["full_name"] == "Priya Sharma" and tok["user"]["username"].startswith("guest-")
    assert client.post("/auth/guest", json={"name": "x" * 61}).status_code == 422


def test_guest_names_are_reserved(client):
    r = client.post("/auth/register", json={"username": "guest-abc123", "full_name": "x", "email": "g@example.com",
                                            "phone": "+919876500999", "password": "secret123"})
    assert r.status_code == 400 and "reserved" in r.json()["detail"]


def test_guests_can_be_turned_off(client, monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_GUESTS", False)
    assert client.post("/auth/guest").status_code == 403


def test_create_and_inspect_meeting(client, verified_user):
    headers, _ = verified_user
    code = client.post("/meet", headers=headers).json()["code"]
    assert meet_routes.CODE_RE.match(code)
    info = client.get(f"/meet/{code}", headers=headers).json()
    assert info["people"] == [] and info["ice_servers"][0]["urls"][0].startswith("stun:")
    assert client.get("/meet/not-a-code", headers=headers).status_code == 404
    assert client.post("/meet").status_code in (401, 403)  # no token at all


def test_two_people_meet_signal_chat_and_leave(client, make_user):
    (h1, _), (h2, _) = make_user(), make_user()
    code = client.post("/meet", headers=h1).json()["code"]
    with client.websocket_connect(f"/ws/meet/{code}?token={_token(h1)}") as a:
        wa = a.receive_json()
        assert wa["type"] == "welcome" and wa["peers"] == [] and wa["ice_servers"]
        a.send_json({"type": "chat", "text": "  hello before you came  "})
        assert a.receive_json()["text"] == "hello before you came"

        with client.websocket_connect(f"/ws/meet/{code}?token={_token(h2)}") as b:
            wb = b.receive_json()
            assert [p["id"] for p in wb["peers"]] == [wa["you"]]
            assert wb["chat"][0]["text"] == "hello before you came"  # late joiners see the chat
            joined = a.receive_json()
            assert joined["type"] == "joined" and joined["id"] == wb["you"] and joined["mic"] is True

            # WebRTC signaling is relayed to exactly one person, tagged with the sender
            b.send_json({"type": "signal", "to": wa["you"], "description": {"type": "offer", "sdp": "v=0"}})
            sig = a.receive_json()
            assert sig == {"type": "signal", "from": wb["you"], "description": {"type": "offer", "sdp": "v=0"}}
            a.send_json({"type": "signal", "to": wb["you"], "candidate": {"candidate": "c", "sdpMid": "0"}})
            assert b.receive_json()["candidate"]["candidate"] == "c"

            b.send_json({"type": "state", "mic": False, "hand": True, "evil": 1})
            st = a.receive_json()
            assert st["type"] == "state" and st["mic"] is False and st["hand"] is True and "evil" not in st

            b.send_json({"type": "react", "emoji": "💣"})  # not an allowed reaction: dropped
            b.send_json({"type": "react", "emoji": "👏"})
            assert a.receive_json() == {"type": "react", "id": wb["you"], "emoji": "👏"}
            b.send_json({"type": "caption", "text": "  hello everyone  ", "final": True})
            assert a.receive_json() == {"type": "caption", "id": wb["you"], "name": joined["name"], "text": "hello everyone",
                                        "final": True}
            b.send_json({"type": "nonsense"})
            b.send_text("not json")
        assert a.receive_json() == {"type": "left", "id": wb["you"]}
    assert code not in meet_routes.meetings  # empty meetings are removed


def test_full_meeting_and_bad_tokens(client, make_user, monkeypatch):
    monkeypatch.setattr(settings, "MEET_MAX_PEOPLE", 1)
    (h1, _), (h2, _) = make_user(), make_user()
    code = client.post("/meet", headers=h1).json()["code"]
    with client.websocket_connect(f"/ws/meet/{code}?token={_token(h1)}") as a:
        a.receive_json()
        with client.websocket_connect(f"/ws/meet/{code}?token={_token(h2)}") as b:
            assert b.receive_json()["type"] == "full"
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/meet/{code}?token=bad") as c:
            c.receive_json()
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/meet/BAD?token={_token(h1)}") as c:
            c.receive_json()
