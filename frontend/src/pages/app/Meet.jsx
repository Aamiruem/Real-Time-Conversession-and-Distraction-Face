// Presence Meet: video meetings in the style of Google Meet (home, lobby with effects, immersive call view).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/MeetIcons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyEffect, EFFECTS, effectActive, FILTERS, loadSegmenter, sceneSwatch } from "@/lib/backgroundEffects";
import { invite, inviteLink, LevelMeter, listDevices, MEET_CODE as CODE_RE, Meeting, openMedia, QUALITY } from "@/lib/meet";
import { canRecord, MeetRecorder } from "@/lib/meetRecorder";
import { useRouter, useSearchParams } from "@/lib/navigation";
import "@/styles/meet.css";

// Your meeting choices (background, filter, quality, devices, skip the preview) are remembered on this device
const PREFS_KEY = "presence.meet.prefs";
const BG_KEY = "presence.meet.bg"; // your uploaded background, as a small JPEG
const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
};
const savePrefs = (patch) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage full or blocked: just not remembered */
  }
};
/** Shrinks an uploaded picture to 1280 px, keeps it for next time, and returns it ready to draw. */
async function keepBackground(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1280 / bmp.width);
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  try {
    localStorage.setItem(BG_KEY, c.toDataURL("image/jpeg", 0.85));
  } catch {
    /* too big to keep: still used for this meeting */
  }
  return createImageBitmap(c);
}
async function savedBackground() {
  try {
    const url = localStorage.getItem(BG_KEY);
    return url ? await createImageBitmap(await (await fetch(url)).blob()) : null;
  } catch {
    return null;
  }
}
const duration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
};

const REACTIONS = ["💖", "👍", "🎉", "👏", "😂", "😮", "🙌", "🤔"];
const AVATAR_COLORS = ["#1a73e8", "#e8710a", "#188038", "#d93025", "#9334e6", "#e52592", "#12b5cb", "#f29900"];
const colorFor = (name = "") => AVATAR_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];
const initials = (name = "?") =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const timeNow = (at = Date.now()) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
// a code, or any link with one in it (…/abc-defg-hij, or an old …/app/meet?code=abc-defg-hij)
const parseCode = (text) => text.toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/)?.[0] ?? text.trim();

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

/** Who can open this link, and what to do when it's not everyone. */
function LinkReach({ code }) {
  const { scope, https } = invite(code);
  const text = {
    public: "Anyone with this link can join from any browser — no account needed.",
    lan: https
      ? "Works for people on the same Wi-Fi. The first time, their browser warns about the certificate — they choose Advanced → Continue."
      : "Works for people on the same Wi-Fi, but their camera and mic stay off over http. Start the app with npm run dev:lan (HTTPS), or deploy it to share with anyone.",
    local: "This link only works on this computer. To invite others, start the app with npm run dev:lan (same Wi-Fi) or deploy it (anyone, anywhere).",
  }[scope];
  return (
    <p className={`gm-note ${scope === "public" || (scope === "lan" && https) ? "" : "warn"}`}>
      <Icon name="info" size={16} /> {text}
    </p>
  );
}

/** Send the link straight to people: the phone's share sheet, WhatsApp or email. */
function ShareRow({ code }) {
  const url = inviteLink(code);
  const text = "Join my Presence Meet video call";
  return (
    <div className="gm-share">
      {typeof navigator !== "undefined" && navigator.share && (
        <button className="gm-outline small" onClick={() => navigator.share({ title: "Presence Meet", text, url }).catch(() => {})}>
          <Icon name="send" size={16} /> Share
        </button>
      )}
      <a className="gm-outline small" href={`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`} target="_blank" rel="noreferrer">
        <Icon name="chat" size={16} /> WhatsApp
      </a>
      <a className="gm-outline small" href={`mailto:?subject=${encodeURIComponent("Presence Meet invitation")}&body=${encodeURIComponent(`${text}:\n${url}`)}`}>
        <Icon name="personAdd" size={16} /> Email
      </a>
    </div>
  );
}

