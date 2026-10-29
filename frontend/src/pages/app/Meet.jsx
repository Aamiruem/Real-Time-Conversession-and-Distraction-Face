// Presence Meet: video meetings in the style of Google Meet (home, lobby with effects, immersive call view).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/MeetIcons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyEffect, EFFECTS } from "@/lib/backgroundEffects";
import { inviteLink, LevelMeter, listDevices, Meeting, openMedia, QUALITY } from "@/lib/meet";
import { useRouter, useSearchParams } from "@/lib/navigation";
import "@/styles/meet.css";

const REACTIONS = ["💖", "👍", "🎉", "👏", "😂", "😮", "🙌", "🤔"];
const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const AVATAR_COLORS = ["#1a73e8", "#e8710a", "#188038", "#d93025", "#9334e6", "#e52592", "#12b5cb", "#f29900"];
const colorFor = (name = "") => AVATAR_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
const initials = (name = "?") =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const timeNow = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const parseCode = (text) => text.trim().toLowerCase().split("code=").pop().split(/[&#\s]/)[0];

/** A <video> bound to a MediaStream (and to the chosen speaker, where the browser allows it). */
function StreamVideo({ stream, muted, mirror, speakerId, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream ?? null;
  });
  useEffect(() => {
    if (speakerId && ref.current?.setSinkId) ref.current.setSinkId(speakerId).catch(() => {});
  }, [speakerId]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${className ?? ""} ${mirror ? "mirror" : ""}`} />;
}

function Avatar({ name, size = 96 }) {
  return (
    <div className="gm-avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

function CopyLink({ code, label = "Copy joining info", className = "gm-text-btn" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt("Copy this link", inviteLink(code));
    }
  };
  return (
    <button className={className} onClick={copy}>
      <Icon name={done ? "info" : "copy"} size={18} /> {done ? "Copied to clipboard" : label}
    </button>
  );
}

function LinkBox({ code }) {
  return (
    <div className="gm-linkbox">
      <span>{inviteLink(code).replace(/^https?:\/\//, "")}</span>
      <CopyLink code={code} label="" className="gm-icon-btn light" />
    </div>
  );
}

// ------------------------------------------------------------------ home
function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [menu, setMenu] = useState(false);
  const [later, setLater] = useState(null);
  const [err, setErr] = useState("");
  const create = async (start) => {
    setMenu(false);
    try {
      const m = await api("/meet", { method: "POST" });
      if (start) router.push(`/app/meet?code=${m.code}`);
      else setLater(m.code);
    } catch (e) {
      setErr(e.message);
    }
  };
  const join = (e) => {
    e.preventDefault();
    const c = parseCode(code);
    if (!CODE_RE.test(c)) return setErr("Check the code — it looks like abc-defg-hij (or paste the whole link).");
    router.push(`/app/meet?code=${c}`);
  };
  return (
    <div className="gm-home">
      <div className="gm-home-text">
        <h1>Video calls and meetings for everyone</h1>
        <p>Connect, collaborate and celebrate from anywhere with Presence Meet — HD video, clear audio, screen sharing and background effects, right in your browser.</p>
        <div className="gm-home-actions">
          <div className="gm-menu-wrap">
            <button className="gm-primary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <Icon name="videoCall" size={20} /> New meeting
            </button>
            {menu && (
              <div className="gm-menu" role="menu">
                <button role="menuitem" onClick={() => create(false)}>
                  <Icon name="link" size={20} /> Create a meeting for later
                </button>
                <button role="menuitem" onClick={() => create(true)}>
                  <Icon name="plus" size={20} /> Start an instant meeting
                </button>
              </div>
            )}
          </div>
          <form onSubmit={join} className="gm-code">
            <Icon name="keyboard" size={20} />
            <input aria-label="Meeting code or link" placeholder="Enter a code or link" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="gm-text-btn" disabled={!code.trim()}>
              Join
            </button>
          </form>
        </div>
        {err && <div className="alert error">{err}</div>}
        <hr />
        <p className="muted small">Share the link — anyone can join from any browser, even without an account (as a guest).</p>
      </div>
      <div className="gm-home-art" aria-hidden="true">
        <div className="gm-art-circle">
          <Icon name="link" size={72} />
        </div>
        <h3>Get a link that you can share</h3>
        <p>Click <b>New meeting</b> to get a link that you can send to people that you want to meet with.</p>
      </div>
      {later && (
        <div className="gm-dialog-backdrop" onClick={() => setLater(null)}>
          <div className="gm-dialog" role="dialog" aria-label="Here's your joining info" onClick={(e) => e.stopPropagation()}>
            <div className="gm-dialog-head">
              <h2>Here&apos;s your joining info</h2>
              <button className="gm-icon-btn light" onClick={() => setLater(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <p>Send this to people that you want to meet with. Be sure to save it so that you can use it later, too.</p>
            <LinkBox code={later} />
            <button className="gm-primary" style={{ marginTop: 16 }} onClick={() => router.push(`/app/meet?code=${later}`)}>
              Join now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Meet() {
  const code = useSearchParams().get("code") ?? "";
  return CODE_RE.test(code) ? <Room key={code} code={code} /> : <Home />;
}

// ------------------------------------------------------------------ effects picker (lobby + call)
function EffectsPanel({ value, onChange, onClose }) {
  const file = useRef(null);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (f) onChange({ id: "image", image: await createImageBitmap(f), label: f.name });
  };
  return (
    <div className="gm-effects">
      <div className="gm-panel-head">
        <b>Backgrounds and effects</b>
        <button className="gm-icon-btn light" onClick={onClose} aria-label="Close effects">
          <Icon name="close" />
        </button>
      </div>
      <div className="gm-effect-grid">
        {EFFECTS.map((e) => (
          <button
            key={e.id}
            className={`gm-effect ${value.id === e.id ? "on" : ""}`}
            style={{ background: e.swatch }}
            onClick={() => onChange({ id: e.id })}
            title={e.label}
            aria-pressed={value.id === e.id}
          >
            {e.id === "none" ? "⊘" : e.id.startsWith("blur") ? <span className={e.id}>👤</span> : ""}
            <small>{e.label}</small>
          </button>
        ))}
        <button className={`gm-effect ${value.id === "image" ? "on" : ""}`} onClick={() => file.current?.click()} title="Your own image">
          <Icon name="upload" />
          <small>Upload</small>
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={upload} />
      </div>
      <p className="gm-note">Runs on your device with AI segmentation — your real background never leaves it.</p>
    </div>
  );
}

// ------------------------------------------------------------------ lobby + call
function Room({ code }) {
  const { user } = useAuth();
  const router = useRouter();
  const [stream, setStream] = useState(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [quality, setQuality] = useState("hd");
  const [effect, setEffect] = useState({ id: "none" });
  const [preview, setPreview] = useState(null); // lobby video with the effect applied
  const [devices, setDevices] = useState({ cameras: [], mics: [], speakers: [] });
  const [dev, setDev] = useState({ videoId: "", audioId: "", speakerId: "" });
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [state, setState] = useState(null);
  const [panel, setPanel] = useState(""); // chat | people | info | settings | effects | react
  const [unread, setUnread] = useState(0);
  const [levels, setLevels] = useState({});
  const [clock, setClock] = useState(timeNow());
  const [toasts, setToasts] = useState([]);
  const [readyCard, setReadyCard] = useState(true);
  const meeting = useRef(null);
  const meter = useRef(null);
  const lobbyFx = useRef(null);
  const chatEnd = useRef(null);
  const name = user?.full_name || user?.username || "You";

  const toast = useCallback((text) => {
    const id = `${Date.now()}${Math.random()}`;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // lobby: camera preview + devices + who's already there
  useEffect(() => {
    let alive = true;
    let s = null;
    api(`/meet/${code}`)
      .then((i) => alive && setInfo(i))
      .catch((e) => alive && setErr(e.message));
    openMedia({ quality })
      .then(async (m) => {
        if (!alive) return m.getTracks().forEach((t) => t.stop());
        s = m;
        setStream(m);
        setMediaReady(true);
        setDevices(await listDevices());
      })
      .catch((e) => {
        if (!alive) return;
        setCam(false);
        setMic(false);
        setMediaReady(true);
        setErr(e.name === "NotAllowedError" ? "Camera and microphone are blocked — allow them in the address bar, or join without them." : `Camera/microphone: ${e.message}`);
      });
    return () => {
      alive = false;
      lobbyFx.current?.stop();
      if (!meeting.current) s?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // lobby effect preview
  useEffect(() => {
    if (state || !stream) return;
    let cancelled = false;
    const v = stream.getVideoTracks()[0];
    lobbyFx.current?.stop();
    lobbyFx.current = null;
    if (!cam || !v || v.readyState !== "live" || effect.id === "none") {
      setPreview(stream);
      return;
    }
    applyEffect(v, effect.id, effect.image)
      .then((fx) => {
        if (cancelled) return fx.stop();
        lobbyFx.current = fx;
        setPreview(new MediaStream([fx.track]));
      })
      .catch((e) => setErr(`Effects unavailable: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [effect, stream, cam, state]);

  const join = useCallback(async () => {
    lobbyFx.current?.stop();
    lobbyFx.current = null;
    const local = stream ?? new MediaStream();
    local.getAudioTracks().forEach((t) => (t.enabled = mic));
    if (!cam) local.getVideoTracks().forEach((t) => t.stop());
    meter.current = new LevelMeter();
    const m = new Meeting(code, { stream: local, quality, onChange: setState });
    meeting.current = m;
    setPanel("");
    if (effect.id !== "none" && cam) await m.setEffect(effect).catch(() => {});
    m.connect();
  }, [stream, mic, cam, code, quality, effect]);

  useEffect(
    () => () => {
      meeting.current?.leave();
      meeting.current?.stream?.getTracks().forEach((t) => t.stop());
      meter.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (state?.status !== "joined") return;
    const tick = setInterval(() => setClock(timeNow()), 10_000);
    const stats = setInterval(() => meeting.current?.pollStats(), 3000);
    const talk = setInterval(() => meter.current && setLevels(meter.current.levels()), 250);
    return () => [tick, stats, talk].forEach(clearInterval);
  }, [state?.status]);

  const peers = useMemo(() => Object.values(state?.peers ?? {}), [state]);

  // "X joined" / "X left" / "X raised a hand" notices, like Meet
  const prevPeers = useRef({});
  const noticesOn = useRef(false); // not for the people already here when you join
  useEffect(() => {
    if (state?.status !== "joined") return;
    const before = prevPeers.current;
    const now = Object.fromEntries(peers.map((p) => [p.id, p]));
    for (const p of peers) {
      if (!before[p.id] && noticesOn.current) toast(`${p.name} joined`);
      if (p.hand && !before[p.id]?.hand) toast(`✋ ${p.name} raised a hand`);
    }
    for (const id of Object.keys(before)) if (!now[id]) toast(`${before[id].name} left`);
    prevPeers.current = now;
    noticesOn.current = true;
  }, [peers, state?.status, toast]);

  useEffect(() => {
    if (!state) return;
    meter.current?.add("me", meeting.current?.stream);
    for (const p of peers) if (p.stream) meter.current?.add(p.id, p.stream);
  }, [peers, state]);

  const chatLen = state?.chat.length ?? 0;
  const seen = useRef(0);
  useEffect(() => {
    if (panel === "chat") {
      seen.current = chatLen;
      setUnread(0);
      chatEnd.current?.scrollIntoView({ block: "end" });
    } else setUnread(chatLen - seen.current);
  }, [chatLen, panel]);

  const m = meeting.current;
  const toggleMic = useCallback(() => {
    const next = !(m ? m.localState().mic : mic);
    if (m) m.setMic(next).catch((e) => setErr(`Microphone: ${e.message}`));
    else stream?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMic(next);
  }, [m, mic, stream]);
  const toggleCam = useCallback(async () => {
    const next = !cam;
    setCam(next);
    try {
      if (m) await m.setCam(next, dev.videoId);
      else if (stream) {
        const v = stream.getVideoTracks()[0];
        if (!next) v?.stop();
        else {
          const fresh = (await openMedia({ quality, videoId: dev.videoId, audio: false })).getVideoTracks()[0];
          if (v) stream.removeTrack(v);
          stream.addTrack(fresh);
          setStream(new MediaStream(stream.getTracks()));
        }
      }
    } catch (e) {
      setErr(e.message);
      setCam(!next);
    }
  }, [m, cam, stream, quality, dev.videoId]);
  const chooseEffect = async (e) => {
    setEffect(e);
    if (m) await m.setEffect(e).catch((x) => setErr(`Effects unavailable: ${x.message}`));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "d" || k === "e") {
        e.preventDefault();
        (k === "d" ? toggleMic : toggleCam)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMic, toggleCam]);

  const leave = () => {
    m?.leave();
    m?.stream?.getTracks().forEach((t) => t.stop());
    meeting.current = null;
    router.push("/app/meet");
  };

  // ---------------------------------------------------------------- lobby
  if (!state) {
    const showCam = cam && preview?.getVideoTracks().some((t) => t.readyState === "live");
    return (
      <div className="gm-lobby">
        <div className="gm-lobby-video">
          {showCam ? <StreamVideo stream={preview} muted mirror /> : <div className="gm-cam-off">{cam && !mediaReady ? "Camera is starting" : "Camera is off"}</div>}
          <div className="gm-lobby-name">{name}</div>
          <div className="gm-lobby-controls">
            <button className={`gm-round outline ${mic ? "" : "off"}`} onClick={toggleMic} title="Microphone (Ctrl+D)" aria-pressed={!mic}>
              <Icon name={mic ? "mic" : "micOff"} />
            </button>
            <button className={`gm-round outline ${cam ? "" : "off"}`} onClick={toggleCam} title="Camera (Ctrl+E)" aria-pressed={!cam}>
              <Icon name={cam ? "cam" : "camOff"} />
            </button>
          </div>
          <button className="gm-round outline gm-fx-btn" onClick={() => setPanel(panel === "effects" ? "" : "effects")} title="Apply visual effects">
            <Icon name="effects" />
          </button>
          {panel === "effects" && <EffectsPanel value={effect} onChange={setEffect} onClose={() => setPanel("")} />}
        </div>
        <div className="gm-lobby-side">
          <h1>Ready to join?</h1>
          <p className="gm-lobby-who">
            {!info ? "Checking who's here…" : info.people.length ? `${info.people.slice(0, 3).join(", ")}${info.people.length > 3 ? ` and ${info.people.length - 3} more` : ""} ${info.people.length === 1 ? "is" : "are"} in this call` : "No one else is here"}
          </p>
          <button className="gm-primary big" onClick={join} disabled={info?.full || !mediaReady}>
            {info?.full ? "Meeting is full" : mediaReady ? "Join now" : "Starting camera…"}
          </button>
          <CopyLink code={code} />
          <label className="gm-quality">
            Video quality
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              {Object.entries(QUALITY).map(([k, q]) => (
                <option key={k} value={k}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
          {err && <div className="alert error">{err}</div>}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- ended
  if (["full", "unauthorized", "disconnected", "left"].includes(state.status)) {
    const msg = {
      full: "This meeting is full",
      unauthorized: "Your session expired — please sign in again",
      disconnected: "You lost your network connection",
      left: "You left the meeting",
    }[state.status];
    return (
      <div className="gm-ended">
        <h1>{msg}</h1>
        <div className="gm-ended-actions">
          <button className="gm-outline" onClick={() => window.location.reload()}>
            Rejoin
          </button>
          <button className="gm-primary" onClick={() => router.push("/app/meet")}>
            Return to home screen
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- call
  const meState = { id: "me", name, ...(m?.localState() ?? {}) };
  const loudest = Object.entries(levels).sort((a, b) => b[1] - a[1])[0];
  const speakingId = loudest && loudest[1] > 0.08 ? loudest[0] : null;
  const presenter = peers.find((p) => p.screen) ?? (meState.screen ? meState : null);
  const reactionsFor = (id) => state.reactions.filter((r) => r.id === (id === "me" ? state.you : id));
  const tiles = [{ p: meState, stream: m?.displayStream, me: true }, ...peers.map((p) => ({ p, stream: p.stream, me: false }))];
  const sidePanel = ["chat", "people", "info", "settings", "effects"].includes(panel);
  const sendChat = (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.text;
    m?.chat(input.value);
    input.value = "";
  };
  const togglePanel = (p) => setPanel(panel === p ? "" : p);

  return (
    <div className={`gm-room ${sidePanel ? "with-panel" : ""}`}>
      <div className={`gm-stage ${presenter ? "presenting" : ""}`} data-count={tiles.length}>
        {tiles.map(({ p, stream: s, me }) => {
          const showVideo = (p.cam || p.screen) && s?.getVideoTracks().length > 0;
          const speaking = speakingId === p.id && p.mic;
          return (
            <div
              key={p.id}
              className={`mt-tile gm-tile ${speaking ? "speaking" : ""} ${presenter?.id === p.id ? "big" : ""}`}
              data-cam={p.cam ? 1 : 0}
              data-mic={p.mic ? 1 : 0}
              data-tracks={`${s?.getAudioTracks().length ?? 0}a${s?.getVideoTracks().length ?? 0}v`}
            >
              <StreamVideo stream={s} muted={me} mirror={me && !p.screen} speakerId={dev.speakerId} className={showVideo ? "" : "hidden"} />
              {!showVideo && <Avatar name={p.name} size={presenter?.id === p.id ? 120 : 88} />}
              <div className="gm-badges">
                {p.hand && (
                  <span className="gm-badge hand" title="Hand raised">
                    <Icon name="hand" size={16} />
                  </span>
                )}
                {!p.mic ? (
                  <span className="gm-badge" title="Muted">
                    <Icon name="micOff" size={16} />
                  </span>
                ) : speaking ? (
                  <span className="gm-badge talk" title="Speaking">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </div>
              <div className="mt-name gm-name">
                {p.screen && <Icon name="present" size={16} />}
                <b>{me ? (p.screen ? "You are presenting" : "You") : p.name}</b>
                {!me && p.quality && p.quality !== "unknown" && <i className={`mt-q ${p.quality}`} title={`Connection: ${p.quality}`} />}
                {!p.mic && <span className="sr-only">muted 🔇</span>}
                {p.hand && <span className="sr-only">✋</span>}
                {p.screen && <span className="sr-only">🖥️</span>}
              </div>
              {!me && p.connection && !["connected", "completed"].includes(p.connection) && (
                <div className="mt-connecting">{p.connection === "failed" ? "Reconnecting…" : "Connecting…"}</div>
              )}
              <div className="mt-reactions" aria-hidden="true">
                {reactionsFor(p.id).map((r) => (
                  <span key={r.key}>{r.emoji}</span>
                ))}
              </div>
            </div>
          );
        })}
        {peers.length === 0 && readyCard && (
          <div className="gm-ready-card" role="dialog" aria-label="Your meeting's ready">
            <div className="gm-panel-head">
              <b>Your meeting&apos;s ready</b>
              <button className="gm-icon-btn light" onClick={() => setReadyCard(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <p>Share this meeting link with others that you want in the meeting — they can join from any browser, even as a guest.</p>
            <LinkBox code={code} />
            <p className="gm-note">
              <Icon name="info" size={16} /> People who use this link don&apos;t need an account to join.
            </p>
          </div>
        )}
        {state.status === "reconnecting" && <div className="gm-banner">Trying to reconnect…</div>}
      </div>

      {sidePanel && (
        <aside className="gm-panel">
          {panel === "effects" ? (
            <EffectsPanel value={effect} onChange={chooseEffect} onClose={() => setPanel("")} />
          ) : (
            <>
              <div className="gm-panel-head">
                <b>{{ chat: "In-call messages", people: "People", info: "Meeting details", settings: "Settings" }[panel]}</b>
                <button className="gm-icon-btn light" onClick={() => setPanel("")} aria-label="Close panel">
                  <Icon name="close" />
                </button>
              </div>
              {panel === "chat" && (
                <>
                  <p className="gm-note">Messages can only be seen by people in the call and are deleted when the call ends.</p>
                  <div className="mt-chat gm-chat">
                    {state.chat.map((c, i) => (
                      <div key={i}>
                        <b>{c.id === state.you ? "You" : c.name}</b>{" "}
                        <span className="gm-time">{new Date(c.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                        <p>{c.text}</p>
                      </div>
                    ))}
                    <span ref={chatEnd} />
                  </div>
                  <form onSubmit={sendChat} className="gm-chat-form">
                    <input name="text" placeholder="Send a message" maxLength={1000} autoComplete="off" />
                    <button className="gm-icon-btn light" aria-label="Send" title="Send">
                      <Icon name="send" />
                    </button>
                  </form>
                </>
              )}
              {panel === "people" && (
                <>
                  <CopyLink code={code} label="Add people (copy link)" className="gm-outline small" />
                  <p className="gm-section">In the meeting · {peers.length + 1}</p>
                  <ul className="mt-people gm-people">
                    {[meState, ...peers].map((p) => (
                      <li key={p.id}>
                        <Avatar name={p.name} size={32} />
                        <span style={{ flex: 1 }}>{p.id === "me" ? `${p.name} (You)` : p.name}</span>
                        {p.hand && <Icon name="hand" size={18} />}
                        {p.screen && <Icon name="present" size={18} />}
                        <Icon name={p.mic ? "mic" : "micOff"} size={18} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {panel === "info" && (
                <>
                  <p className="gm-section">Joining info</p>
                  <LinkBox code={code} />
                  <p className="gm-note">Video and audio go directly between participants, encrypted end to end. Up to {QUALITY[quality].label} video.</p>
                </>
              )}
              {panel === "settings" && (
                <div className="gm-settings">
                  <label>
                    Camera
                    <select value={dev.videoId} onChange={async (e) => { setDev({ ...dev, videoId: e.target.value }); if (cam) await m?.setCam(true, e.target.value); }}>
                      <option value="">Default</option>
                      {devices.cameras.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Microphone
                    <select value={dev.audioId} onChange={async (e) => { setDev({ ...dev, audioId: e.target.value }); await m?.switchMic(e.target.value); }}>
                      <option value="">Default</option>
                      {devices.mics.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </label>
                  {devices.speakers.length > 0 && (
                    <label>
                      Speaker
                      <select value={dev.speakerId} onChange={(e) => setDev({ ...dev, speakerId: e.target.value })}>
                        <option value="">Default</option>
                        {devices.speakers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                    </label>
                  )}
                  <label>
                    Send resolution
                    <select value={quality} onChange={(e) => { setQuality(e.target.value); m?.setQuality(e.target.value, dev.videoId); }}>
                      {Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
                    </select>
                  </label>
                  <p className="gm-note">Noise suppression, echo cancellation and automatic gain are on.</p>
                </div>
              )}
            </>
          )}
        </aside>
      )}

      <div className="gm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="gm-toast">
            {t.text}
          </div>
        ))}
      </div>

      <footer className="gm-bar" role="toolbar" aria-label="Meeting controls">
        <div className="gm-bar-left">
          <span>{clock}</span>
          <span className="gm-sep">|</span>
          <span>{code}</span>
        </div>
        <div className="gm-bar-center">
          <button className={`gm-round ${meState.mic ? "" : "off"}`} onClick={toggleMic} title="Microphone (Ctrl+D)" aria-pressed={!meState.mic}>
            <Icon name={meState.mic ? "mic" : "micOff"} />
          </button>
          <button className={`gm-round ${cam ? "" : "off"}`} onClick={toggleCam} title="Camera (Ctrl+E)" aria-pressed={!cam}>
            <Icon name={cam ? "cam" : "camOff"} />
          </button>
          <div className="gm-menu-wrap">
            <button className={`gm-round ${panel === "react" ? "on" : ""}`} title="Send a reaction" onClick={() => togglePanel("react")}>
              <Icon name="emoji" />
            </button>
            {panel === "react" && (
              <div className="gm-react-pop">
                {REACTIONS.map((e) => (
                  <button key={e} onClick={() => m.react(e)} aria-label={`React ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {navigator.mediaDevices?.getDisplayMedia && (
            <button
              className={`gm-round ${meState.screen ? "on" : ""}`}
              title={meState.screen ? "Stop presenting" : "Present your screen"}
              onClick={async () => {
                try {
                  if (m.screen) await m.stopShare();
                  else await m.shareScreen();
                  setState({ ...m.state });
                } catch {
                  /* cancelled the picker */
                }
              }}
            >
              <Icon name="present" />
            </button>
          )}
          <button className={`gm-round ${meState.hand ? "on" : ""}`} title="Raise hand" onClick={() => { m.setHand(!m.hand); setState({ ...m.state }); }}>
            <Icon name="hand" />
          </button>
          <button className={`gm-round ${panel === "effects" ? "on" : ""}`} title="Backgrounds and effects" onClick={() => togglePanel("effects")}>
            <Icon name="effects" />
          </button>
          <button className={`gm-round ${panel === "settings" ? "on" : ""}`} title="Settings" onClick={() => togglePanel("settings")}>
            <Icon name="settings" />
          </button>
          <button className="gm-leave" title="Leave call" onClick={leave}>
            <Icon name="callEnd" />
          </button>
        </div>
        <div className="gm-bar-right">
          <button className={`gm-icon-btn ${panel === "info" ? "on" : ""}`} title="Meeting details" onClick={() => togglePanel("info")}>
            <Icon name="info" />
          </button>
          <button className={`gm-icon-btn ${panel === "people" ? "on" : ""}`} title="People" onClick={() => togglePanel("people")}>
            <Icon name="people" />
            <span className="gm-count">{peers.length + 1}</span>
          </button>
          <button className={`gm-icon-btn ${panel === "chat" ? "on" : ""}`} title="Chat" onClick={() => togglePanel("chat")}>
            <Icon name="chat" />
            {unread > 0 && <span className="mt-badge">{unread}</span>}
          </button>
        </div>
      </footer>
      {err && <div className="gm-error">{err}</div>}
    </div>
  );
}
