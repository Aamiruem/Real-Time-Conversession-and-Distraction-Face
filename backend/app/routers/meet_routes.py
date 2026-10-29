"""Video meetings (like Zoom / Google Meet).

This server only introduces the participants to each other ("signaling"): it relays WebRTC offers, answers and
network candidates, plus meeting events (mic / camera / hand / screen state, chat, reactions). Audio and video
flow directly between the browsers, encrypted by them (DTLS-SRTP), so the server never sees or stores media.

Every participant connects to every other one (a "mesh"), which is fast and needs no media server; it suits
small meetings, so they are capped at MEET_MAX_PEOPLE (default 8). A live call lives in this process's memory and
vanishes when the last person leaves - run one backend process (the default) or add a shared store to scale out.

What is stored (meeting_rooms / meeting_attendance): each link with its host, title, time and settings, and who
attended when - like Meet's meeting details and attendance report. Chat is not stored: it ends with the call.

Hosts (the creator, plus anyone they make a co-host) can: let people in who ask to join, mute someone or
everyone, remove someone, lower hands, lock chat / screen sharing / reactions, set who may join without asking,
and end the call for everyone.
"""
import json
import re
import secrets
import string
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.auth import decode_token, get_current_user
from app.config import settings
from app.database import SessionLocal, get_db
from app.models import MeetingAttendance, MeetingRoom, User, utcnow

router = APIRouter(tags=["meet"])

CODE_RE = re.compile(r"^[a-z]{3}-[a-z]{4}-[a-z]{3}$")
REACTIONS = {"👍", "👏", "❤️", "😂", "😮", "🎉", "🙌", "🤔", "💖"}
MAX_MESSAGE = 64_000  # an SDP offer is a few KB; anything bigger is not a meeting message
CHAT_HISTORY = 200
Access = Literal["open", "trusted", "ask"]
# WebSocket close codes the app shows a message for
CLOSE_NOT_FOUND, CLOSE_DENIED, CLOSE_REMOVED, CLOSE_ENDED = 4404, 4405, 4406, 4410


def is_guest(user: User) -> bool:
    return user.username.startswith("guest-")


@dataclass
class Peer:
    id: str
    ws: WebSocket
    user_id: int
    name: str
    guest: bool = False
    attendance_id: int | None = None
    state: dict = field(default_factory=lambda: {"mic": True, "cam": True, "hand": False, "screen": False})

    def public(self, meeting: "Meeting") -> dict:
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "host": meeting.is_host(self), **self.state}


@dataclass
class Meeting:
    code: str
    room_id: int
    host_id: int
    title: str = ""
    settings: dict = field(default_factory=lambda: {"access": "open", "chat": True, "share": True, "react": True})
    cohosts: set = field(default_factory=set)  # user ids
    peers: dict[str, Peer] = field(default_factory=dict)
    waiting: dict[str, Peer] = field(default_factory=dict)  # asked to join, not let in yet
    chat: deque = field(default_factory=lambda: deque(maxlen=CHAT_HISTORY))
    started: float = field(default_factory=time.time)

    def is_host(self, peer: Peer) -> bool:
        return peer.user_id == self.host_id or peer.user_id in self.cohosts

    def must_ask(self, peer: Peer) -> bool:
        if self.is_host(peer):
            return False
        access = self.settings["access"]
        return access == "ask" or (access == "trusted" and peer.guest)

    def hosts(self) -> list[Peer]:
        return [p for p in self.peers.values() if self.is_host(p)]

    async def send(self, peer: Peer, payload: dict):
        try:
            await peer.ws.send_json(payload)
        except Exception:  # noqa: BLE001 - a closed socket is cleaned up by its own handler
            pass

    async def broadcast(self, payload: dict, skip: str | None = None):
        for p in list(self.peers.values()):
            if p.id != skip:
                await self.send(p, payload)

    async def to_hosts(self, payload: dict):
        for p in self.hosts():
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


def _utc(d: datetime | None) -> str | None:
    if d is None:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()  # noqa: UP017 - SQLite drops the zone


