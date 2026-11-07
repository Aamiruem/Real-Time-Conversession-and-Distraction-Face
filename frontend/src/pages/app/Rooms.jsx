import { useEffect, useRef, useState } from "react";
import { Gauge, PageHead } from "@/components/ui";
import { api, apiBlob, getToken, toDate, wsBase } from "@/lib/api";
import { livePayload, STATE_COLORS, STATE_EMOJI } from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { CAMERA_QUALITY, useFaceTracker } from "@/lib/useFaceTracker";
import { CameraDock } from "@/components/CameraDock";
import { CameraPoster } from "@/components/CameraPoster";
import { SECTIONS } from "@/lib/sections";

const SENTIMENT = { positive: "😊", negative: "😟", neutral: "😐" };
const QUALITY_LABELS = Object.fromEntries(Object.entries(CAMERA_QUALITY).map(([k, q]) => [k, q.label]));
// backend "saved_to" values, as shown to the user
const STORED_IN = { sqlite: "SQL", postgresql: "SQL", "postgresql (aws-rds)": "AWS RDS", mongodb: "MongoDB", s3: "S3", disk: "disk" };

const clock = (secs) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

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
  const cam = useFaceTracker(); // quality / AI speed: the player's ⚙ menu (shared camera settings)
  const lastPush = useRef(0);
  const [recStatus, setRecStatus] = useState("");
  const [recordings, setRecordings] = useState([]);
  const [playing, setPlaying] = useState(null); // { id, url }
  const [storage, setStorage] = useState(null); // /health: database, mongodb, aws

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

  // ---------------------------------------------------------------- recordings (made with the player's Record button)
  const loadRecordings = () =>
    api("/recordings")
      .then(setRecordings)
      .catch(() => {});
  useEffect(() => {
    loadRecordings();
    api("/health")
      .then(setStorage)
      .catch(() => {});
  }, []);

  async function play(rec) {
    if (playing?.id === rec.id) return setPlaying(null);
    try {
      setPlaying({ id: rec.id, url: URL.createObjectURL(await apiBlob(`/recordings/${rec.id}/file`)) });
    } catch (e) {
      setRecStatus(e.message);
    }
  }
  useEffect(() => () => playing && URL.revokeObjectURL(playing.url), [playing]);

  async function downloadRec(rec) {
    try {
      const ext = rec.mime_type.includes("mp4") ? "mp4" : "webm";
      download(await apiBlob(`/recordings/${rec.id}/file`), `${rec.title}.${ext}`);
    } catch (e) {
      setRecStatus(e.message);
    }
  }

  async function deleteRec(rec) {
    if (!window.confirm(`Delete "${rec.title}"? The video and its focus data are removed for good.`)) return;
    await api(`/recordings/${rec.id}`, { method: "DELETE" }).catch((e) => setRecStatus(e.message));
    if (playing?.id === rec.id) setPlaying(null);
    loadRecordings();
  }

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
      <div className="grid split-rooms">
        {/* ---------------- left: rooms + my camera */}
        <div className="rooms-col">
          <section className="card room-card">
            <header className="panel-head">
              <b>🏠 Rooms</b>
              <span className="pill">{rooms.length}</span>
            </header>
            <ul className="room-list">
              {rooms.map((r) => (
                <li key={r.id}>
                  <button type="button" className={r.id === roomId ? "on" : ""} onClick={() => setRoomId(r.id)}>
                    <span className="room-dot" style={{ background: hue(r.name) }}>
                      {r.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="room-text">
                      <b>{r.name}</b>
                      {r.description && <small>{r.description}</small>}
                    </span>
                  </button>
                </li>
              ))}
              {!rooms.length && <li className="muted small">No rooms yet — create the first one.</li>}
            </ul>
            <details className="new-room" open={!rooms.length}>
              <summary>➕ New room</summary>
              <form onSubmit={createRoom}>
                <input
                  placeholder="Room name"
                  required
                  minLength={2}
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                />
                <input
                  placeholder="Description (optional)"
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                />
                <button className="btn sm block">Create room</button>
              </form>
            </details>
          </section>

          <section className="card cam-card">
            <header className="panel-head">
              <b>📷 My camera</b>
              <span className={`pill ${cam.status === "running" ? "ok" : ""}`}>
                {cam.status === "running" ? "Sharing focus" : cam.status === "loading" ? "Starting…" : "Off"}
              </span>
            </header>
            <div className="cam-panel">
              <div className="video-wrap">
                <video ref={cam.videoRef} playsInline muted />
                <canvas ref={cam.canvasRef} />
                {cam.status !== "running" && (
                  <CameraPoster
                    kind="rooms"
                    small
                    color={SECTIONS["/app/rooms"].color}
                    title="Focus Rooms"
                    hint="Share your live focus with the room"
                    loading={cam.status === "loading"}
                    onStart={cam.start}
                  />
                )}
              </div>
              <CameraDock
                running={cam.status === "running"}
                source="rooms"
                title={`${room?.name ?? "Focus room"} recording`}
                metrics={cam.metrics}
                roomId={roomId}
                onSaved={(saved) => {
                  const where = saved.saved_to?.map((w) => STORED_IN[w] ?? w).join(" + ");
                  setRecStatus(`✅ Saved (${(saved.size_bytes / 1e6).toFixed(1)} MB)${where ? ` to ${where}` : ""}`);
                  loadRecordings();
                }}
              />
              {cam.status === "running" && (
                <Gauge value={cam.metrics.focusPct} label={`My focus · ${cam.metrics.state}`} size={150} />
              )}
              {cam.status === "running" ? (
                <div className="cam-actions">
                  <button className="btn ghost sm" onClick={cam.stop}>
                    Stop camera
                  </button>
                </div>
              ) : (
                <button className="btn sm block" onClick={cam.start} disabled={cam.status === "loading"}>
                  📷 Share my live focus
                </button>
              )}
              {recStatus && <p className="small muted cam-status">{recStatus}</p>}
              {cam.error && <div className="alert error">{cam.error}</div>}
            </div>
          </section>
        </div>

        {/* ---------------- middle: conversation */}
        <section className="card chat-card">
          <header className="panel-head">
            <div>
              <b>💬 {room?.name ?? "Conversation"}</b>
              <div className="small muted">
                {people.length} online · {messages.length} message{messages.length === 1 ? "" : "s"}
              </div>
            </div>
            <span className={`pill ${live ? "ok" : "warn"}`}>{live ? "● Live" : "Connecting…"}</span>
          </header>
          {alerts.map((a, i) => (
            <div key={i} className="alarm">
              {a}
            </div>
          ))}
          <div className="chat">
            {messages.map((msg) => {
              const mine = msg.username === user?.username;
              return (
                <div key={msg.id} className={`msg-row ${mine ? "me" : ""}`}>
                  {!mine && (
                    <span className="r-avatar" style={{ background: hue(msg.username) }} title={msg.username}>
                      {msg.username.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className={`msg ${mine ? "me" : ""}`}>
                    <div className="meta">
                      {!mine && <b>{msg.username}</b>}
                      <span>{toDate(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span title={`Sentiment: ${msg.sentiment_label}`}>{SENTIMENT[msg.sentiment_label]}</span>
                      {msg.sender_focus != null && <span className="focus-tag">🎯 {msg.sender_focus.toFixed(0)}%</span>}
                    </div>
                    <div className="msg-text">{msg.content}</div>
                    {msg.is_toxic && <div className="small flag">⚠️ flagged as possibly offensive</div>}
                    {msg.keywords.length > 0 && (
                      <div className="tags">
                        {msg.keywords.map((k) => (
                          <span key={k}>#{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!messages.length && <p className="muted chat-empty">No messages yet — say hello 👋</p>}
            <div ref={chatEnd} />
          </div>
          <p className="small muted chat-typing">{typers.length ? `✍️ ${typers.join(", ")} typing…` : ""}</p>
          <form className="composer" onSubmit={send}>
            <input value={text} onChange={(e) => onType(e.target.value)} placeholder="Type a message…" maxLength={2000} />
            <button className="btn" disabled={!roomId || !text.trim()}>
              Send ➤
            </button>
          </form>
        </section>

        {/* ---------------- right: people, storage, recordings */}
        <div className="rooms-col">
          <section className="card">
            <header className="panel-head">
              <b>👥 Online</b>
              <span className="pill">{people.length}</span>
            </header>
            {focusVals.length > 0 && (
              <div className="room-avg">
                <span>Room avg focus</span>
                <b>{(focusVals.reduce((a, b) => a + b, 0) / focusVals.length).toFixed(0)}%</b>
              </div>
            )}
            <ul className="people">
              {people.map((p) => (
                <li key={p.user_id}>
                  <span className="r-avatar" style={{ background: hue(p.username) }}>
                    {p.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="person">
                    <span>
                      {p.username} <small>{STATE_EMOJI[p.state] ?? ""} {p.state ?? ""}</small>
                    </span>
                    <span className="r-bar">
                      <i style={{ width: `${p.focus_pct ?? 0}%`, background: STATE_COLORS[p.state] ?? "var(--line-strong)" }} />
                    </span>
                  </span>
                  <b>{p.focus_pct == null ? "–" : `${p.focus_pct.toFixed(0)}%`}</b>
                </li>
              ))}
              {!people.length && <li className="muted small">Nobody here yet.</li>}
            </ul>
          </section>

          <section className="card">
            <header className="panel-head">
              <b>🎬 My recordings</b>
              <span className="pill">{recordings.length}</span>
            </header>
            {storage && (
              <div className="storage">
                <StoreChip label={storage.database.location === "aws-rds" ? "AWS RDS" : "SQL"} on={storage.database.connected} />
                <StoreChip label="MongoDB" on={storage.mongodb.connected} off={!storage.mongodb.enabled} />
                <StoreChip label="S3" on={storage.aws} off={!storage.aws} />
              </div>
            )}
            {recordings.map((rec) => (
              <div key={rec.id} className="rec-item">
                <div>
                  <b>{rec.title}</b>
                  <div className="small muted">
                    {toDate(rec.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                    {clock(rec.duration_sec)} · {QUALITY_LABELS[rec.quality] ?? rec.quality}
                    {rec.avg_focus != null && ` · focus ${rec.avg_focus.toFixed(0)}%`}
                    {rec.storage === "s3" && " · S3"}
                    {rec.storage === "mongo" && " · MongoDB"}
                  </div>
                </div>
                <div className="rec-actions">
                  <button className="btn ghost sm" onClick={() => play(rec)} title={playing?.id === rec.id ? "Close" : "Play"}>
                    {playing?.id === rec.id ? "✕" : "▶"}
                  </button>
                  <button className="btn ghost sm" onClick={() => downloadRec(rec)} title="Download">
                    ⬇
                  </button>
                  <button className="btn ghost sm" onClick={() => deleteRec(rec)} title="Delete">
                    🗑
                  </button>
                </div>
                {playing?.id === rec.id && <video className="rec-player" src={playing.url} controls autoPlay playsInline />}
              </div>
            ))}
            {!recordings.length && <p className="muted small">No recordings yet — start the camera and press 🔴 Record.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A steady colour per name, for avatars and room badges. */
function hue(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 48%)`;
}

function StoreChip({ label, on, off }) {
  return (
    <span className={`store-chip ${off ? "off" : on ? "ok" : "bad"}`} title={off ? "Not set up" : on ? "Connected" : "Not reachable"}>
      {off ? "○" : on ? "●" : "✕"} {label}
    </span>
  );
}
