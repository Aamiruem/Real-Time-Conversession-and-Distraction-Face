"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, PageHead } from "@/components/ui";
import { api, getToken, toDate } from "@/lib/api";
import { livePayload, STATE_COLORS, STATE_EMOJI } from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { useFaceTracker } from "@/lib/useFaceTracker";

function wsBase() {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env.replace(/\/$/, "");
  const { protocol, hostname, host, port } = window.location;
  if (port === "3000") return `ws://${hostname}:8010`; // next dev: backend runs separately
  return `${protocol === "https:" ? "wss" : "ws"}://${host}`; // production: same origin via Nginx
}

const SENTIMENT = { positive: "😊", negative: "😟", neutral: "😐" };

export default function Rooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [people, setPeople] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [typing, setTyping] = useState({});
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [newRoom, setNewRoom] = useState({ name: "", description: "" });
  const [err, setErr] = useState("");
  const ws = useRef(null);
  const chatEnd = useRef(null);
  const lastTyping = useRef(0);
  const cam = useFaceTracker();
  const lastPush = useRef(0);

  const loadRooms = () =>
    api("/rooms")
      .then((r) => {
        setRooms(r);
        setRoomId((cur) => cur ?? r[0]?.id ?? null);
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    loadRooms();
  }, []);

  // connect (with auto-reconnect) whenever the room changes
  useEffect(() => {
    if (!roomId) return;
    let closed = false;
    let retry;
    api(`/rooms/${roomId}/messages?limit=100`)
      .then(setMessages)
      .catch(() => {});
    const connect = () => {
      const sock = new WebSocket(`${wsBase()}/ws/rooms/${roomId}?token=${getToken()}`);
      ws.current = sock;
      sock.onopen = () => setLive(true);
      sock.onclose = () => {
        setLive(false);
        if (!closed) retry = window.setTimeout(connect, 2000);
      };
      sock.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.type === "chat") setMessages((ms) => (ms.some((x) => x.id === d.id) ? ms : [...ms, d]));
        else if (d.type === "presence") setPeople(d.participants);
        else if (d.type === "focus_update")
          setPeople((ps) =>
            ps.map((p) => (p.user_id === d.user_id ? { ...p, focus_pct: d.focus_pct, state: d.state } : p)),
          );
        else if (d.type === "alert") setAlerts((a) => [...a, d.message].slice(-3));
        else if (d.type === "typing") setTyping((t) => ({ ...t, [d.username]: Date.now() }));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
      setPeople([]);
      setAlerts([]);
    };
  }, [roomId]);

  useEffect(() => {
    // block body on purpose: newer browsers return a Promise from scrollIntoView, which React would treat as cleanup
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  // share my live focus with the room (backend broadcasts it as focus_update)
  useEffect(() => {
    if (cam.status !== "running") return;
    const now = Date.now();
    if (now - lastPush.current > 3000 && cam.metrics.elapsedSec > 1) {
      lastPush.current = now;
      api("/attention/update", { method: "POST", json: livePayload(cam.metrics) }).catch(() => {});
    }
  }, [cam.metrics, cam.status]);

  async function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !roomId) return;
    setText("");
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "chat", content }));
    else await api(`/rooms/${roomId}/messages`, { method: "POST", json: { content } }).catch((x) => setErr(x.message));
  }

  function onType(v) {
    setText(v);
    if (Date.now() - lastTyping.current > 1500 && ws.current?.readyState === WebSocket.OPEN) {
      lastTyping.current = Date.now();
      ws.current.send(JSON.stringify({ type: "typing" }));
    }
  }

  async function createRoom(e) {
    e.preventDefault();
    try {
      const r = await api("/rooms", { method: "POST", json: newRoom });
      setNewRoom({ name: "", description: "" });
      await loadRooms();
      setRoomId(r.id);
    } catch (x) {
      setErr(x.message);
    }
  }

  const room = rooms.find((r) => r.id === roomId);
  const typers = Object.entries(typing)
    .filter(([u, t]) => u !== user?.username && Date.now() - t < 3000)
    .map(([u]) => u);
  const focusVals = people.map((p) => p.focus_pct).filter((v) => v != null);

  return (
    <>
      <PageHead
        eyebrow="Focus room · real time"
        title={room ? room.name : "Focus Rooms"}
        highlight={room?.name ?? "Focus Rooms"}
        sub={room?.description || "Chat in real time while everyone sees each other's live focus score."}
      />
      {err && <div className="alert error">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,2.4fr) minmax(0,1.1fr)" }}>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="card">
            <label className="field">
              <span>Room</span>
              <select value={roomId ?? ""} onChange={(e) => setRoomId(Number(e.target.value))}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={createRoom}>
              <input
                placeholder="New room name"
                required
                minLength={2}
                value={newRoom.name}
                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
              />
              <input
                placeholder="Description (optional)"
                style={{ marginTop: 8 }}
                value={newRoom.description}
                onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
              />
              <button className="btn ghost sm block" style={{ marginTop: 8 }}>
                ➕ Create room
              </button>
            </form>
          </div>
          <div className="video-wrap">
            <video ref={cam.videoRef} playsInline muted />
            <canvas ref={cam.canvasRef} />
            {cam.status !== "running" && <div className="placeholder small">Share your live focus with the room</div>}
          </div>
          {cam.status === "running" ? (
            <>
              <Gauge value={cam.metrics.focusPct} label={`My focus · ${cam.metrics.state}`} />
              <button className="btn ghost sm" onClick={cam.stop}>
                Stop camera
              </button>
            </>
          ) : (
            <button className="btn sm" onClick={cam.start}>
              📷 Share my live focus
            </button>
          )}
          {cam.error && <div className="alert error">{cam.error}</div>}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <b>Conversation</b>
            <span className="small">{live ? "🟢 live" : "🟠 connecting…"}</span>
          </div>
          {alerts.map((a, i) => (
            <div key={i} className="alarm" style={{ marginBottom: 8 }}>
              {a}
            </div>
          ))}
          <div className="chat">
            {messages.map((msg) => (
              <div key={msg.id} className={`msg ${msg.username === user?.username ? "me" : ""}`}>
                <div className="meta">
                  <b>{msg.username}</b> ·{" "}
                  {toDate(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {SENTIMENT[msg.sentiment_label]}
                  {msg.sender_focus != null && ` · focus ${msg.sender_focus.toFixed(0)}%`}
                </div>
                {msg.content}
                {msg.is_toxic && (
                  <div className="small" style={{ color: "#f87171" }}>
                    ⚠️ flagged as possibly offensive
                  </div>
                )}
                {msg.keywords.length > 0 && <div className="meta">{msg.keywords.map((k) => `#${k}`).join(" ")}</div>}
              </div>
            ))}
            {!messages.length && <p className="muted">No messages yet — say hello 👋</p>}
            <div ref={chatEnd} />
          </div>
          <p className="small muted" style={{ minHeight: 20, margin: "6px 0" }}>
            {typers.length ? `✍️ ${typers.join(", ")} typing…` : ""}
          </p>
          <form className="row" onSubmit={send}>
            <input
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="Type a message…"
              maxLength={2000}
            />
            <button className="btn" style={{ flex: "none" }} disabled={!roomId}>
              Send
            </button>
          </form>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <b>👥 Online</b>
          {people.map((p) => (
            <div
              key={p.user_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 10px",
                margin: "6px 0",
                borderRadius: 10,
                background: "#0a1222",
                borderLeft: `4px solid ${STATE_COLORS[p.state] ?? "#64748b"}`,
              }}
            >
              <span>
                {STATE_EMOJI[p.state] ?? ""} {p.username}
              </span>
              <b>{p.focus_pct == null ? "" : `${p.focus_pct.toFixed(0)}%`}</b>
            </div>
          ))}
          {focusVals.length > 0 && (
            <p style={{ marginTop: 12 }}>
              Room avg focus <b>{(focusVals.reduce((a, b) => a + b, 0) / focusVals.length).toFixed(0)}%</b>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
