"""Background WebSocket client that keeps a room's live events in memory.

Streamlit reruns the script on every interaction, so the socket lives in a daemon
thread and the page just re-reads `messages` / `participants` on each refresh.
"""
import json
import threading
import time

import websocket

from utils.api_client import BACKEND_WS_URL


class RoomSocket:
    def __init__(self, room_id: int, token: str, history: list[dict] | None = None):
        self.room_id = room_id
        self.token = token
        self.messages: list[dict] = list(history or [])
        self.participants: list[dict] = []
        self.alerts: list[str] = []
        self.typing: dict[str, float] = {}
        self.connected = False
        self._stop = False
        self._lock = threading.Lock()
        self._ws: websocket.WebSocketApp | None = None
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        url = f"{BACKEND_WS_URL}/ws/rooms/{self.room_id}?token={self.token}"
        while not self._stop:  # auto-reconnect
            self._ws = websocket.WebSocketApp(
                url,
                on_open=lambda _ws: setattr(self, "connected", True),
                on_close=lambda *_: setattr(self, "connected", False),
                on_message=self._on_message,
            )
            self._ws.run_forever(ping_interval=20, ping_timeout=10)
            if not self._stop:
                time.sleep(2)

    def _on_message(self, _ws, raw: str):
        data = json.loads(raw)
        kind = data.get("type")
        with self._lock:
            if kind == "chat":
                if not any(m["id"] == data["id"] for m in self.messages[-50:]):
                    self.messages.append(data)
            elif kind == "presence":
                self.participants = data["participants"]
            elif kind == "focus_update":
                for p in self.participants:
                    if p["user_id"] == data["user_id"]:
                        p["focus_pct"], p["state"] = data["focus_pct"], data["state"]
            elif kind == "alert":
                self.alerts = (self.alerts + [data["message"]])[-5:]
            elif kind == "typing":
                self.typing[data["username"]] = time.time()

    def send_chat(self, content: str) -> bool:
        try:
            self._ws.send(json.dumps({"type": "chat", "content": content}))
            return True
        except Exception:
            return False

    def typing_users(self, me: str) -> list[str]:
        now = time.time()
        return [u for u, ts in self.typing.items() if u != me and now - ts < 3]

    def snapshot(self):
        with self._lock:
            return list(self.messages), [dict(p) for p in self.participants], list(self.alerts)

    def close(self):
        self._stop = True
        if self._ws:
            self._ws.close()
