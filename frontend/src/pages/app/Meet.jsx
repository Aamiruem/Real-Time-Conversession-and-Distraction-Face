import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { inviteLink, LevelMeter, listDevices, Meeting, openMedia, QUALITY } from "@/lib/meet";
import { useRouter, useSearchParams } from "@/lib/navigation";

const REACTIONS = ["👍", "👏", "❤️", "😂", "😮", "🎉", "🙌", "🤔"];
const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const initials = (name = "?") =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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

function Tile({ p, stream, me, speaking, reactions, speakerId, big }) {
  const showVideo = (p.cam || p.screen) && stream?.getVideoTracks().length > 0;
  return (
    <div
      className={`mt-tile ${speaking ? "speaking" : ""} ${big ? "big" : ""}`}
      data-cam={p.cam ? 1 : 0}
      data-mic={p.mic ? 1 : 0}
      data-tracks={`${stream?.getAudioTracks().length ?? 0}a${stream?.getVideoTracks().length ?? 0}v`}
    >
      {/* the <video> stays mounted with the camera off, so their audio keeps playing */}
      <StreamVideo stream={stream} muted={me} mirror={me && !p.screen} speakerId={speakerId} className={showVideo ? "" : "hidden"} />
      {!showVideo && (
        <div className="mt-avatar" aria-hidden="true">
          {initials(p.name)}
        </div>
      )}
      <div className="mt-name">
        {!p.mic && <span title="Muted">🔇</span>}
        {p.hand && <span title="Hand raised">✋</span>}
        {p.screen && <span title="Presenting">🖥️</span>}
        <b>{me ? `${p.name} (you)` : p.name}</b>
        {!me && p.quality && p.quality !== "unknown" && (
          <i className={`mt-q ${p.quality}`} title={`Connection: ${p.quality}${p.rtt ? ` · ${Math.round(p.rtt * 1000)} ms` : ""}`} />
        )}
      </div>
      {!me && p.connection && !["connected", "completed"].includes(p.connection) && (
        <div className="mt-connecting">{p.connection === "failed" ? "Reconnecting…" : "Connecting…"}</div>
      )}
      <div className="mt-reactions" aria-hidden="true">
        {reactions.map((r) => (
          <span key={r.key}>{r.emoji}</span>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const m = await api("/meet", { method: "POST" });
      router.push(`/app/meet?code=${m.code}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const join = (e) => {
    e.preventDefault();
    const c = code.trim().toLowerCase().split("code=").pop();
    if (!CODE_RE.test(c)) return setErr("Enter a code like abc-defg-hij, or paste the invite link.");
    router.push(`/app/meet?code=${c}`);
  };
  return (
    <div className="grid split-3-2">
      <div className="card mt-home">
        <h2>Video meetings for everyone</h2>
        <p className="muted">
          HD video, clear audio with noise suppression, screen sharing, chat, reactions and raised hands — right in the
          browser, nothing to install. Calls go directly between participants, encrypted end to end.
        </p>
        <div className="row" style={{ alignItems: "stretch", marginTop: 16 }}>
          <button className="btn" onClick={create} disabled={busy}>
            📹 {busy ? "Creating…" : "New meeting"}
          </button>
          <form onSubmit={join} className="row" style={{ flex: 1, minWidth: 240 }}>
            <input
              aria-label="Meeting code or link"
              placeholder="Enter a code or link"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn ghost" disabled={!code.trim()}>
              Join
            </button>
          </form>
        </div>
        {err && <div className="alert error">{err}</div>}
      </div>
      <div className="card">
        <div className="card-title">Good to know</div>
        <ul className="mt-tips">
          <li>Share the invite link — anyone can join, even as a guest.</li>
          <li>Up to 8 people per meeting (everyone connects directly, so it stays fast).</li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>D</kbd> mic · <kbd>Ctrl</kbd>+<kbd>E</kbd> camera, like Google Meet.
          </li>
          <li>Use headphones in noisy places; echo cancellation handles the rest.</li>
        </ul>
      </div>
    </div>
  );
}

export default function Meet() {
  const code = useSearchParams().get("code") ?? "";
  if (!CODE_RE.test(code)) {
    return (
      <>
        <PageHead eyebrow="Real-time · WebRTC" title="Meet" highlight="Meet" sub="Start or join a video meeting in one click." />
        <Home />
      </>
    );
  }
  return <Room key={code} code={code} />;
}

function Room({ code }) {
  const { user } = useAuth();
  const router = useRouter();
  const [stream, setStream] = useState(null);
  const [mediaReady, setMediaReady] = useState(false); // camera + mic started (or failed: join without them)
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [quality, setQuality] = useState("hd");
  const [devices, setDevices] = useState({ cameras: [], mics: [], speakers: [] });
  const [dev, setDev] = useState({ videoId: "", audioId: "", speakerId: "" });
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [state, setState] = useState(null); // meeting state once joined
  const [panel, setPanel] = useState(""); // "chat" | "people" | "settings" | "react"
  const [unread, setUnread] = useState(0);
  const [levels, setLevels] = useState({});
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const meeting = useRef(null);
  const meter = useRef(null);
  const chatEnd = useRef(null);
  const name = user?.full_name || user?.username || "You";

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
        setDevices(await listDevices()); // labels are only visible after permission
      })
      .catch((e) => {
        if (!alive) return;
        setCam(false);
        setMic(false);
        setMediaReady(true); // join without camera/mic; turning them on later asks again
        setErr(e.name === "NotAllowedError" ? "Camera/microphone blocked — allow them in the address bar, or join without them." : `Camera/microphone: ${e.message}`);
      });
    return () => {
      alive = false;
      if (!meeting.current) s?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const join = useCallback(() => {
    const local = stream ?? new MediaStream();
    local.getAudioTracks().forEach((t) => (t.enabled = mic));
    if (!cam) local.getVideoTracks().forEach((t) => t.stop());
    meter.current = new LevelMeter();
    const m = new Meeting(code, {
      stream: local,
      quality,
      onChange: (s) => {
        setState(s);
      },
    });
    meeting.current = m;
    m.connect();
  }, [stream, mic, cam, code, quality]);

  // leave on unmount (navigating away = hanging up)
  useEffect(
    () => () => {
      meeting.current?.leave();
      meeting.current?.stream?.getTracks().forEach((t) => t.stop());
      meter.current?.close();
    },
    [],
  );

  // clock, connection quality and who is speaking
  useEffect(() => {
    if (!state || state.status !== "joined") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const stats = setInterval(() => meeting.current?.pollStats(), 3000);
    const talk = setInterval(() => meter.current && setLevels(meter.current.levels()), 250);
    return () => [tick, stats, talk].forEach(clearInterval);
  }, [state?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const peers = useMemo(() => Object.values(state?.peers ?? {}), [state]);
  useEffect(() => {
    if (!state) return;
    meter.current?.add("me", meeting.current?.stream);
    for (const p of peers) if (p.stream) meter.current?.add(p.id, p.stream);
  }, [peers, state]);

  // unread chat badge
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

  // keyboard shortcuts (same as Google Meet)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleMic();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleCam();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMic, toggleCam]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr(`Invite link: ${inviteLink(code)}`);
    }
  };

  const leave = () => {
    m?.leave();
    m?.stream?.getTracks().forEach((t) => t.stop());
    meeting.current = null;
    router.push("/app/meet");
  };

  // ------------------------------------------------------------------ lobby
  if (!state) {
    return (
      <>
        <PageHead eyebrow={`Meeting ${code}`} title="Ready to join?" highlight="join?" sub="Check your camera and microphone first." />
        <div className="grid split-3-2">
          <div className="mt-lobby-video">
            {cam && stream?.getVideoTracks().length ? (
              <StreamVideo stream={stream} muted mirror />
            ) : (
              <div className="mt-avatar">{initials(name)}</div>
            )}
            <div className="mt-lobby-controls">
              <button className={`mt-btn ${mic ? "" : "off"}`} onClick={toggleMic} title="Microphone (Ctrl+D)">
                {mic ? "🎙️" : "🔇"}
              </button>
              <button className={`mt-btn ${cam ? "" : "off"}`} onClick={toggleCam} title="Camera (Ctrl+E)">
                {cam ? "📷" : "🚫"}
              </button>
            </div>
          </div>
          <div className="card" style={{ alignSelf: "start" }}>
            <div className="card-title">{info?.people?.length ? `${info.people.length} in the meeting` : "No one else is here yet"}</div>
            {info?.people?.length > 0 && <p className="muted small">{info.people.join(", ")}</p>}
            <label className="field">
              <span>Video quality</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                {Object.entries(QUALITY).map(([k, q]) => (
                  <option key={k} value={k}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn block" onClick={join} disabled={info?.full || !mediaReady} style={{ marginTop: 12 }}>
              {info?.full ? "Meeting is full" : mediaReady ? "Join now" : "Starting camera…"}
            </button>
            <button className="btn ghost block" onClick={copyLink} style={{ marginTop: 8 }}>
              {copied ? "✓ Link copied" : "🔗 Copy invite link"}
            </button>
            {err && <div className="alert error">{err}</div>}
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------ meeting
  if (["full", "unauthorized", "disconnected", "left"].includes(state.status)) {
    const msg = {
      full: "This meeting is full.",
      unauthorized: "Your session expired — please sign in again.",
      disconnected: "Lost the connection to the meeting.",
      left: "You left the meeting.",
    }[state.status];
    return (
      <div className="card mt-ended">
        <h2>{msg}</h2>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => window.location.reload()}>
            Rejoin
          </button>
          <button className="btn ghost" onClick={() => router.push("/app/meet")}>
            Back to Meet
          </button>
        </div>
      </div>
    );
  }

  const meState = { id: "me", name, ...(m?.localState() ?? {}) };
  const loudest = Object.entries(levels).sort((a, b) => b[1] - a[1])[0];
  const speakingId = loudest && loudest[1] > 0.08 ? loudest[0] : null;
  const presenter = peers.find((p) => p.screen) ?? (meState.screen ? meState : null);
  const reactionsFor = (id) => state.reactions.filter((r) => r.id === (id === "me" ? state.you : id));
  const tiles = [
    { p: meState, stream: m?.screenStream ?? m?.stream, me: true },
    ...peers.map((p) => ({ p, stream: p.stream, me: false })),
  ];
  const sendChat = (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.text;
    m?.chat(input.value);
    input.value = "";
  };

  return (
    <div className={`mt-room ${panel && panel !== "react" ? "with-panel" : ""}`}>
      <div className="mt-top">
        <b>{code}</b>
        <span className="muted">{clock(now - (state.started ?? now))}</span>
        <span className="chip">👥 {peers.length + 1}</span>
        {state.status === "reconnecting" && <span className="chip warn">Reconnecting…</span>}
      </div>

      <div className={`mt-stage ${presenter ? "presenting" : ""}`} data-count={tiles.length}>
        {tiles.map(({ p, stream: s, me }) => (
          <Tile
            key={p.id}
            p={p}
            stream={s}
            me={me}
            big={presenter?.id === p.id}
            speaking={speakingId === p.id && p.mic}
            reactions={reactionsFor(p.id)}
            speakerId={dev.speakerId}
          />
        ))}
        {peers.length === 0 && (
          <div className="mt-alone">
            <p>You&apos;re the only one here.</p>
            <button className="btn ghost sm" onClick={copyLink}>
              {copied ? "✓ Copied" : "🔗 Copy invite link"}
            </button>
          </div>
        )}
      </div>

      {panel && panel !== "react" && (
        <aside className="mt-panel card">
          <div className="mt-panel-head">
            <b>{{ chat: "In-call messages", people: "People", settings: "Settings" }[panel]}</b>
            <button className="btn ghost sm" onClick={() => setPanel("")} aria-label="Close panel">
              ✕
            </button>
          </div>
          {panel === "chat" && (
            <>
              <div className="mt-chat">
                {state.chat.length === 0 && <p className="muted small">Messages are visible to everyone in the call.</p>}
                {state.chat.map((c, i) => (
                  <div key={i} className={c.id === state.you ? "mine" : ""}>
                    <b>{c.id === state.you ? "You" : c.name}</b> <span className="muted small">{new Date(c.at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <p>{c.text}</p>
                  </div>
                ))}
                <span ref={chatEnd} />
              </div>
              <form onSubmit={sendChat} className="row">
                <input name="text" placeholder="Send a message" maxLength={1000} autoComplete="off" />
                <button className="btn sm">Send</button>
              </form>
            </>
          )}
          {panel === "people" && (
            <ul className="mt-people">
              {[meState, ...peers].map((p) => (
                <li key={p.id}>
                  <span className="mt-avatar sm">{initials(p.name)}</span>
                  <span style={{ flex: 1 }}>{p.id === "me" ? `${p.name} (you)` : p.name}</span>
                  {p.hand && "✋"} {p.screen && "🖥️"} {p.mic ? "🎙️" : "🔇"}
                </li>
              ))}
            </ul>
          )}
          {panel === "settings" && (
            <div style={{ display: "grid", gap: 10 }}>
              <label className="field">
                <span>Camera</span>
                <select value={dev.videoId} onChange={async (e) => { setDev({ ...dev, videoId: e.target.value }); if (cam) await m?.setCam(true, e.target.value); }}>
                  <option value="">Default</option>
                  {devices.cameras.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Microphone</span>
                <select value={dev.audioId} onChange={async (e) => { setDev({ ...dev, audioId: e.target.value }); await m?.switchMic(e.target.value); }}>
                  <option value="">Default</option>
                  {devices.mics.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              {devices.speakers.length > 0 && (
                <label className="field">
                  <span>Speaker</span>
                  <select value={dev.speakerId} onChange={(e) => setDev({ ...dev, speakerId: e.target.value })}>
                    <option value="">Default</option>
                    {devices.speakers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Video quality</span>
                <select value={quality} onChange={(e) => { setQuality(e.target.value); m?.setQuality(e.target.value, dev.videoId); }}>
                  {Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
                </select>
              </label>
              <p className="muted small">Audio: echo cancellation, noise suppression and automatic gain are on.</p>
            </div>
          )}
        </aside>
      )}

      <div className="mt-bar" role="toolbar" aria-label="Meeting controls">
        <button className={`mt-btn ${meState.mic ? "" : "off"}`} onClick={toggleMic} title="Microphone (Ctrl+D)" aria-pressed={!meState.mic}>
          {meState.mic ? "🎙️" : "🔇"}
        </button>
        <button className={`mt-btn ${cam ? "" : "off"}`} onClick={toggleCam} title="Camera (Ctrl+E)" aria-pressed={!cam}>
          {cam ? "📷" : "🚫"}
        </button>
        {navigator.mediaDevices?.getDisplayMedia && (
          <button
            className={`mt-btn ${meState.screen ? "on" : ""}`}
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
            🖥️
          </button>
        )}
        <button className={`mt-btn ${meState.hand ? "on" : ""}`} title="Raise hand" onClick={() => { m.setHand(!m.hand); setState({ ...m.state }); }}>
          ✋
        </button>
        <div className="mt-react-wrap">
          <button className={`mt-btn ${panel === "react" ? "on" : ""}`} title="Send a reaction" onClick={() => setPanel(panel === "react" ? "" : "react")}>
            😊
          </button>
          {panel === "react" && (
            <div className="mt-react-pop card">
              {REACTIONS.map((e) => (
                <button key={e} onClick={() => m.react(e)} aria-label={`React ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`mt-btn ${panel === "chat" ? "on" : ""}`} title="Chat" onClick={() => setPanel(panel === "chat" ? "" : "chat")}>
          💬{unread > 0 && <span className="mt-badge">{unread}</span>}
        </button>
        <button className={`mt-btn ${panel === "people" ? "on" : ""}`} title="People" onClick={() => setPanel(panel === "people" ? "" : "people")}>
          👥
        </button>
        <button className={`mt-btn ${panel === "settings" ? "on" : ""}`} title="Settings" onClick={() => setPanel(panel === "settings" ? "" : "settings")}>
          ⚙️
        </button>
        <button className="mt-btn" title="Copy invite link" onClick={copyLink}>
          {copied ? "✓" : "🔗"}
        </button>
        <button className="mt-btn leave" title="Leave call" onClick={leave}>
          📞
        </button>
      </div>
      {err && <div className="alert error">{err}</div>}
    </div>
  );
}
