"""Keeps track of live WebSocket connections per room and broadcasts events."""
import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # room_id -> {websocket: (user_id, username)}
        self.rooms: dict[int, dict[WebSocket, tuple[int, str]]] = defaultdict(dict)
        # user_id -> latest focus info, shared with everyone the user is chatting with
        self.focus: dict[int, dict] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, room_id: int, ws: WebSocket, user_id: int, username: str):
        await ws.accept()
        self.loop = asyncio.get_running_loop()
        self.rooms[room_id][ws] = (user_id, username)
        await self.broadcast(room_id, {"type": "presence", "participants": self.participants(room_id)})

    async def disconnect(self, room_id: int, ws: WebSocket):
        self.rooms[room_id].pop(ws, None)
        await self.broadcast(room_id, {"type": "presence", "participants": self.participants(room_id)})

    def participants(self, room_id: int) -> list[dict]:
        seen = {}
        for user_id, username in self.rooms[room_id].values():
            info = self.focus.get(user_id, {})
            seen[user_id] = {
                "user_id": user_id,
                "username": username,
                "focus_pct": info.get("focus_pct"),
                "state": info.get("state", "Offline cam"),
            }
        return list(seen.values())

    def rooms_of_user(self, user_id: int) -> list[int]:
        return [rid for rid, conns in self.rooms.items() if any(u == user_id for u, _ in conns.values())]

    async def broadcast(self, room_id: int, payload: dict):
        dead = []
        for ws in list(self.rooms[room_id]):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.rooms[room_id].pop(ws, None)

    async def push_focus(self, user_id: int, username: str, info: dict):
        """Store a user's latest focus metrics and share them with every room they are in."""
        self.focus[user_id] = info
        for rid in self.rooms_of_user(user_id):
            await self.broadcast(rid, {"type": "focus_update", "user_id": user_id, "username": username, **info})
            if info.get("state") == "Drowsy":
                await self.broadcast(
                    rid, {"type": "alert", "message": f"⚠️ {username} looks drowsy — maybe time for a break?"}
                )


manager = ConnectionManager()