def _room(db: Session, code: str) -> MeetingRoom:
    if not CODE_RE.match(code):
        raise HTTPException(404, "That meeting code doesn't look right (it's like abc-defg-hij)")
    room = db.scalar(select(MeetingRoom).where(MeetingRoom.code == code))
    if not room:
        raise HTTPException(404, "Check your meeting code — this meeting doesn't exist")
    return room


def _own(db: Session, code: str, user: User) -> MeetingRoom:
    room = _room(db, code)
    if room.host_id != user.id:
        raise HTTPException(403, "Only the meeting's host can do that")
    return room


def _settings(room: MeetingRoom) -> dict:
    return {"access": room.access, "chat": room.chat_on, "share": room.share_on, "react": room.react_on}


def _describe(db: Session, room: MeetingRoom, user: User) -> dict:
    host = db.get(User, room.host_id)
    live = meetings.get(room.code)
    return {"code": room.code, "title": room.title, "host": (host.full_name or host.username) if host else "",
            "is_host": room.host_id == user.id, "scheduled_for": _utc(room.scheduled_for),
            "created_at": _utc(room.created_at), "settings": _settings(room),
            "live": bool(live and live.peers), "people_now": len(live.peers) if live else 0}


# ---------------------------------------------------------------- REST: create, list, edit, delete, attendance
class MeetingIn(BaseModel):
    title: str = Field("", max_length=120)
    scheduled_for: datetime | None = None
    access: Access = "open"


class MeetingPatch(BaseModel):
    title: str | None = Field(None, max_length=120)
    scheduled_for: datetime | None = None
    clear_schedule: bool = False
    access: Access | None = None
    chat: bool | None = None
    share: bool | None = None
    react: bool | None = None


