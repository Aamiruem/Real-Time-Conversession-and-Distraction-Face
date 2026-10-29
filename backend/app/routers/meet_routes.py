"""Video meetings (like Zoom / Google Meet).

This server only introduces the participants to each other ("signaling"): it relays WebRTC offers, answers and
network candidates, plus meeting events (mic / camera / hand / screen state, chat, reactions). Audio and video
flow directly between the browsers, encrypted by them (DTLS-SRTP), so the server never sees or stores media.

Every participant connects to every other one (a "mesh"), which is fast and needs no media server; it suits
small meetings, so they are capped at MEET_MAX_PEOPLE (default 8). Meetings live in this process's memory and
vanish when the last person leaves - run one backend process (the default) or add a shared store to scale out.
"""
import json
import re
import secrets
import string
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.auth import decode_token, get_current_user
from app.config import settings
from app.database import SessionLocal
from app.models import User

router = APIRouter(tags=["meet"])

CODE_RE = re.compile(r"^[a-z]{3}-[a-z]{4}-[a-z]{3}$")
REACTIONS = {"👍", "👏", "❤️", "😂", "😮", "🎉", "🙌", "🤔"}
MAX_MESSAGE = 64_000  # an SDP offer is a few KB; anything bigger is not a meeting message
CHAT_HISTORY = 200


@dataclass
class Peer:
    id: str
    ws: WebSocket
    user_id: int
    name: str
    state: dict = field(default_factory=lambda: {"mic": True, "cam": True, "hand": False, "screen": False})

    def public(self) -> dict:
        return {"id": self.id, "user_id": self.user_id, "name": self.name, **self.state}


@dataclass
class Meeting:
    code: str
    peers: dict[str, Peer] = field(default_factory=dict)
    chat: deque = field(default_factory=lambda: deque(maxlen=CHAT_HISTORY))
    started: float = field(default_factory=time.time)

    async def send(self, peer: Peer, payload: dict):
        try:
            await peer.ws.send_json(payload)
        except Exception:  # noqa: BLE001 - a closed socket is cleaned up by its own handler
            pass

    async def broadcast(self, payload: dict, skip: str | None = None):
        for p in list(self.peers.values()):
            if p.id != skip:
                await self.send(p, payload)


meetings: dict[str, Meeting] = {}


def new_code() -> str:
    """abc-defg-hij: easy to read out, ~10^14 combinations (unguessable enough for a link)."""
    letters = string.ascii_lowercase
    part = lambda n: "".join(secrets.choice(letters) for _ in range(n))  # noqa: E731
    return f"{part(3)}-{part(4)}-{part(3)}"


def ice_servers() -> list[dict]:
    servers = [{"urls": [u.strip() for u in settings.STUN_URLS.split(",") if u.strip()]}]
    if settings.TURN_URLS:
        servers.append({"urls": [u.strip() for u in settings.TURN_URLS.split(",") if u.strip()],
                        "username": settings.TURN_USERNAME, "credential": settings.TURN_CREDENTIAL})
    return servers


@router.post("/meet")
def create_meeting(user: User = Depends(get_current_user)):
    code = new_code()
    while code in meetings:
        code = new_code()
    return {"code": code, "max_people": settings.MEET_MAX_PEOPLE}


@router.get("/meet/{code}")
def meeting_info(code: str, user: User = Depends(get_current_user)):
    if not CODE_RE.match(code):
        raise HTTPException(404, "That meeting code doesn't look right (it's like abc-defg-hij)")
    m = meetings.get(code)
    people = [p.name for p in m.peers.values()] if m else []
    return {"code": code, "people": people, "max_people": settings.MEET_MAX_PEOPLE,
            "full": len(people) >= settings.MEET_MAX_PEOPLE, "ice_servers": ice_servers()}


async def handle(meeting: Meeting, me: Peer, data: dict):
    kind = data.get("type")
    if kind == "signal":  # WebRTC offer / answer / ICE candidate for one other participant
        target = meeting.peers.get(str(data.get("to", "")))
        if target:
            msg = {"type": "signal", "from": me.id}
            for key in ("description", "candidate"):
                if key in data:
                    msg[key] = data[key]
            await meeting.send(target, msg)
    elif kind == "state":  # mic / camera / hand / screen share
        me.state.update({k: bool(data[k]) for k in ("mic", "cam", "hand", "screen") if k in data})
        await meeting.broadcast({"type": "state", **me.public()}, skip=me.id)
    elif kind == "chat":
        text = str(data.get("text", "")).strip()[:1000]
        if text:
            msg = {"type": "chat", "id": me.id, "name": me.name, "text": text, "at": time.time()}
            meeting.chat.append(msg)
            await meeting.broadcast(msg)
    elif kind == "react" and data.get("emoji") in REACTIONS:
        await meeting.broadcast({"type": "react", "id": me.id, "emoji": data["emoji"]})


@router.websocket("/ws/meet/{code}")
async def meeting_socket(ws: WebSocket, code: str, token: str = Query(...)):
    if not CODE_RE.match(code):
        await ws.close(code=4404)
        return
    with SessionLocal() as db:
        user_id = decode_token(token)
        user = db.get(User, user_id) if user_id else None
        name = (user.full_name or user.username) if user else ""
    if not user:
        await ws.close(code=4401)
        return
    meeting = meetings.setdefault(code, Meeting(code))
    if len(meeting.peers) >= settings.MEET_MAX_PEOPLE:
        await ws.accept()
        await ws.send_json({"type": "full", "max_people": settings.MEET_MAX_PEOPLE})
        await ws.close(code=4403)
        return

    await ws.accept()
    me = Peer(id=secrets.token_hex(6), ws=ws, user_id=user.id, name=name[:60])
    others = [p.public() for p in meeting.peers.values()]
    meeting.peers[me.id] = me
    await meeting.send(me, {"type": "welcome", "you": me.id, "peers": others, "chat": list(meeting.chat),
                            "ice_servers": ice_servers(), "started": meeting.started})
    await meeting.broadcast({"type": "joined", **me.public()}, skip=me.id)
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_MESSAGE:
                continue
            try:
                data = json.loads(raw)
            except ValueError:
                continue
            if isinstance(data, dict):
                await handle(meeting, me, data)
    except WebSocketDisconnect:
        pass
    finally:
        meeting.peers.pop(me.id, None)
        if meeting.peers:
            await meeting.broadcast({"type": "left", "id": me.id})
        else:
            meetings.pop(code, None)
