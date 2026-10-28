import { useEffect, useRef, useState } from "react";
import { Donut, Gauge, Metric, PageHead, RiskCard } from "@/components/ui";
import { api, toDate } from "@/lib/api";
import { livePayload, sessionPayload, STATE_COLORS, STATE_EMOJI, THRESHOLDS } from "@/lib/attention";
import { useFaceTracker } from "@/lib/useFaceTracker";

function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.25;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
  osc.onended = () => ctx.close();
}

const fmt = (s) => new Date(s * 1000).toISOString().slice(11, 19);

export default function FocusMonitor() {
  const { videoRef, canvasRef, metrics: m, status, error, start, stop } = useFaceTracker();
  const [alarmOn, setAlarmOn] = useState(true);
  const [saved, setSaved] = useState(null);
  const [final, setFinal] = useState(null);
  const [fatigue, setFatigue] = useState(null);
  const [last, setLast] = useState(null);
  const [err, setErr] = useState("");
  const startedAt = useRef("");
  const lastPush = useRef(0);
  const wasDrowsy = useRef(false);

  useEffect(() => {
    api("/attention/sessions")
      .then((s) => setLast(s.at(-1) ?? null))
      .catch(() => {});
  }, []);

  // live side effects: alarm + push metrics to the backend every 3 s (shared with your focus rooms)
  useEffect(() => {
    if (status !== "running") return;
    if (m.alarm && !wasDrowsy.current && alarmOn) beep();
    wasDrowsy.current = m.alarm;
    const now = Date.now();
    if (now - lastPush.current > 3000 && m.elapsedSec > 1) {
      lastPush.current = now;
      api("/attention/update", { method: "POST", json: livePayload(m) }).catch(() => {});
    }
  }, [m, status, alarmOn]);

  async function onStart() {
    setSaved(null);
    setFinal(null);
    setFatigue(null);
    setErr("");
    startedAt.current = new Date().toISOString();
    await start();
  }

  async function onStop() {
    const f = stop();
    setFinal(f);
    if (f.elapsedSec < 3) return setErr("Session too short to save.");
    try {
      const s = await api("/attention/sessions", { method: "POST", json: sessionPayload(f, startedAt.current) });
      setSaved(s);
      setLast(s);
      setFatigue(await api("/ml/fatigue/me"));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rate(v) {
    if (!saved) return;
    setSaved(await api(`/attention/sessions/${saved.id}/feedback`, { method: "PATCH", json: { self_fatigue: v } }));
  }

  const running = status === "running";
  const shown = running ? m : (final ?? m);
  const state = running ? m.state : "No Face";
  return (
    <>
      <PageHead
        eyebrow="Computer vision · runs in your browser"
        title="Focus Monitor"
        highlight="Focus Monitor"
        sub="Look at the camera — focus %, distraction % and drowsiness are computed live on every frame. Video never leaves your device."
      />
      {running && m.alarm && (
        <div className="alarm-banner" role="alert">
          <span>🚨 Drowsiness alarm — look at the camera to stop it</span>
          <button className="btn ghost sm" style={{ color: "inherit" }} onClick={() => setAlarmOn((a) => !a)}>
            {alarmOn ? "🔇 Mute" : "🔔 Unmute"}
          </button>
        </div>
      )}
      <div className="grid split-3-2">
        <div>
          <div className="card feed">
            <div className="feed-head">
              <span className={`chip ${running ? "live" : ""}`}>
                <span className="dot" /> {running ? "Live feed" : "Camera off"}
              </span>
              <span className="chip">{running ? `${shown.fps.toFixed(1)} fps` : "— fps"}</span>
            </div>
            <div className="video-wrap">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} />
              {running && (
                <div className={`hud ${m.faceX < 0.5 ? "right" : ""}`} aria-hidden="true">
                  <span>EAR</span>
                  <b>{m.ear.toFixed(3)}</b>
                  <span>Blinks</span>
                  <b>{m.blinksPerMin}/min</b>
                  <span>Gaze</span>
                  <b>{m.gaze}</b>
                  <span>Yaw</span>
                  <b>{m.yaw}°</b>
                  <span>Pitch</span>
                  <b>{m.pitch}°</b>
                  <span>Roll</span>
                  <b>{m.roll}°</b>
                </div>
              )}
              {!running && (
                <div className="placeholder">
                  {status === "loading" ? (
                    <span>
                      <span className="spinner" style={{ display: "inline-block" }} /> Loading face model…
                    </span>
                  ) : (
                    "Press Start and allow camera access"
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            {running ? (
              <button className="btn danger" onClick={onStop}>
                ■ Stop &amp; save
              </button>
            ) : (
              <button className="btn" onClick={onStart} disabled={status === "loading"}>
                ▶ Start session
              </button>
            )}
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
              <input type="checkbox" checked={alarmOn} onChange={(e) => setAlarmOn(e.target.checked)} /> Drowsiness
              alarm
            </label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {err && <div className="alert error">{err}</div>}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="card state-card" style={{ "--state": STATE_COLORS[state] }}>
            <span className="emoji">{STATE_EMOJI[state]}</span>
            <div style={{ flex: 1 }}>
              <div className="name">{state}</div>
              <div className="small muted">Focus score {shown.focusPct.toFixed(0)}%</div>
              <div className="bar" style={{ marginTop: 6, height: 6 }}>
                <div style={{ width: `${shown.focusPct}%`, background: STATE_COLORS[state] }} />
              </div>
            </div>
          </div>
          <div className="tiles">
            <Metric v={shown.ear.toFixed(3)} l="Eye ratio" />
            <Metric v={shown.blinksPerMin} l="Blinks / min" />
            <Metric v={shown.gaze} l="Gaze" />
            <Metric v={shown.yawnsTotal} l="Yawns" />
          </div>
          <div className="card">
            <div className="card-title">Head pose</div>
            {[
              ["Yaw", shown.yaw, THRESHOLDS.yawLimit],
              ["Pitch", shown.pitch, THRESHOLDS.pitchLimit],
              ["Roll", shown.roll, THRESHOLDS.yawLimit],
            ].map(([k, v, limit]) => (
              <div key={k} className="pose">
                <span className="muted">{k}</span>
                <div className="track">
                  <div
                    className={`knob ${Math.abs(v) > limit ? "off" : ""}`}
                    style={{ left: `${50 + Math.max(-45, Math.min(45, v)) * (50 / 45)}%` }}
                  />
                </div>
                <b>{v.toFixed(1)}°</b>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Session summary</div>
            <div className="summary">
              <Donut
                label={`Focused ${shown.focusPct.toFixed(1)}%`}
                segments={[
                  ["Focused", shown.focusPct, STATE_COLORS.Focused],
                  ["Distracted", shown.distractedPct, STATE_COLORS.Distracted],
                  ["Drowsy", shown.drowsyPct, STATE_COLORS.Drowsy],
                  ["No Face", shown.noFacePct, STATE_COLORS["No Face"]],
                ]}
              />
              <div>
                <div className="timer">{fmt(shown.elapsedSec)}</div>
                <div className="legend">
                  {[
                    ["Focused", shown.focusPct],
                    ["Distracted", shown.distractedPct],
                    ["Drowsy", shown.drowsyPct],
                    ["No Face", shown.noFacePct],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <i style={{ background: STATE_COLORS[k] }} />
                      {k}
                      <b>{v.toFixed(1)}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saved && final && (
        <section style={{ marginTop: 26 }}>
          <div className="alert ok">✅ Saved as session #{saved.id} — see it in Analytics.</div>
          <div className="grid g3" style={{ alignItems: "start" }}>
            <div className="card" style={{ textAlign: "center" }}>
              <Gauge value={final.focusPct} label="Focus this session" />
            </div>
            <div>{fatigue && <RiskCard f={fatigue} />}</div>
            <div className="card">
              <h3>How tired do you actually feel?</h3>
              <p>Your answer becomes a training label for the fatigue model.</p>
              <div className="row" style={{ marginTop: 12 }}>
                {["😀 Fresh", "😐 A bit tired", "😫 Exhausted"].map((l, i) => (
                  <button
                    key={l}
                    className={`btn sm ${saved.self_fatigue === i ? "" : "ghost"}`}
                    onClick={() => rate(i)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                className="btn ghost sm"
                style={{ marginTop: 12 }}
                onClick={async () => {
                  await api(`/attention/sessions/${saved.id}`, { method: "DELETE" });
                  setSaved(null);
                  setFinal(null);
                  setFatigue(null);
                }}
              >
                🗑️ Delete this session
              </button>
            </div>
          </div>
        </section>
      )}
      {!running && !saved && last && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Last session · {toDate(last.started_at).toLocaleString()} · {(last.duration_sec / 60).toFixed(1)} min · 🎯{" "}
          {last.focus_pct.toFixed(0)}% focused · 👀 {last.distracted_pct.toFixed(0)}% distracted · 😴{" "}
          {last.drowsy_pct.toFixed(0)}% drowsy
        </p>
      )}
    </>
  );
}
