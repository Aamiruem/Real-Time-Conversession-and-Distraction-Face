import { useEffect, useRef, useState } from "react";
import { CameraDock } from "@/components/CameraDock";
import { CameraPoster } from "@/components/CameraPoster";
import { Gauge, PageHead } from "@/components/ui";
import { CameraRecorder } from "@/lib/cameraRecorder";
import { canRecord } from "@/lib/meetRecorder";
import { presenceReport, TRAITS } from "@/lib/personality";
import { downloadBlob, saveRecording } from "@/lib/recordings";
import { SECTIONS } from "@/lib/sections";
import { useFaceTracker } from "@/lib/useFaceTracker";
import { VoiceAnalyser } from "@/lib/voiceAnalysis";

// Presence Studio: record yourself (video + voice) and get how you come across — face, body language and voice,
// the personality impression you give, and what to change first. Everything is analysed in the browser.
const PROMPTS = [
  ["Introduce yourself", "Tell us who you are, what you do and what you're great at — like the start of an interview."],
  ["Pitch an idea", "Convince us in one minute: the problem, your idea, and why it will work."],
  ["Tell a story", "Share a moment you're proud of: what happened, what you did, how it ended."],
  ["Explain your work", "Explain what you work on so a 12-year-old would understand it."],
  ["Free talk", "Talk about anything you like — a hobby, a film, your plans for the week."],
];
const MIN_SECONDS = 10;
const TARGET_SECONDS = 60;
const HISTORY_KEY = "presence.studio.history";
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const AREAS = [
  ["face", "Face & eye contact", "🙂"],
  ["body", "Body language", "🧍"],
  ["voice", "Voice & delivery", "🎙️"],
];

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function Presence() {
  const cam = useFaceTracker({ audio: true, presence: true, body: true });
  const running = cam.status === "running";
  const [prompt, setPrompt] = useState(0);
  const [secs, setSecs] = useState(null); // null = not analysing
  const [report, setReport] = useState(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [history, setHistory] = useState(readHistory);
  const voice = useRef(null);
  const rec = useRef(null);
  const t0 = useRef(0);
  const [level, setLevel] = useState(-90);
  const analysing = secs !== null;

  async function begin() {
    setErr("");
    setSaved("");
    setReport(null);
    let stream = cam.stream.current;
    if (!running) stream = await cam.start();
    if (!stream) return;
    if (!stream.getAudioTracks().length) return setErr("Allow the microphone too — the voice is half of the analysis.");
    cam.engine.current.reset();
    cam.presence.current?.reset();
    cam.body.current?.reset();
    voice.current = new VoiceAnalyser();
    voice.current.start(stream);
    if (canRecord()) {
      try {
        rec.current = new CameraRecorder(cam.videoRef.current, cam.canvasRef.current, () => cam.engine.current.metrics(), "medium", stream);
        rec.current.start();
      } catch {
        rec.current = null; // analysis still works without the video file
      }
    }
    t0.current = Date.now();
    setSecs(0);
  }

  async function finish() {
    const seconds = (Date.now() - t0.current) / 1000;
    voice.current?.stop();
    const result = presenceReport({
      eye: cam.engine.current.metrics().focusPct,
      face: cam.presence.current?.summary() ?? {},
      body: cam.body.current?.summary() ?? {},
      voice: voice.current?.summary() ?? {},
    });
    setSecs(null);
    if (seconds < MIN_SECONDS) {
      rec.current?.stop();
      rec.current = null;
      return setErr(`Talk for at least ${MIN_SECONDS} seconds so there's enough to analyse.`);
    }
    setReport(result);
    const entry = { at: Date.now(), overall: result.overall, impression: result.impression, prompt: PROMPTS[prompt][0] };
    const next = [entry, ...history].slice(0, 8);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    // keep the video with its score, to watch later (Focus Rooms → My recordings)
    const r = rec.current;
    rec.current = null;
    if (r) {
      const { blob, durationSec, timeline } = await r.stop();
      const title = `Presence ${result.overall} · ${PROMPTS[prompt][0]}`;
      try {
        await saveRecording(blob, { title, source: "presence", durationSec, timeline });
        setSaved("Video saved to your account — find it in Focus Rooms → My recordings.");
      } catch {
        downloadBlob(blob, title);
        setSaved("Video downloaded to this device.");
      }
    }
  }

  // live timer + mic level; stop by itself at 2 minutes, and when the camera stops
  useEffect(() => {
    if (!analysing) return;
    const t = setInterval(() => {
      const s = (Date.now() - t0.current) / 1000;
      setSecs(s);
      setLevel(voice.current?.level ?? -90);
      if (s >= 120) finish();
    }, 250);
    return () => clearInterval(t);
  }, [analysing]);
  useEffect(() => {
    if (!running && analysing) finish();
  }, [running]);
  useEffect(
    () => () => {
      voice.current?.stop();
      rec.current?.stop();
    },
    [],
  );

  const m = cam.metrics;
  const live = cam.presence.current?.live;
  const bodyLive = cam.body.current?.live;
  const levelPct = Math.max(0, Math.min(100, ((level + 60) / 50) * 100));

  return (
    <>
      <PageHead
        eyebrow="Face · body · voice · personality"
        title="Presence Studio"
        highlight="Presence Studio"
        sub="Record yourself talking for about a minute. You get how you come across — your face, body language and voice, the personality impression you give, and exactly what to improve."
      />

      <div className="ps-prompts" role="radiogroup" aria-label="What to talk about">
        {PROMPTS.map(([label], i) => (
          <button key={label} type="button" role="radio" aria-checked={prompt === i} className={`ps-chip ${prompt === i ? "on" : ""}`}
            onClick={() => setPrompt(i)} disabled={analysing}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid split-3-2">
        <div>
          <div className="card ps-prompt">
            <div className="eyebrow">Talk about</div>
            <p>{PROMPTS[prompt][1]}</p>
          </div>
          <div className="video-wrap">
            <video ref={cam.videoRef} playsInline muted />
            <canvas ref={cam.canvasRef} />
            {analysing && <span className="rec-badge">● {clock(secs)} / {clock(TARGET_SECONDS)}</span>}
            {!running && (
              <CameraPoster kind="interview" color={SECTIONS["/app/presence"].color} title="Presence Studio"
                hint="Press play — allow camera + microphone, then start the analysis"
                loading={cam.status === "loading"} onStart={cam.start} />
            )}
          </div>
          <CameraDock running={running} source="presence" title="Presence Studio" recordable={false} />

          {analysing && (
            <div className="ps-live" aria-live="polite">
              <span><b>{Math.round(m.focusPct)}%</b> eye contact</span>
              <span><b>{live?.smiling ? "😊" : "😐"}</b> {live?.smiling ? "smiling" : "neutral"}</span>
              <span><b>{bodyLive?.posture ?? "—"}</b> posture</span>
              <span className="ps-level" title="Your voice level"><i style={{ width: `${levelPct}%` }} /></span>
            </div>
          )}
          <div className="ps-actions">
            {analysing ? (
              <button className="btn danger" onClick={finish}>
                ■ Stop &amp; analyse {clock(secs)}
              </button>
            ) : (
              <button className="btn" onClick={begin} disabled={cam.status === "loading"}>
                ● {running ? "Start analysis" : "Start camera & analysis"}
              </button>
            )}
            {running && !analysing && (
              <button className="btn ghost" onClick={cam.stop}>
                Stop camera
              </button>
            )}
          </div>
          {analysing && secs < MIN_SECONDS && <p className="small muted">Keep talking — at least {MIN_SECONDS} seconds (about a minute is best).</p>}
          {(err || cam.error) && <div className="alert error">{err || cam.error}</div>}
          {saved && <p className="small muted">{saved}</p>}
        </div>

        <div className="ps-side">
          {report ? (
            <Report report={report} onAgain={begin} />
          ) : (
            <div className="card">
              <h3>How it works</h3>
              <ol className="ps-steps">
                <li>Pick a topic above and press <b>Start</b>.</li>
                <li>Talk to the camera for about a minute, as if to a person.</li>
                <li>Press <b>Stop &amp; analyse</b> — you get scores for your face, body and voice, your personality impression and what to improve first.</li>
              </ol>
              <p className="small muted">🔒 The analysis runs on your device. The video is saved only to your own account.</p>
            </div>
          )}
          {history.length > 0 && (
            <div className="card">
              <h3>Your last sessions</h3>
              <ul className="ps-history">
                {history.map((h) => (
                  <li key={h.at}>
                    <b>{h.overall}</b>
                    <span>
                      {h.impression}
                      <small>{h.prompt} · {new Date(h.at).toLocaleDateString()}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Report({ report: r, onAgain }) {
  return (
    <>
      <div className="card ps-score">
        <Gauge value={r.overall} label="Overall presence" size={170} />
        <div>
          <div className="eyebrow">You come across as</div>
          <h2>{r.impression}</h2>
          <div className="ps-tags">
            {r.topTraits.map((k) => (
              <span key={k} className="ps-pill">{TRAITS[k].icon} {TRAITS[k].label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="ps-areas">
        {AREAS.map(([k, label, icon]) => (
          <div key={k} className="card ps-area">
            <span className="ps-area-ico" aria-hidden="true">{icon}</span>
            <b>{r.areas[k]}</b>
            <small>{label}</small>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Personality impression</h3>
        {Object.entries(r.traits).map(([k, v]) => (
          <div key={k} className="ps-trait">
            <span>{TRAITS[k].icon} {TRAITS[k].label}</span>
            <span className="ps-bar"><i style={{ width: `${v}%` }} /></span>
            <b>{v}</b>
          </div>
        ))}
        <p className="small muted" style={{ marginTop: 8 }}>How people are likely to read you from your face, gestures and voice in this recording — a first impression, not a psychological test.</p>
      </div>

      <div className="card">
        <h3>Improve first</h3>
        {r.tips.length ? (
          <ol className="ps-tips">
            {r.tips.map((t) => (
              <li key={t.text}>
                <span className={`ps-tip-area ${t.area}`}>{AREAS.find((a) => a[0] === t.area)[1]}</span>
                {t.text}
              </li>
            ))}
          </ol>
        ) : (
          <p>Nothing big to fix — great presence. Try a harder topic next time.</p>
        )}
        {r.strengths.length > 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>What already works</h3>
            <div className="ps-tags">
              {r.strengths.map((s) => (
                <span key={s} className="ps-pill ok">✓ {s}</span>
              ))}
            </div>
          </>
        )}
        <button className="btn sm" style={{ marginTop: 14 }} onClick={onAgain}>
          ↻ Try again
        </button>
      </div>

      <details className="card ps-measures">
        <summary>All measurements</summary>
        <dl>
          {[
            ["Eye contact", `${Math.round(r.measures.eye)}%`],
            ["Smiling", r.measures.smile_pct == null ? "—" : `${r.measures.smile_pct}%`],
            ["Facial expressiveness", r.measures.expressiveness ?? "—"],
            ["In frame", `${r.measures.face_visible_pct ?? 0}%`],
            ["Slouching", `${r.measures.slouch_pct ?? 0}%`],
            ["Hands visible", `${r.measures.hands_visible_pct ?? 0}%`],
            ["Touching face", `${r.measures.face_touch_pct ?? 0}%`],
            ["Speaking time", `${r.measures.speaking_pct ?? 0}%`],
            ["Long pauses", r.measures.long_pauses ?? 0],
            ["Voice level", r.measures.loudness_db == null ? "—" : `${r.measures.loudness_db} dB`],
            ["Pitch variety", r.measures.pitch_variation == null ? "—" : `${r.measures.pitch_variation}%`],
            ["Average pitch", r.measures.pitch_hz ? `${r.measures.pitch_hz} Hz` : "—"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