function LinkBox({ code }) {
  return (
    <>
      <div className="gm-linkbox">
        <span>{inviteLink(code).replace(/^https?:\/\//, "")}</span>
        <CopyLink code={code} label="" className="gm-icon-btn light" />
      </div>
      <ShareRow code={code} />
      <LinkReach code={code} />
    </>
  );
}

// ------------------------------------------------------------------ home
const ACCESS = [
  ["open", "Open", "Anyone with the link joins straight away"],
  ["trusted", "Trusted", "Signed-in people join; guests ask to join"],
  ["ask", "Ask to join", "Everyone except hosts waits until a host lets them in"],
];
const whenText = (iso) =>
  iso ? new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** "Create a meeting for later": a title, an optional time, and who may join without asking. */
function ScheduleForm({ onDone, onCancel }) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [access, setAccess] = useState("open");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const m = await api("/meet", { method: "POST", json: { title, access, scheduled_for: when ? new Date(when).toISOString() : null } });
      onDone(m.code);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="gm-form" onSubmit={submit}>
      <label>
        Title <span className="gm-time">(optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Weekly team sync" autoFocus />
      </label>
      <label>
        Date and time <span className="gm-time">(optional)</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <fieldset className="gm-radios">
        <legend>Who can join</legend>
        {ACCESS.map(([k, label, hint]) => (
          <label key={k} className={access === k ? "on" : ""}>
            <input type="radio" name="access" checked={access === k} onChange={() => setAccess(k)} />
            <span>
              <b>{label}</b>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {err && <div className="alert error">{err}</div>}
      <div className="gm-form-actions">
        <button type="button" className="gm-outline" onClick={onCancel}>
          Cancel
        </button>
        <button className="gm-primary" disabled={busy}>
          {busy ? "Creating…" : "Create meeting"}
        </button>
      </div>
    </form>
  );
}

/** Who came to a meeting, and for how long (hosts only). */
function Attendance({ code }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api(`/meet/${code}/attendance`).then(setData, (e) => setErr(e.message));
  }, [code]);
  if (err) return <p className="gm-note warn">{err}</p>;
  if (!data) return <p className="gm-note">Loading attendance…</p>;
  return (
    <table className="gm-attend">
      <thead>
        <tr>
          <th>Name</th>
          <th>First joined</th>
          <th>Time in call</th>
        </tr>
      </thead>
      <tbody>
        {data.people.map((p, i) => (
          <tr key={i}>
            <td>
              {p.name} {p.here_now && <span className="gm-live">in call</span>}
            </td>
            <td>{whenText(p.first_joined)}</td>
            <td>
              {p.minutes < 1 ? "< 1 min" : `${Math.round(p.minutes)} min`}
              {p.visits > 1 && <span className="gm-time"> · joined {p.visits}×</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Your upcoming meetings and the ones you've been in. */
function MyMeetings({ refresh }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // code whose attendance is shown
  const load = useCallback(() => api("/meet").then(setData, () => setData({ upcoming: [], recent: [] })), []);
  useEffect(() => {
    load();
  }, [load, refresh]);
  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.title || m.code}"? The link will stop working for everyone.`)) return;
    await api(`/meet/${m.code}`, { method: "DELETE" }).catch(() => {});
    load();
  };
  if (!data || (!data.upcoming.length && !data.recent.length)) return null;
  const row = (m, recent) => (
    <li key={m.code} className="gm-mrow">
      <div className="gm-mrow-icon">
        <Icon name={recent ? "history" : "calendar"} size={20} />
      </div>
      <div className="gm-mrow-body">
        <b>
          {m.title || "Untitled meeting"} {m.live && <span className="gm-live">live · {m.people_now}</span>}
        </b>
        <small>
          {recent
            ? `${whenText(m.last_held)} · ${m.minutes < 1 ? "under a minute" : `${m.minutes} min`} · ${m.people} ${m.people === 1 ? "person" : "people"}`
            : m.scheduled_for
              ? whenText(m.scheduled_for)
              : "No time set"}
          {" · "}
          {m.code}
          {!m.is_host && ` · hosted by ${m.host}`}
          {m.settings.access !== "open" && ` · ${ACCESS.find(([k]) => k === m.settings.access)[1]}`}
        </small>
      </div>
      <div className="gm-mrow-actions">
        <CopyLink code={m.code} label="" className="gm-icon-btn light" />
        {recent && m.is_host && (
          <button className={`gm-outline small ${open === m.code ? "on" : ""}`} onClick={() => setOpen(open === m.code ? null : m.code)} aria-expanded={open === m.code}>
            <Icon name="people" size={16} /> Attendance
          </button>
        )}
        {m.is_host && (
          <button className="gm-icon-btn light" title="Delete meeting" aria-label="Delete meeting" onClick={() => remove(m)}>
            <Icon name="trash" size={20} />
          </button>
        )}
        <button className="gm-primary small" onClick={() => router.push(`/${m.code}`)}>
          {recent ? "Rejoin" : "Start"}
        </button>
      </div>
      {open === m.code && (
        <div className="gm-mrow-extra">
          <Attendance code={m.code} />
        </div>
      )}
    </li>
  );
  return (
    <section className="gm-mine">
      {data.upcoming.length > 0 && (
        <>
          <h2>Upcoming</h2>
          <ul>{data.upcoming.map((m) => row(m, false))}</ul>
        </>
      )}
      {data.recent.length > 0 && (
        <>
          <h2>Recent meetings</h2>
          <ul>{data.recent.map((m) => row(m, true))}</ul>
        </>
      )}
    </section>
  );
}

function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [menu, setMenu] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [later, setLater] = useState(null);
  const [err, setErr] = useState("");
  const start = async () => {
    setMenu(false);
    try {
      const m = await api("/meet", { method: "POST" });
      router.push(`/${m.code}`);
    } catch (e) {
      setErr(e.message);
    }
  };
  const join = (e) => {
    e.preventDefault();
    const c = parseCode(code);
    if (!CODE_RE.test(c)) return setErr("Check the code — it looks like abc-defg-hij (or paste the whole link).");
    router.push(`/${c}`);
  };
  const close = () => {
    setScheduling(false);
    setLater(null);
  };
  return (
    <>
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
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setScheduling(true);
                    }}
                  >
                    <Icon name="calendar" size={20} /> Create a meeting for later
                  </button>
                  <button role="menuitem" onClick={start}>
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
      </div>
      <MyMeetings refresh={later} />
      {(scheduling || later) && (
        <div className="gm-dialog-backdrop" onClick={close}>
          <div className="gm-dialog" role="dialog" aria-label={later ? "Here's your joining info" : "Create a meeting for later"} onClick={(e) => e.stopPropagation()}>
            <div className="gm-dialog-head">
              <h2>{later ? "Here's your joining info" : "Create a meeting for later"}</h2>
              <button className="gm-icon-btn light" onClick={close} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            {later ? (
              <>
                <p>Send this to people that you want to meet with. It&apos;s saved under Upcoming below, so you can find it later too.</p>
                <LinkBox code={later} />
                <button className="gm-primary" style={{ marginTop: 16 }} onClick={() => router.push(`/${later}`)}>
                  Join now
                </button>
              </>
            ) : (
              <ScheduleForm
                onCancel={() => setScheduling(false)}
                onDone={(c) => {
                  setScheduling(false);
                  setLater(c);
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** /app/meet is the home screen; each meeting lives at its own link, /<code> (pages/MeetLink.jsx renders it). */
export default function Meet({ code }) {
  const router = useRouter();
  const old = useSearchParams().get("code") ?? "";
  useEffect(() => {
    if (!code && CODE_RE.test(old)) router.replace(`/${old}`); // an old /app/meet?code=… link
  }, [code, old, router]);
  if (code) return <Room key={code} code={code} />;
  return CODE_RE.test(old) ? null : <Home />;
}

// ------------------------------------------------------------------ effects picker (lobby + call)
/** Backgrounds · Filters · Appearance (like Meet). `value` = { id, image, filter, lowLight }. */
function EffectsPanel({ value, onChange, onClose }) {
  const file = useRef(null);
  const [tab, setTab] = useState("backgrounds");
  const swatches = useMemo(() => Object.fromEntries(EFFECTS.filter((e) => e.scene).map((e) => [e.id, sceneSwatch(e)])), []);
  const set = (patch) => onChange({ ...value, ...patch });
  useEffect(() => {
    loadSegmenter().catch(() => {}); // warm up the AI model so the first background switches instantly
  }, []);
  const storedBg = () => {
    try {
      return localStorage.getItem(BG_KEY);
    } catch {
      return null;
    }
  };
  const [mine, setMine] = useState(storedBg);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    set({ id: "image", image: await keepBackground(f) });
    setMine(storedBg());
  };
  return (
    <div className="gm-effects">
      <div className="gm-panel-head">
        <b>Backgrounds and effects</b>
        <button className="gm-icon-btn light" onClick={onClose} aria-label="Close effects">
          <Icon name="close" />
        </button>
      </div>
      <div className="gm-tabs" role="tablist">
        {[
          ["backgrounds", "Backgrounds"],
          ["filters", "Filters"],
          ["appearance", "Appearance"],
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "backgrounds" && (
        <div className="gm-effect-grid">
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              className={`gm-effect ${value.id === e.id ? "on" : ""}`}
              style={{ background: swatches[e.id] ?? e.swatch }}
              onClick={() => set({ id: e.id, image: null })}
              title={e.label}
              aria-pressed={value.id === e.id}
            >
              {e.id === "none" ? "⊘" : e.id.startsWith("blur") ? <span className={e.id}>👤</span> : ""}
              <small>{e.label}</small>
            </button>
          ))}
          {mine && (
            <button
              className={`gm-effect ${value.id === "image" ? "on" : ""}`}
              style={{ background: `url(${mine}) center / cover` }}
              onClick={async () => set({ id: "image", image: value.image ?? (await savedBackground()) })}
              title="Your image"
              aria-pressed={value.id === "image"}
            >
              <small>Your image</small>
            </button>
          )}
          <button className="gm-effect" onClick={() => file.current?.click()} title="Upload your own image">
            <Icon name="upload" />
            <small>Upload</small>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={upload} />
        </div>
      )}
      {tab === "filters" && (
        <div className="gm-effect-grid">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`gm-effect filter ${(value.filter ?? "none") === f.id ? "on" : ""}`}
              onClick={() => set({ filter: f.id })}
              title={f.label}
              aria-pressed={(value.filter ?? "none") === f.id}
            >
              <span className="gm-filter-swatch" style={{ filter: f.css || "none" }} />
              <small>{f.label}</small>
            </button>
          ))}
        </div>
      )}
      {tab === "appearance" && (
        <label className="gm-switch">
          <span>
            <b>Adjust for low light</b>
            <br />
            <span className="gm-time">Brightens your video when your room is dim</span>
          </span>
          <input type="checkbox" checked={!!value.lowLight} onChange={(e) => set({ lowLight: e.target.checked })} />
        </label>
      )}
      <p className="gm-note">Runs on your device with AI segmentation — your real background never leaves it.</p>
    </div>
  );
}

// ------------------------------------------------------------------ lobby + call
function Room({ code }) {
  const { user } = useAuth();
  const router = useRouter();
  const [prefs] = useState(loadPrefs);
  const [stream, setStream] = useState(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [quality, setQuality] = useState(QUALITY[prefs.quality] ? prefs.quality : "hd");
  // your last background (an uploaded picture is restored a moment later, below)
  const [effect, setEffect] = useState(() => ({ ...(prefs.effect ?? {}), id: prefs.effect?.id === "image" ? "none" : (prefs.effect?.id ?? "none") }));
  const [preview, setPreview] = useState(null); // lobby video with the effect applied
  const [devices, setDevices] = useState({ cameras: [], mics: [], speakers: [] });
  const [dev, setDev] = useState({ videoId: "", audioId: "", speakerId: "", ...prefs.dev });
  const [skipLobby, setSkipLobby] = useState(!!prefs.skipLobby);
  const [recording, setRecording] = useState(false);
  const recorder = useRef(null);
  const stageRef = useRef(null);
  const autoJoined = useRef(false);
  const ptt = useRef(false); // holding Space to talk while muted
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [state, setState] = useState(null);
  const [panel, setPanel] = useState(""); // chat | people | info | settings | effects | react
  const [unread, setUnread] = useState(0);
  const [levels, setLevels] = useState({});
  const [clock, setClock] = useState(Date.now);
  const [toasts, setToasts] = useState([]);
  const [readyCard, setReadyCard] = useState(true);
  const [layout, setLayout] = useState("auto"); // auto | tiled | spotlight | sidebar (Meet's "Adjust view")
  const [pinned, setPinned] = useState(null);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [myCaption, setMyCaption] = useState(null);
  const [menu, setMenu] = useState(""); // more | mic | cam
  const roomRef = useRef(null);
  const lastSpeaker = useRef(null);
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
    const saved = { videoId: dev.videoId, audioId: dev.audioId };
    openMedia({ quality, ...saved })
      // the camera you used last time is unplugged: use the default one
      .catch((e) => {
        if (!(saved.videoId || saved.audioId) || !["OverconstrainedError", "NotFoundError"].includes(e.name)) throw e;
        setDev((d) => ({ ...d, videoId: "", audioId: "" }));
        return openMedia({ quality });
      })
      // no camera, or another app is using it: join with the microphone only
      .catch((e) => {
        if (e.name === "NotAllowedError") throw e;
        return openMedia({ quality, video: false }).then((m) => {
          setCam(false);
          setErr(e.name === "NotReadableError" ? "Your camera is being used by another app — joining with your microphone only." : "No camera found — joining with your microphone only.");
          return m;
        });
      })
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
    if (!cam || !v || v.readyState !== "live" || !effectActive(effect)) {
      setPreview(stream);
      return;
    }
    applyEffect(v, effect)
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
    const m = new Meeting(code, { stream: local, quality, onChange: setState, onNotice: toast });
    meeting.current = m;
    setPanel("");
    if (effectActive(effect) && cam) await m.setEffect(effect).catch(() => {});
    m.connect();
  }, [stream, mic, cam, code, quality, effect, toast]);

  // bring back your uploaded background from last time
  useEffect(() => {
    if (prefs.effect?.id !== "image") return;
    savedBackground().then((image) => {
      if (!image) return;
      setEffect((e) => {
        const next = { ...e, id: "image", image };
        meeting.current?.setEffect(next).catch(() => {});
        return next;
      });
    });
  }, [prefs]);

  // remember your choices for the next meeting
  useEffect(() => {
    savePrefs({ effect: { id: effect.id, filter: effect.filter, lowLight: effect.lowLight }, quality, dev, skipLobby });
  }, [effect.id, effect.filter, effect.lowLight, quality, dev, skipLobby]);

  // "Join directly": open the link and you're in, once the camera is ready
  useEffect(() => {
    if (!prefs.skipLobby || autoJoined.current || state || !mediaReady || !info || info.full) return;
    autoJoined.current = true;
    join();
  }, [prefs, state, mediaReady, info, join]);

  useEffect(
    () => () => {
      recorder.current?.stop(); // leaving mid-recording still saves the file
      meeting.current?.leave();
      meeting.current?.stream?.getTracks().forEach((t) => t.stop());
      meter.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (state?.status !== "joined") return;
    const tick = setInterval(() => setClock(Date.now()), 1000); // the clock and the call timer
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
  // everyone is told when someone records (the notice is a chat message)
  const lastChat = state?.chat[chatLen - 1];
  useEffect(() => {
    if (lastChat && lastChat.id !== state?.you && /^(🔴|⏹)/u.test(lastChat.text)) toast(lastChat.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChat, toast]);

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

  // recording: keep everyone's audio in the mix as people join, leave or switch microphones
  useEffect(() => {
    const r = recorder.current;
    if (!r) return;
    r.addAudio("me", meeting.current?.stream);
    for (const p of peers) r.addAudio(p.id, p.stream);
    r.keepOnly(["me", ...peers.map((p) => p.id)]);
  }, [peers, recording]);
  const startRecording = () => {
    if (!m || !stageRef.current) return;
    try {
      const r = new MeetRecorder(stageRef.current, `Presence Meet ${code}`);
      r.start();
      recorder.current = r;
      setRecording(true);
      m.chat(`🔴 ${name} started recording this meeting`);
      toast("Recording — the video is saved to this computer when you stop. Keep this tab open.");
    } catch (e) {
      setErr(`Recording: ${e.message}`);
    }
  };
  const stopRecording = async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setRecording(false);
    m?.chat(`⏹ ${name} stopped recording`);
    const size = await r.stop();
    toast(`Recording saved to Downloads (${(size / 1e6).toFixed(1)} MB)`);
  };

  // shortcuts, like Meet: Ctrl+D mic, Ctrl+E camera, Ctrl+Alt+C chat, Ctrl+Alt+P people, Ctrl+Alt+H hand;
  // and like Zoom: hold Space to talk while you're muted
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    const onKey = (e) => {
      const mt = meeting.current;
      if (e.code === "Space" && !e.repeat && !e.ctrlKey && !e.metaKey && !typing(e) && mt && state?.status === "joined" && !mt.localState().mic) {
        e.preventDefault();
        ptt.current = true;
        toggleMic();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (e.altKey && mt) {
        const p = { c: "chat", p: "people" }[k];
        if (p) setPanel((x) => (x === p ? "" : p));
        if (k === "h") {
          mt.setHand(!mt.hand);
          setState({ ...mt.state });
        }
        if (p || k === "h") e.preventDefault();
        return;
      }
      if (k === "d" || k === "e") {
        e.preventDefault();
        (k === "d" ? toggleMic : toggleCam)();
      }
    };
    const onUp = (e) => {
      if (e.code !== "Space" || !ptt.current) return;
      ptt.current = false;
      toggleMic();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [toggleMic, toggleCam, state?.status]);

  const leave = () => {
    if (recorder.current) stopRecording();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    m?.leave();
    m?.stream?.getTracks().forEach((t) => t.stop());
    meeting.current = null;
    router.push("/app/meet");
  };

  // live captions: your own speech -> text (the browser's speech recognition), shared with the meeting.
  // Only while you have captions on AND your mic is on — muting really means nothing is heard.
  const micOn = !!m?.localState().mic;
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!captionsOn || !micOn || state?.status !== "joined" || !SR) return;
    let alive = true;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      const text = r[0].transcript;
      meeting.current?.caption(text, r.isFinal);
      setMyCaption({ text, at: Date.now() });
    };
    rec.onend = () => alive && setTimeout(() => alive && rec.start(), 250); // Chrome stops after silence: keep going
    rec.onerror = (e) => e.error === "not-allowed" && setErr("Captions need microphone permission.");
    rec.start();
    return () => {
      alive = false;
      rec.onend = null;
      rec.abort();
    };
  }, [captionsOn, micOn, state?.status]);

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : roomRef.current?.requestFullscreen())?.catch(() => {});
  const pictureInPicture = async (id) => {
    const video = document.querySelector(`.gm-tile[data-peer="${id}"] video`) ?? document.querySelector(".gm-tile:not([data-peer='me']) video");
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video?.requestPictureInPicture();
    } catch {
      setErr("Picture-in-picture needs someone's video on screen.");
    }
  };
  const chooseCam = async (id) => {
    setDev((d) => ({ ...d, videoId: id }));
    if (cam) await m?.setCam(true, id);
  };
  const chooseMic = async (id) => {
    setDev((d) => ({ ...d, audioId: id }));
    await m?.switchMic(id);
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
          {info?.title && <p className="gm-lobby-title">{info.title}</p>}
          <h1>{info?.must_ask ? "Ask to join?" : "Ready to join?"}</h1>
          <p className="gm-lobby-who">
            {!info ? (err ? "" : "Checking who's here…") : info.people.length ? `${info.people.slice(0, 3).join(", ")}${info.people.length > 3 ? ` and ${info.people.length - 3} more` : ""} ${info.people.length === 1 ? "is" : "are"} in this call` : "No one else is here"}
          </p>
          {info && <p className="gm-time">{info.is_host ? "You're the host of this meeting" : `Hosted by ${info.host}`}</p>}
          <button className="gm-primary big" onClick={join} disabled={!info || info.full || !mediaReady || autoJoined.current}>
            {info?.full
              ? "Meeting is full"
              : !mediaReady
                ? "Starting camera…"
                : prefs.skipLobby && info
                  ? "Joining…"
                  : info?.must_ask
                    ? "Ask to join"
                    : "Join now"}
          </button>
          {!info && err && (
            <button className="gm-outline" onClick={() => router.push("/app/meet")}>
              Return to home screen
            </button>
          )}
          <CopyLink code={code} />
          <ShareRow code={code} />
          <label className="gm-skip">
            <input type="checkbox" checked={skipLobby} onChange={(e) => setSkipLobby(e.target.checked)} />
            Next time, join directly from the link (skip this screen)
          </label>
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

  // ---------------------------------------------------------------- waiting to be let in
  if (state.status === "waiting") {
    const own = m?.displayStream;
    return (
      <div className="gm-lobby">
        <div className="gm-lobby-video">
          {own?.getVideoTracks().some((t) => t.readyState === "live") ? <StreamVideo stream={own} muted mirror /> : <div className="gm-cam-off">Camera is off</div>}
          <div className="gm-lobby-name">{name}</div>
        </div>
        <div className="gm-lobby-side">
          {state.title && <p className="gm-lobby-title">{state.title}</p>}
          <div className="gm-spinner" aria-hidden="true" />
          <h1>Asking to join…</h1>
          <p className="gm-lobby-who">
            {state.hostsHere ? "You'll join the call when someone lets you in." : "The host isn't here yet — you'll join as soon as they let you in."}
          </p>
          <button className="gm-outline" onClick={leave}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- ended
  if (["full", "unauthorized", "disconnected", "left", "notfound", "denied", "removed", "ended"].includes(state.status)) {
    const msg = {
      full: "This meeting is full",
      unauthorized: "Your session expired — please sign in again",
      disconnected: "You lost your network connection",
      left: "You left the meeting",
      notfound: "Check your meeting code — this meeting doesn't exist",
      denied: "Someone in the call denied your request to join",
      removed: `You've been removed from the meeting${state.removedBy ? ` by ${state.removedBy}` : ""}`,
      ended: "The host ended the meeting for everyone",
    }[state.status];
    return (
      <div className="gm-ended">
        <h1>{msg}</h1>
        {state.started && <p className="gm-lobby-who">Call length {duration(Date.now() - state.started)}</p>}
        <div className="gm-ended-actions">
          {["left", "disconnected", "full"].includes(state.status) && (
            <button className="gm-outline" onClick={() => window.location.reload()}>
              Rejoin
            </button>
          )}
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
  if (speakingId && speakingId !== "me") lastSpeaker.current = speakingId;
  const presenter = peers.find((p) => p.screen) ?? (meState.screen ? meState : null);
  const peerIds = new Set(peers.map((p) => p.id));
  const pinnedId = pinned === "me" || peerIds.has(pinned) ? pinned : null;
  // who gets the big tile: the presenter, then whoever you pinned, then (spotlight / sidebar) the last speaker
  const featuredId =
    presenter?.id ??
    pinnedId ??
    (layout === "spotlight" || layout === "sidebar" ? (peerIds.has(lastSpeaker.current) ? lastSpeaker.current : peers[0]?.id ?? "me") : null);
  const bigLayout = !!featuredId && layout !== "tiled";
  const reactionsFor = (id) => state.reactions.filter((r) => r.id === (id === "me" ? state.you : id));
  const allTiles = [{ p: meState, stream: m?.displayStream, me: true }, ...peers.map((p) => ({ p, stream: p.stream, me: false }))];
  const tiles = layout === "spotlight" && featuredId ? allTiles.filter((t) => t.p.id === featuredId) : allTiles;
  const sidePanel = ["chat", "people", "info", "settings", "effects", "layout", "trouble", "host"].includes(panel);
  const amHost = !!state.amHost;
  const rules = state.settings;
  const canChat = amHost || rules.chat;
  const canShare = amHost || rules.share;
  const canReact = amHost || rules.react;
  const waiting = state.waiting ?? [];
  const host = (type, extra) => m?.hostAction(type, extra);
  const setRule = (patch) => m?.updateSettings({ ...rules, ...patch });
  const endForAll = () => {
    if (!window.confirm("End the call for everyone? Everyone will be removed from the meeting.")) return;
    if (recorder.current) stopRecording();
    m?.endForAll();
  };
  const captionsSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const now = Date.now();
  const captionLines = captionsOn
    ? [
        ...Object.entries(state.captions)
          .filter(([, c]) => now - c.at < 6000)
          .map(([id, c]) => ({ id, name: c.name, text: c.text })),
        ...(myCaption && now - myCaption.at < 6000 ? [{ id: "me", name: "You", text: myCaption.text }] : []),
      ].slice(-3)
    : [];
  const sendChat = (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.text;
    m?.chat(input.value);
    input.value = "";
  };
  const togglePanel = (p) => {
    setPanel(panel === p ? "" : p);
    setMenu("");
  };
  const toggleMenu = (k) => setMenu(menu === k ? "" : k);
  const MenuItem = ({ icon, label, onClick, disabled, sub }) => (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setMenu("");
        onClick?.();
      }}
    >
      <Icon name={icon} />
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </button>
  );

  return (
    <div ref={roomRef} className={`gm-room ${sidePanel ? "with-panel" : ""}`} onClick={() => menu && setMenu("")}>
      <div ref={stageRef} className={`gm-stage ${bigLayout ? "presenting" : ""} layout-${layout}`} data-count={tiles.length}>
        {tiles.map(({ p, stream: s, me }) => {
          const showVideo = (p.cam || p.screen) && s?.getVideoTracks().length > 0;
          const speaking = speakingId === p.id && p.mic;
          const big = bigLayout && featuredId === p.id;
          return (
            <div
              key={p.id}
              className={`mt-tile gm-tile ${speaking ? "speaking" : ""} ${big ? "big" : ""}`}
              data-peer={p.id}
              data-cam={p.cam ? 1 : 0}
              data-mic={p.mic ? 1 : 0}
              data-tracks={`${s?.getAudioTracks().length ?? 0}a${s?.getVideoTracks().length ?? 0}v`}
              onDoubleClick={() => setPinned(pinnedId === p.id ? null : p.id)}
              title={pinnedId === p.id ? "Double-click to unpin" : "Double-click to pin"}
            >
              <StreamVideo stream={s} muted={me} mirror={me && !p.screen} speakerId={dev.speakerId} className={showVideo ? "" : "hidden"} />
              {!showVideo && <Avatar name={p.name} size={big ? 120 : 88} />}
              <div className="gm-badges">
                {pinnedId === p.id && (
                  <span className="gm-badge" title="Pinned">
                    <Icon name="pin" size={16} />
                  </span>
                )}
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
            <p>Share this meeting link with others that you want in the meeting.</p>
            <LinkBox code={code} />
          </div>
        )}
        {captionLines.length > 0 && (
          <div className="gm-captions" aria-live="polite">
            {captionLines.map((c) => (
              <p key={c.id}>
                <b>{c.name}</b> {c.text}
              </p>
            ))}
          </div>
        )}
        {state.status === "reconnecting" && <div className="gm-banner">Trying to reconnect…</div>}
      </div>

      {sidePanel && (
        <aside className="gm-panel" onClick={(e) => e.stopPropagation()}>
          {panel === "effects" ? (
            <EffectsPanel value={effect} onChange={chooseEffect} onClose={() => setPanel("")} />
          ) : (
            <>
              <div className="gm-panel-head">
                <b>
                  {
                    {
                      chat: "In-call messages",
                      people: "People",
                      info: "Meeting details",
                      settings: "Settings",
                      layout: "Adjust view",
                      trouble: "Troubleshooting and help",
                      host: "Host controls",
                    }[panel]
                  }
                </b>
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
                  {canChat ? (
                    <form onSubmit={sendChat} className="gm-chat-form">
                      <input name="text" placeholder="Send a message" maxLength={1000} autoComplete="off" />
                      <button className="gm-icon-btn light" aria-label="Send" title="Send">
                        <Icon name="send" />
                      </button>
                    </form>
                  ) : (
                    <p className="gm-note warn">
                      <Icon name="lock" size={16} /> The host turned off chat for everyone.
                    </p>
                  )}
                </>
              )}
              {panel === "people" && (
                <>
                  <CopyLink code={code} label="Add people (copy link)" className="gm-outline small" />
                  {amHost && waiting.length > 0 && (
                    <>
                      <p className="gm-section">
                        Waiting to join · {waiting.length}
                        {waiting.length > 1 && (
                          <button className="gm-text-btn small" onClick={() => m.admit(null, true)}>
                            Admit all
                          </button>
                        )}
                      </p>
                      <ul className="mt-people gm-people">
                        {waiting.map((w) => (
                          <li key={w.id}>
                            <Avatar name={w.name} size={32} />
                            <span style={{ flex: 1 }}>{w.name}</span>
                            <button className="gm-text-btn small" onClick={() => m.deny(w.id)}>
                              Deny
                            </button>
                            <button className="gm-text-btn small" onClick={() => m.admit(w.id)}>
                              Admit
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="gm-section">
                    In the meeting · {peers.length + 1}
                    {amHost && peers.some((p) => p.mic) && (
                      <button className="gm-text-btn small" onClick={() => host("mute", { all: true })}>
                        Mute all
                      </button>
                    )}
                  </p>
                  <ul className="mt-people gm-people">
                    {[{ ...meState, host: amHost }, ...peers].map((p) => (
                      <li key={p.id}>
                        <Avatar name={p.name} size={32} />
                        <span className="gm-person">
                          {p.id === "me" ? `${p.name} (You)` : p.name}
                          {p.host && <small>Meeting host</small>}
                        </span>
                        {p.hand && (amHost && p.id !== "me" ? (
                          <button className="gm-icon-btn light" title="Lower hand" onClick={() => host("lower_hand", { id: p.id })}>
                            <Icon name="hand" size={18} />
                          </button>
                        ) : (
                          <Icon name="hand" size={18} />
                        ))}
                        {p.screen && <Icon name="present" size={18} />}
                        <button className="gm-icon-btn light" title={pinnedId === p.id ? "Unpin" : "Pin to the main screen"} onClick={() => setPinned(pinnedId === p.id ? null : p.id)}>
                          <Icon name="pin" size={18} />
                        </button>
                        {amHost && p.id !== "me" && p.mic ? (
                          <button className="gm-icon-btn light" title={`Mute ${p.name}`} onClick={() => host("mute", { id: p.id })}>
                            <Icon name="mic" size={18} />
                          </button>
                        ) : (
                          <Icon name={p.mic ? "mic" : "micOff"} size={18} />
                        )}
                        {amHost && p.id !== "me" && (
                          <>
                            <button
                              className={`gm-icon-btn light ${p.host ? "on" : ""}`}
                              title={p.host ? "Remove co-host" : "Make co-host"}
                              onClick={() => host("cohost", { id: p.id, on: !p.host })}
                            >
                              <Icon name="star" size={18} />
                            </button>
                            <button
                              className="gm-icon-btn light danger"
                              title={`Remove ${p.name} from the call`}
                              onClick={() => window.confirm(`Remove ${p.name} from the call?`) && host("remove", { id: p.id })}
                            >
                              <Icon name="personRemove" size={18} />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {panel === "host" && amHost && (
                <div className="gm-host">
                  <p className="gm-note">Only hosts can use these controls. Changes apply right away, for everyone.</p>
                  <p className="gm-section">Meeting moderation</p>
                  <div className="gm-radios" role="radiogroup" aria-label="Who can join">
                    {ACCESS.map(([k, label, hint]) => (
                      <label key={k} className={rules.access === k ? "on" : ""}>
                        <input type="radio" name="access" checked={rules.access === k} onChange={() => setRule({ access: k })} />
                        <span>
                          <b>{label}</b>
                          <small>{hint}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="gm-section">Let everyone</p>
                  {[
                    ["chat", "Send chat messages"],
                    ["share", "Share their screen"],
                    ["react", "Send reactions"],
                  ].map(([k, label]) => (
                    <label key={k} className="gm-switch">
                      <span>{label}</span>
                      <input type="checkbox" checked={!!rules[k]} onChange={(e) => setRule({ [k]: e.target.checked })} />
                    </label>
                  ))}
                  <p className="gm-section">Everyone in the call</p>
                  <div className="gm-host-actions">
                    <button className="gm-outline small" onClick={() => host("mute", { all: true })}>
                      <Icon name="micOff" size={16} /> Mute everyone
                    </button>
                    <button className="gm-outline small" onClick={() => host("lower_hand", { all: true })}>
                      <Icon name="hand" size={16} /> Lower all hands
                    </button>
                  </div>
                  <button className="gm-danger" onClick={endForAll}>
                    <Icon name="callEnd" size={18} /> End call for everyone
                  </button>
                </div>
              )}
              {panel === "info" && (
                <>
                  <p className="gm-section">Joining info</p>
                  <LinkBox code={code} />
                  <p className="gm-note">Video and audio go directly between participants, encrypted end to end. Up to {QUALITY[quality].label} video.</p>
                </>
              )}
              {panel === "layout" && (
                <div className="gm-radios" role="radiogroup" aria-label="Layout">
                  {[
                    ["auto", "Auto (dynamic)", "Let Presence Meet choose the layout"],
                    ["tiled", "Tiled", "Everyone in an equal grid"],
                    ["spotlight", "Spotlight", "Only the active speaker or the pinned person"],
                    ["sidebar", "Sidebar", "Active speaker big, everyone else on the side"],
                  ].map(([k, label, hint]) => (
                    <label key={k} className={layout === k ? "on" : ""}>
                      <input type="radio" name="layout" checked={layout === k} onChange={() => setLayout(k)} />
                      <span>
                        <b>{label}</b>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                  <p className="gm-note">Tip: double-click anyone&apos;s tile to pin them.</p>
                </div>
              )}
              {panel === "trouble" && (
                <div className="gm-trouble">
                  <p className="gm-section">Connections</p>
                  {peers.length === 0 && <p className="gm-note">Connection checks appear when someone joins.</p>}
                  {peers.map((p) => (
                    <div key={p.id} className="gm-trouble-row">
                      <i className={`mt-q ${p.quality ?? "unknown"}`} />
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span className="gm-time">
                        {p.connection ?? "connecting"}
                        {p.rtt != null && ` · ${Math.round(p.rtt * 1000)} ms`}
                      </span>
                    </div>
                  ))}
                  <p className="gm-section">You are sending</p>
                  <p className="gm-note">
                    {(() => {
                      const s = m?.localTrack("video")?.getSettings?.();
                      return s?.width ? `${s.width}×${s.height} at ${Math.round(s.frameRate ?? 30)} fps` : "No video (camera off)";
                    })()}
                    {" · "}noise suppression, echo cancellation and auto gain on
                  </p>
                  <p className="gm-section">If something doesn&apos;t work</p>
                  <ul className="gm-tips">
                    <li>Someone can&apos;t join from another device: open the app with <b>npm run dev:lan</b> (same Wi-Fi) or deploy it — a localhost link only works on this computer.</li>
                    <li>Stuck on “Connecting…”: strict office or mobile networks need a TURN relay (TURN_URLS in backend/.env).</li>
                    <li>Choppy video: switch to Data saver in Settings, or turn off background effects.</li>
                    <li>Echo: use headphones, or mute when you&apos;re not speaking (Ctrl+D).</li>
                  </ul>
                  <p className="gm-section">Keyboard shortcuts</p>
                  <ul className="gm-keys">
                    {[
                      ["Ctrl + D", "Mute / unmute"],
                      ["Space (hold)", "Talk while muted"],
                      ["Ctrl + E", "Camera on / off"],
                      ["Ctrl + Alt + C", "Chat"],
                      ["Ctrl + Alt + P", "People"],
                      ["Ctrl + Alt + H", "Raise / lower hand"],
                    ].map(([k, what]) => (
                      <li key={k}>
                        <kbd>{k}</kbd> {what}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {panel === "settings" && (
                <div className="gm-settings">
                  <label>
                    Camera
                    <select value={dev.videoId} onChange={(e) => chooseCam(e.target.value)}>
                      <option value="">Default</option>
                      {devices.cameras.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Microphone
                    <select value={dev.audioId} onChange={(e) => chooseMic(e.target.value)}>
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
                  <label className="gm-skip">
                    <input type="checkbox" checked={skipLobby} onChange={(e) => setSkipLobby(e.target.checked)} />
                    Join directly from meeting links (skip the preview screen)
                  </label>
                </div>
              )}
            </>
          )}
        </aside>
      )}

      {amHost && waiting.length > 0 && panel !== "people" && (
        <div className="gm-knock" role="alertdialog" aria-label="Someone wants to join" onClick={(e) => e.stopPropagation()}>
          <Avatar name={waiting[0].name} size={40} />
          <div>
            <b>{waiting.length === 1 ? `${waiting[0].name} wants to join this call` : `${waiting.length} people want to join this call`}</b>
            <div className="gm-knock-actions">
              {waiting.length === 1 ? (
                <>
                  <button className="gm-text-btn" onClick={() => m.deny(waiting[0].id)}>
                    Deny entry
                  </button>
                  <button className="gm-primary small" onClick={() => m.admit(waiting[0].id)}>
                    Admit
                  </button>
                </>
              ) : (
                <>
                  <button className="gm-text-btn" onClick={() => togglePanel("people")}>
                    View all
                  </button>
                  <button className="gm-primary small" onClick={() => m.admit(null, true)}>
                    Admit all
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="gm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="gm-toast">
            {t.text}
          </div>
        ))}
      </div>

      <footer className="gm-bar" role="toolbar" aria-label="Meeting controls" onClick={(e) => e.stopPropagation()}>
        <div className="gm-bar-left">
          {recording && (
            <button className="gm-rec" onClick={stopRecording} title="Stop recording">
              <i /> REC
            </button>
          )}
          <span>{timeNow(clock)}</span>
          <span className="gm-sep">|</span>
          <span>{code}</span>
          {state.started && <span className="gm-timer" title="Call length">{duration(clock - state.started)}</span>}
          <button className="gm-icon-btn small" title="Meeting details" onClick={() => togglePanel("info")}>
            <Icon name="info" size={20} />
          </button>
        </div>
        <div className="gm-bar-center">
          <div className="gm-pill gm-menu-wrap">
            <button className="gm-arrow" title="Audio settings" onClick={() => toggleMenu("mic")} aria-expanded={menu === "mic"}>
              <Icon name="up" size={18} />
            </button>
            <button className={`gm-round ${meState.mic ? "" : "off"}`} onClick={toggleMic} title="Microphone (Ctrl+D)" aria-pressed={!meState.mic}>
              <Icon name={meState.mic ? "mic" : "micOff"} />
            </button>
            {menu === "mic" && (
              <div className="gm-pop" role="menu">
                <p className="gm-pop-title">Microphone</p>
                {(devices.mics.length ? devices.mics : [{ id: "", label: "Default microphone" }]).map((d) => (
                  <button key={d.id || "default"} role="menuitemradio" aria-checked={dev.audioId === d.id} onClick={() => { chooseMic(d.id); setMenu(""); }}>
                    <Icon name="mic" size={18} /> {d.label} {dev.audioId === d.id && "✓"}
                  </button>
                ))}
                {devices.speakers.length > 0 && <p className="gm-pop-title">Speaker</p>}
                {devices.speakers.map((d) => (
                  <button key={d.id} role="menuitemradio" aria-checked={dev.speakerId === d.id} onClick={() => { setDev({ ...dev, speakerId: d.id }); setMenu(""); }}>
                    <Icon name="speaker" size={18} /> {d.label} {dev.speakerId === d.id && "✓"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="gm-pill gm-menu-wrap">
            <button className="gm-arrow" title="Video settings" onClick={() => toggleMenu("cam")} aria-expanded={menu === "cam"}>
              <Icon name="up" size={18} />
            </button>
            <button className={`gm-round ${cam ? "" : "off"}`} onClick={toggleCam} title="Camera (Ctrl+E)" aria-pressed={!cam}>
              <Icon name={cam ? "cam" : "camOff"} />
            </button>
            {menu === "cam" && (
              <div className="gm-pop" role="menu">
                <p className="gm-pop-title">Camera</p>
                {(devices.cameras.length ? devices.cameras : [{ id: "", label: "Default camera" }]).map((d) => (
                  <button key={d.id || "default"} role="menuitemradio" aria-checked={dev.videoId === d.id} onClick={() => { chooseCam(d.id); setMenu(""); }}>
                    <Icon name="cam" size={18} /> {d.label} {dev.videoId === d.id && "✓"}
                  </button>
                ))}
                <button onClick={() => togglePanel("effects")}>
                  <Icon name="effects" size={18} /> Backgrounds and effects
                </button>
              </div>
            )}
          </div>
          {navigator.mediaDevices?.getDisplayMedia && (
            <button
              className={`gm-round ${meState.screen ? "on" : ""}`}
              title={meState.screen ? "Stop presenting" : canShare ? "Present your screen" : "The host turned off screen sharing"}
              disabled={!canShare && !meState.screen}
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
          <div className="gm-menu-wrap">
            <button
              className={`gm-round ${panel === "react" ? "on" : ""}`}
              title={canReact ? "Send a reaction" : "The host turned off reactions"}
              disabled={!canReact}
              onClick={() => togglePanel("react")}
            >
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
          <button
            className={`gm-round ${captionsOn ? "on" : ""}`}
            title={captionsSupported ? (captionsOn ? "Turn off captions" : "Turn on captions") : "Captions need Chrome or Edge"}
            disabled={!captionsSupported}
            aria-pressed={captionsOn}
            onClick={() => setCaptionsOn((c) => !c)}
          >
            <Icon name="captions" />
          </button>
          <button className={`gm-round ${meState.hand ? "on" : ""}`} title="Raise hand" onClick={() => { m.setHand(!m.hand); setState({ ...m.state }); }}>
            <Icon name="hand" />
          </button>
          <div className="gm-menu-wrap">
            <button className={`gm-round ${menu === "more" ? "on" : ""}`} title="More options" onClick={() => toggleMenu("more")} aria-expanded={menu === "more"}>
              <Icon name="more" />
            </button>
            {menu === "more" && (
              <div className="gm-pop gm-more" role="menu">
                {recording ? (
                  <MenuItem icon="record" label="Stop recording" sub="Saves the video to your Downloads" onClick={stopRecording} />
                ) : (
                  <MenuItem
                    icon="record"
                    label="Record meeting"
                    sub={canRecord() ? "Saved on this computer · everyone is told" : "Recording needs Chrome, Edge or Firefox"}
                    onClick={startRecording}
                    disabled={!canRecord()}
                  />
                )}
                <hr />
                <MenuItem icon="layout" label="Adjust view" onClick={() => togglePanel("layout")} />
                <MenuItem icon="fullscreen" label={document.fullscreenElement ? "Exit full screen" : "Full screen"} onClick={fullscreen} />
                <MenuItem icon="pip" label="Open picture-in-picture" onClick={() => pictureInPicture(featuredId ?? peers[0]?.id)} />
                <MenuItem icon="effects" label="Backgrounds and effects" onClick={() => togglePanel("effects")} />
                <MenuItem icon="captions" label={captionsOn ? "Turn off captions" : "Turn on captions"} onClick={() => setCaptionsOn((c) => !c)} disabled={!captionsSupported} />
                <hr />
                <MenuItem icon="wrench" label="Troubleshooting and help" onClick={() => togglePanel("trouble")} />
                <MenuItem icon="settings" label="Settings" onClick={() => togglePanel("settings")} />
                {amHost && (
                  <>
                    <hr />
                    <MenuItem icon="shield" label="Host controls" onClick={() => togglePanel("host")} />
                    <MenuItem icon="callEnd" label="End call for everyone" onClick={endForAll} />
                  </>
                )}
              </div>
            )}
          </div>
          <button className="gm-leave" title="Leave call" onClick={leave}>
            <Icon name="callEnd" />
          </button>
        </div>
        <div className="gm-bar-right">
          {amHost && (
            <button className={`gm-icon-btn ${panel === "host" ? "on" : ""}`} title="Host controls" onClick={() => togglePanel("host")}>
              <Icon name="shield" />
            </button>
          )}
          <button className={`gm-icon-btn ${panel === "people" ? "on" : ""}`} title="People" onClick={() => togglePanel("people")}>
            <Icon name="people" />
            <span className="gm-count">{peers.length + 1}</span>
            {amHost && waiting.length > 0 && <span className="mt-badge">{waiting.length}</span>}
          </button>
          <button className={`gm-icon-btn ${panel === "chat" ? "on" : ""}`} title="Chat" onClick={() => togglePanel("chat")}>
            <Icon name="chat" />
            {unread > 0 && <span className="mt-badge">{unread}</span>}
          </button>
          <button className={`gm-icon-btn ${panel === "effects" ? "on" : ""}`} title="Backgrounds and effects" onClick={() => togglePanel("effects")}>
            <Icon name="effects" />
          </button>
        </div>
      </footer>
      {err && (
        <div className="gm-error" onClick={() => setErr("")}>
          {err}
        </div>
      )}
    </div>
  );
}
