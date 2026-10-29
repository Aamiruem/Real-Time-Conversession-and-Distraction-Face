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


def _guest(client, name="Visitor"):
    tok = client.post("/auth/guest", json={"name": name}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_unknown_meeting_codes_are_rejected(client, verified_user):
    headers, _ = verified_user
    r = client.get("/meet/abc-defg-hij", headers=headers)
    assert r.status_code == 404 and "doesn't exist" in r.json()["detail"]
    with pytest.raises(WebSocketDisconnect) as e:
        with client.websocket_connect(f"/ws/meet/abc-defg-hij?token={_token(headers)}") as c:
            c.receive_json()
    assert e.value.code == meet_routes.CLOSE_NOT_FOUND


def test_schedule_edit_list_and_delete(client, make_user):
    (host, _), (other, _) = make_user(), make_user()
    m = client.post("/meet", headers=host, json={"title": " Weekly sync ", "scheduled_for": "2030-01-02T10:00:00Z",
                                                 "access": "trusted"}).json()
    assert m["title"] == "Weekly sync" and m["is_host"] and m["settings"]["access"] == "trusted"
    code = m["code"]
    assert client.post("/meet", headers=host, json={"access": "everyone"}).status_code == 422
    mine = client.get("/meet", headers=host).json()
    assert [u["code"] for u in mine["upcoming"]][0] == code and mine["recent"] == []
    info = client.get(f"/meet/{code}", headers=other).json()
    assert info["title"] == "Weekly sync" and not info["is_host"] and info["must_ask"] is False  # signed in: trusted
    assert client.get(f"/meet/{code}", headers=_guest(client)).json()["must_ask"] is True  # guests ask first
    assert client.patch(f"/meet/{code}", headers=other, json={"title": "x"}).status_code == 403
    r = client.patch(f"/meet/{code}", headers=host, json={"title": "Sync", "chat": False, "clear_schedule": True})
    assert r.json()["title"] == "Sync" and r.json()["settings"]["chat"] is False and r.json()["scheduled_for"] is None
    assert client.delete(f"/meet/{code}", headers=other).status_code == 403
    assert client.delete(f"/meet/{code}", headers=host).json()["ok"]
    assert client.get(f"/meet/{code}", headers=host).status_code == 404


def test_ask_to_join_admit_and_deny(client, make_user):
    (host, _), = [make_user()]
    code = client.post("/meet", headers=host, json={"access": "ask"}).json()["code"]
    g1, g2 = _guest(client, "Asha"), _guest(client, "Ravi")
    with client.websocket_connect(f"/ws/meet/{code}?token={_token(host)}") as h:
        assert h.receive_json()["host"] is True
        with client.websocket_connect(f"/ws/meet/{code}?token={_token(g1)}") as a:
            w = a.receive_json()
            assert w["type"] == "waiting" and w["hosts_here"] is True
            knock = h.receive_json()
            assert knock == {"type": "knock", "id": knock["id"], "name": "Asha"}
            a.send_json({"type": "chat", "text": "let me in"})  # ignored while waiting
            h.send_json({"type": "admit", "id": knock["id"]})
            welcome = a.receive_json()
            assert welcome["type"] == "welcome" and welcome["host"] is False and welcome["chat"] == []
            assert h.receive_json()["type"] == "joined"
            assert h.receive_json() == {"type": "knock_done", "id": knock["id"]}

            with client.websocket_connect(f"/ws/meet/{code}?token={_token(g2)}") as b:
                assert b.receive_json()["type"] == "waiting"
                k2 = h.receive_json()
                a.send_json({"type": "deny", "id": k2["id"]})  # not a host: ignored
                h.send_json({"type": "deny", "id": k2["id"]})
                assert b.receive_json()["type"] == "denied"
                with pytest.raises(WebSocketDisconnect) as e:
                    b.receive_json()
                assert e.value.code == meet_routes.CLOSE_DENIED
            assert h.receive_json() == {"type": "knock_done", "id": k2["id"]}


def test_host_controls(client, make_user):
    (host, _), (p1, _), (p2, _) = make_user(), make_user(), make_user()
    code = client.post("/meet", headers=host).json()["code"]
    with client.websocket_connect(f"/ws/meet/{code}?token={_token(host)}") as h:
        h.receive_json()
        with client.websocket_connect(f"/ws/meet/{code}?token={_token(p1)}") as a:
            ya = a.receive_json()["you"]
            h.receive_json()
            # a participant can't use host controls
            a.send_json({"type": "settings", "settings": {"chat": False}})
            a.send_json({"type": "mute", "all": True})
            # host mutes a
            h.send_json({"type": "mute", "id": ya})
            assert a.receive_json()["type"] == "muted_by_host"
            assert h.receive_json()["type"] == "state"
            # host turns chat off: a's messages are dropped, the host's still go out
            h.send_json({"type": "settings", "settings": {"chat": False, "share": False, "access": "nonsense"}})
            s = a.receive_json()
            assert s["type"] == "settings" and s["settings"] == {"access": "open", "chat": False, "share": False,
                                                                  "react": True}
            h.receive_json()
            a.send_json({"type": "chat", "text": "hi"})
            a.send_json({"type": "state", "screen": True})
            assert a.receive_json()["type"] == "stop_share"
            assert h.receive_json()["screen"] is False
            h.send_json({"type": "chat", "text": "host speaking"})
            assert a.receive_json()["text"] == "host speaking"
            h.receive_json()
            # co-host
            h.send_json({"type": "cohost", "id": ya, "on": True})
            assert a.receive_json()["host"] is True
            assert a.receive_json()["type"] == "knocks"
            h.receive_json()
            with client.websocket_connect(f"/ws/meet/{code}?token={_token(p2)}") as b:
                yb = b.receive_json()["you"]
                h.receive_json(), a.receive_json()
                a.send_json({"type": "remove", "id": yb})  # a co-host can remove people
                assert b.receive_json()["type"] == "removed"
                with pytest.raises(WebSocketDisconnect) as e:
                    b.receive_json()
                assert e.value.code == meet_routes.CLOSE_REMOVED
            assert h.receive_json() == {"type": "left", "id": yb}
            a.receive_json()
            h.send_json({"type": "end"})
            assert a.receive_json()["type"] == "ended"
    assert code not in meet_routes.meetings
    # the attendance report and history remember it
    report = client.get(f"/meet/{code}/attendance", headers=host).json()
    assert len(report["people"]) == 3 and all(p["here_now"] is False for p in report["people"])
    assert client.get(f"/meet/{code}/attendance", headers=p1).status_code == 403
    recent = client.get("/meet", headers=p1).json()["recent"]
    assert recent[0]["code"] == code and recent[0]["people"] == 3 and not recent[0]["is_host"]