@router.post("/meet")
def create_meeting(data: MeetingIn | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A new meeting link, hosted by you. Optional: a title, a time (a meeting for later) and who may join freely."""
    data = data or MeetingIn()
    code = new_code()
    while code in meetings or db.scalar(select(MeetingRoom.id).where(MeetingRoom.code == code)):
        code = new_code()
    room = MeetingRoom(code=code, host_id=user.id, title=data.title.strip(), scheduled_for=data.scheduled_for,
                       access=data.access)
    db.add(room)
    db.commit()
    return {**_describe(db, room, user), "max_people": settings.MEET_MAX_PEOPLE}


@router.get("/meet")
def my_meetings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Your meetings: upcoming ones you scheduled, and recent ones you hosted or attended (with how long)."""
    attended = select(MeetingAttendance.room_id).where(MeetingAttendance.user_id == user.id)
    rooms = db.scalars(select(MeetingRoom).where(or_(MeetingRoom.host_id == user.id, MeetingRoom.id.in_(attended)))
                       .order_by(MeetingRoom.created_at.desc()).limit(100)).all()
    now = utcnow()
    upcoming, recent = [], []
    for room in rooms:
        rows = db.scalars(select(MeetingAttendance).where(MeetingAttendance.room_id == room.id)).all()
        item = _describe(db, room, user)
        if rows:
            first = min(r.joined_at for r in rows)
            last = max((r.left_at or now).replace(tzinfo=None) for r in rows)
            item |= {"last_held": _utc(first), "minutes": round((last - first.replace(tzinfo=None)).total_seconds() / 60),
                     "people": len({r.user_id for r in rows})}
            recent.append(item)
        sched = room.scheduled_for and room.scheduled_for.replace(tzinfo=timezone.utc)  # noqa: UP017
        if room.host_id == user.id and (not rows or (sched and sched > now)):
            upcoming.append(item)
    upcoming.sort(key=lambda m: m["scheduled_for"] or m["created_at"])
    recent.sort(key=lambda m: m["last_held"], reverse=True)
    return {"upcoming": upcoming, "recent": recent[:30]}


@router.get("/meet/{code}")
def meeting_info(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = _room(db, code)
    m = meetings.get(code)
    people = [p.name for p in m.peers.values()] if m else []
    probe = Peer(id="", ws=None, user_id=user.id, name="", guest=is_guest(user))  # type: ignore[arg-type]
    ask = (m or Meeting(code, room_id=room.id, host_id=room.host_id, settings=_settings(room))).must_ask(probe)
    return {**_describe(db, room, user), "people": people, "max_people": settings.MEET_MAX_PEOPLE,
            "full": len(people) >= settings.MEET_MAX_PEOPLE, "must_ask": ask, "ice_servers": ice_servers()}


@router.patch("/meet/{code}")
async def edit_meeting(code: str, data: MeetingPatch, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    room = _own(db, code, user)
    if data.title is not None:
        room.title = data.title.strip()
    if data.scheduled_for is not None or data.clear_schedule:
        room.scheduled_for = None if data.clear_schedule else data.scheduled_for
    for key, column in (("access", "access"), ("chat", "chat_on"), ("share", "share_on"), ("react", "react_on")):
        if getattr(data, key) is not None:
            setattr(room, column, getattr(data, key))
    db.commit()
    live = meetings.get(code)
    if live:  # a call in progress picks the change up at once
        live.title, live.settings = room.title, _settings(room)
        await live.broadcast({"type": "settings", "settings": live.settings, "title": live.title})
    return _describe(db, room, user)


@router.delete("/meet/{code}")
async def delete_meeting(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = _own(db, code, user)
    live = meetings.get(code)
    if live:
        await end_for_everyone(live)
    db.execute(delete(MeetingAttendance).where(MeetingAttendance.room_id == room.id))
    db.delete(room)
    db.commit()
    return {"ok": True}


@router.get("/meet/{code}/attendance")
def attendance(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Who joined, when, and for how long (host only)."""
    room = _own(db, code, user)
    rows = db.scalars(select(MeetingAttendance).where(MeetingAttendance.room_id == room.id)
                      .order_by(MeetingAttendance.joined_at)).all()
    now = utcnow().replace(tzinfo=None)
    people: dict[int, dict] = {}
    for r in rows:
        secs = ((r.left_at or now).replace(tzinfo=None) - r.joined_at.replace(tzinfo=None)).total_seconds()
        p = people.setdefault(r.user_id, {"name": r.name, "first_joined": _utc(r.joined_at), "last_left": None,
                                          "minutes": 0.0, "visits": 0, "here_now": False})
        p["minutes"] += secs / 60
        p["visits"] += 1
        p["last_left"] = _utc(r.left_at)
        p["here_now"] = p["here_now"] or r.left_at is None
    for p in people.values():
        p["minutes"] = round(p["minutes"], 1)
    return {"code": code, "title": room.title, "people": list(people.values())}


# ---------------------------------------------------------------- live call
def _record_join(meeting: Meeting, peer: Peer):
    with SessionLocal() as db:
        row = MeetingAttendance(room_id=meeting.room_id, user_id=peer.user_id, name=peer.name)
        db.add(row)
        db.commit()
        peer.attendance_id = row.id


def _record_leave(peer: Peer):
    if peer.attendance_id is None:
        return
    with SessionLocal() as db:
        row = db.get(MeetingAttendance, peer.attendance_id)
        if row and row.left_at is None:
            row.left_at = utcnow()
            db.commit()


async def admit(meeting: Meeting, peer: Peer):
    """Bring someone into the call: they get everyone and the chat, everyone gets them."""
    meeting.waiting.pop(peer.id, None)
    others = [p.public(meeting) for p in meeting.peers.values()]
    meeting.peers[peer.id] = peer
    _record_join(meeting, peer)
    welcome = {"type": "welcome", "you": peer.id, "host": meeting.is_host(peer), "peers": others,
               "chat": list(meeting.chat), "ice_servers": ice_servers(), "started": meeting.started,
               "settings": meeting.settings, "title": meeting.title}
    if meeting.is_host(peer):
        welcome["waiting"] = [{"id": w.id, "name": w.name} for w in meeting.waiting.values()]
    await meeting.send(peer, welcome)
    await meeting.broadcast({"type": "joined", **peer.public(meeting)}, skip=peer.id)


async def end_for_everyone(meeting: Meeting):
    for p in [*meeting.peers.values(), *meeting.waiting.values()]:
        await meeting.send(p, {"type": "ended"})
        try:
            await p.ws.close(code=CLOSE_ENDED)
        except Exception:  # noqa: BLE001
            pass


async def host_action(meeting: Meeting, me: Peer, kind: str, data: dict):
    target_id = str(data.get("id", ""))
    target = meeting.peers.get(target_id)
    if kind in ("admit", "deny"):
        ids = list(meeting.waiting) if data.get("all") else [target_id]
        for wid in ids:
            w = meeting.waiting.get(wid)
            if not w:
                continue
            if kind == "admit":
                if len(meeting.peers) >= settings.MEET_MAX_PEOPLE:
                    await meeting.send(me, {"type": "notice", "text": "The meeting is full"})
                    break
                await admit(meeting, w)
            else:
                meeting.waiting.pop(wid, None)
                await meeting.send(w, {"type": "denied"})
                await w.ws.close(code=CLOSE_DENIED)
            await meeting.to_hosts({"type": "knock_done", "id": wid})
    elif kind == "mute":  # like Meet: a host can mute you, only you can unmute yourself
        targets = [p for p in meeting.peers.values() if p.id != me.id] if data.get("all") else [target] if target else []
        for p in targets:
            p.state["mic"] = False
            await meeting.send(p, {"type": "muted_by_host", "by": me.name})
            await meeting.broadcast({"type": "state", **p.public(meeting)}, skip=p.id)
    elif kind == "lower_hand":
        targets = list(meeting.peers.values()) if data.get("all") else [target] if target else []
        for p in targets:
            if p.state["hand"]:
                p.state["hand"] = False
                await meeting.send(p, {"type": "hand_lowered", "by": me.name})
                await meeting.broadcast({"type": "state", **p.public(meeting)}, skip=p.id)
    elif kind == "stop_share" and target and target.state["screen"]:
        await meeting.send(target, {"type": "stop_share", "by": me.name})
    elif kind == "remove" and target and target.user_id != meeting.host_id:
        await meeting.send(target, {"type": "removed", "by": me.name})
        await target.ws.close(code=CLOSE_REMOVED)
    elif kind == "cohost" and target and me.user_id == meeting.host_id and target.user_id != meeting.host_id:
        (meeting.cohosts.add if data.get("on") else meeting.cohosts.discard)(target.user_id)
        await meeting.broadcast({"type": "state", **target.public(meeting)})
        if data.get("on"):  # a new co-host sees who is waiting
            await meeting.send(target, {"type": "knocks", "waiting": [{"id": w.id, "name": w.name}
                                                                      for w in meeting.waiting.values()]})
    elif kind == "settings":
        s = data.get("settings") or {}
        if s.get("access") in ("open", "trusted", "ask"):
            meeting.settings["access"] = s["access"]
        for k in ("chat", "share", "react"):
            if isinstance(s.get(k), bool):
                meeting.settings[k] = s[k]
        with SessionLocal() as db:
            room = db.get(MeetingRoom, meeting.room_id)
            if room:
                room.access, room.chat_on = meeting.settings["access"], meeting.settings["chat"]
                room.share_on, room.react_on = meeting.settings["share"], meeting.settings["react"]
                db.commit()
        await meeting.broadcast({"type": "settings", "settings": meeting.settings, "title": meeting.title,
                                 "by": me.name})
        # opening the meeting up lets in whoever was waiting
        for w in list(meeting.waiting.values()):
            if not meeting.must_ask(w) and len(meeting.peers) < settings.MEET_MAX_PEOPLE:
                await admit(meeting, w)
                await meeting.to_hosts({"type": "knock_done", "id": w.id})
    elif kind == "end":
        await end_for_everyone(meeting)


HOST_ONLY = {"admit", "deny", "mute", "lower_hand", "stop_share", "remove", "cohost", "settings", "end"}


async def handle(meeting: Meeting, me: Peer, data: dict):
    kind = data.get("type")
    if me.id not in meeting.peers:  # still waiting to be let in: nothing to do yet
        return
    if kind in HOST_ONLY:
        if meeting.is_host(me):
            await host_action(meeting, me, kind, data)
        return
    host = meeting.is_host(me)
    if kind == "signal":  # WebRTC offer / answer / ICE candidate for one other participant
        target = meeting.peers.get(str(data.get("to", "")))
        if target:
            msg = {"type": "signal", "from": me.id}
            for key in ("description", "candidate"):
                if key in data:
                    msg[key] = data[key]
            await meeting.send(target, msg)
    elif kind == "state":  # mic / camera / hand / screen share
        update = {k: bool(data[k]) for k in ("mic", "cam", "hand", "screen") if k in data}
        if update.get("screen") and not host and not meeting.settings["share"]:
            update["screen"] = False
            await meeting.send(me, {"type": "stop_share", "by": "", "reason": "Screen sharing is turned off by the host"})
        me.state.update(update)
        await meeting.broadcast({"type": "state", **me.public(meeting)}, skip=me.id)
    elif kind == "chat":
        text = str(data.get("text", "")).strip()[:1000]
        if text and (host or meeting.settings["chat"]):
            msg = {"type": "chat", "id": me.id, "name": me.name, "text": text, "at": time.time()}
            meeting.chat.append(msg)
            await meeting.broadcast(msg)
    elif kind == "react" and data.get("emoji") in REACTIONS and (host or meeting.settings["react"]):
        await meeting.broadcast({"type": "react", "id": me.id, "emoji": data["emoji"]})
    elif kind == "caption":  # live captions: your speech as text (made by your own browser), shown to everyone
        text = str(data.get("text", "")).strip()[:300]
        if text:
            await meeting.broadcast({"type": "caption", "id": me.id, "name": me.name, "text": text,
                                     "final": bool(data.get("final"))}, skip=me.id)


@router.websocket("/ws/meet/{code}")
async def meeting_socket(ws: WebSocket, code: str, token: str = Query(...)):
    if not CODE_RE.match(code):
        await ws.close(code=CLOSE_NOT_FOUND)
        return
    with SessionLocal() as db:
        user_id = decode_token(token)
        user = db.get(User, user_id) if user_id else None
        room = db.scalar(select(MeetingRoom).where(MeetingRoom.code == code)) if user else None
        if user and room:
            name, guest = (user.full_name or user.username), is_guest(user)
            fresh = Meeting(code, room_id=room.id, host_id=room.host_id, title=room.title, settings=_settings(room))
    if not user:
        await ws.close(code=4401)
        return
    if not room:
        await ws.close(code=CLOSE_NOT_FOUND)
        return
    meeting = meetings.setdefault(code, fresh)
    if len(meeting.peers) >= settings.MEET_MAX_PEOPLE:
        await ws.accept()
        await ws.send_json({"type": "full", "max_people": settings.MEET_MAX_PEOPLE})
        await ws.close(code=4403)
        return

    await ws.accept()
    me = Peer(id=secrets.token_hex(6), ws=ws, user_id=user.id, name=name[:60], guest=guest)
    if meeting.must_ask(me):  # "Ask to join": wait until a host lets you in
        meeting.waiting[me.id] = me
        await meeting.send(me, {"type": "waiting", "hosts_here": bool(meeting.hosts()), "title": meeting.title})
        await meeting.to_hosts({"type": "knock", "id": me.id, "name": me.name})
    else:
        await admit(meeting, me)
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
    except (WebSocketDisconnect, RuntimeError):  # RuntimeError: a host closed this socket (removed / denied)
        pass
    finally:
        if meeting.waiting.pop(me.id, None):
            await meeting.to_hosts({"type": "knock_done", "id": me.id})
        if meeting.peers.pop(me.id, None):
            _record_leave(me)
            await meeting.broadcast({"type": "left", "id": me.id})
        if not meeting.peers and not meeting.waiting and meetings.get(code) is meeting:
            meetings.pop(code, None)
