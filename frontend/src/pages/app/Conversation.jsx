import { useEffect, useState } from "react";
import { ConversationFeedback } from "@/components/ConversationFeedback";
import { PageHead } from "@/components/ui";
import { api, toDate } from "@/lib/api";
import { STATE_COLORS } from "@/lib/attention";
import { useFaceTracker } from "@/lib/useFaceTracker";
import { levelPct, useVoiceRecorder } from "@/lib/useVoiceRecorder";

const fmt = (s) => new Date(s * 1000).toISOString().slice(14, 19);

const MEASURES = [
  ["🌊", "Fluency", "fillers, pauses, pace and clear words"],
  ["💬", "Word confidence", "hedging vs. decisive wording"],
  ["👀", "Focus", "eye contact with the camera"],
  ["🤝", "Interaction", "questions, “you / we”, acknowledging"],
  ["🎚️", "Voice modulation", "pitch variety, volume, projection"],
];

export default function ConversationCoach() {
  const cam = useFaceTracker({ audio: true });
  const mic = useVoiceRecorder();
  const [types, setTypes] = useState([]);
  const [type, setType] = useState("interview");
  const [promptIdx, setPromptIdx] = useState(0);
  const [custom, setCustom] = useState("");
  const [useCamera, setUseCamera] = useState(true);
  const [whisper, setWhisper] = useState("small.en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api("/speech/conversation-types")
      .then(setTypes)
      .catch((e) => setErr(e.message));
    api("/speech/sessions/latest")
      .then((r) => r?.report?.conversation && setResult((cur) => cur ?? { report: r.report, when: r.created_at }))
      .catch(() => {});
  }, []);

  const current = types.find((t) => t.key === type);
  const prompt = custom.trim() || current?.prompts[promptIdx % current.prompts.length] || "";
  const recording = mic.recording;
  const m = cam.metrics;

  async function onStart() {
    setErr("");
    if (useCamera) {
      const media = await cam.start();
      if (media && !(await mic.begin(media))) cam.stop();
    } else {
      await mic.begin();
    }
  }

  async function onStop() {
    const take = await mic.finish();
    const final = useCamera ? cam.stop() : null;
    if (!take) return;
    if (take.seconds < 5) return setErr("Recording too short — speak for at least 5 seconds.");
    const form = new FormData();
    form.append("audio", take.blob, take.filename);
    form.append("mode", "conversation");
    form.append("prompt", `[${current?.label ?? type}] ${prompt}`);
    form.append("conversation_type", type);
    form.append("whisper_model", whisper);
    if (final) form.append("eye_contact", String(final.focusPct));
    setBusy(true);
    try {
      const r = await api("/speech/analyze", { method: "POST", body: form });
      setResult({ report: r.report, audioUrl: take.url, id: r.session_id });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Speech AI · conversation feedback"
        title="Conversation Coach"
        highlight="Conversation Coach"
        sub="Pick a conversation, record yourself and get a score for fluency, word confidence, focus, interaction and voice modulation — with what to improve and how."
      />

      <div className="type-grid" role="radiogroup" aria-label="Conversation type">
        {types.map((t) => (
          <button
            key={t.key}
            role="radio"
            aria-checked={t.key === type}
            className={`type-btn ${t.key === type ? "on" : ""}`}
            disabled={recording || busy}
            onClick={() => {
              setType(t.key);
              setPromptIdx(0);
            }}
          >
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid split-3-2">
        <div>
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--accent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div className="eyebrow">
                {current?.icon} {current?.label ?? "Loading…"} · scenario
              </div>
              <button
                className="btn ghost sm"
                disabled={recording || !!custom.trim()}
                onClick={() => setPromptIdx((i) => i + 1)}
              >
                🔀 New scenario
              </button>
            </div>
            <div style={{ fontSize: "1.15rem", marginTop: 6 }}>{prompt}</div>
            {current && (
              <div className="small muted" style={{ marginTop: 6 }}>
                Ideal pace for this conversation: {current.wpm[0]}–{current.wpm[1]} words/min · speak for 30–90 s
              </div>
            )}
          </div>

          <div className="card feed">
            <div className="feed-head">
              <span className={`chip ${recording ? "live" : ""}`}>
                <span className="dot" /> {recording ? `Recording ${fmt(mic.seconds)}` : "Ready"}
              </span>
              <span className="chip">{useCamera ? "🎥 Camera + 🎙️ mic" : "🎙️ Voice only"}</span>
            </div>
            {useCamera ? (
              <div className="video-wrap">
                <video ref={cam.videoRef} playsInline muted />
                <canvas ref={cam.canvasRef} />
                {cam.status !== "running" && (
                  <div className="placeholder">
                    {cam.status === "loading" ? "Starting camera…" : "Press Record and allow camera + microphone"}
                  </div>
                )}
              </div>
            ) : (
              <div className="voice-stage">
                <div className="voice-orb" style={{ "--lvl": recording ? levelPct(mic.level) / 100 : 0 }}>🎙️</div>
                <div className="muted small">{recording ? "Listening…" : "Press Record and allow the microphone"}</div>
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            {recording ? (
              <button className="btn danger" onClick={onStop}>
                ■ Stop &amp; analyse
              </button>
            ) : (
              <button className="btn" onClick={onStart} disabled={busy || !current || cam.status === "loading"}>
                ● Record
              </button>
            )}
          </div>
          {cam.error && <div className="alert error">{cam.error}</div>}
          {mic.error && <div className="alert error">{mic.error}</div>}
          {err && <div className="alert error">{err}</div>}
          {busy && (
            <div className="alert info">
              <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Transcribing
              and analysing your conversation… (the first run loads the speech model)
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="card">
            <label className="field">
              <span>Your own scenario (optional)</span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Ask my manager for a day off"
                disabled={recording}
              />
            </label>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={useCamera}
                onChange={(e) => setUseCamera(e.target.checked)}
                disabled={recording}
              />
              Use camera to measure focus (eye contact)
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Speech model</span>
              <select value={whisper} onChange={(e) => setWhisper(e.target.value)} disabled={recording}>
                <option value="small.en">small.en — accurate (recommended)</option>
                <option value="base.en">base.en — fastest</option>
                <option value="medium.en">medium.en — most accurate, slower</option>
              </select>
            </label>
          </div>

          {recording ? (
            <div className="card">
              <div className="card-title">Live</div>
              <div className="timer">{fmt(mic.seconds)}</div>
              <div className="small" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>🎙️ Mic level</span>
                <b>{mic.level.toFixed(0)} dB</b>
              </div>
              <div className="bar" style={{ margin: "6px 0 12px" }}>
                <div style={{ width: `${levelPct(mic.level)}%`, background: "var(--grad)" }} />
              </div>
              {useCamera && (
                <>
                  <div className="small" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>👀 Eye contact</span>
                    <b>{m.focusPct.toFixed(0)}%</b>
                  </div>
                  <div className="bar" style={{ margin: "6px 0 12px" }}>
                    <div style={{ width: `${m.focusPct}%`, background: STATE_COLORS[m.state] }} />
                  </div>
                </>
              )}
              <p className="small" style={{ margin: 0 }}>
                {useCamera && m.state !== "Focused"
                  ? "👉 Look at the camera lens while you speak."
                  : mic.seconds > 3 && mic.level < -50
                    ? "🔈 I can barely hear you — speak up or move closer."
                    : mic.seconds < 30
                      ? "✅ Good — keep going, aim for at least 30 seconds."
                      : "✅ Great length — press Stop & analyse when you're done."}
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="card-title">What you'll get</div>
              <div style={{ display: "grid", gap: 10 }}>
                {MEASURES.map(([icon, label, desc]) => (
                  <div key={label} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span>{icon}</span>
                    <span>
                      <b>{label}</b> <span className="small muted">— {desc}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="small" style={{ marginTop: 12 }}>
                Each area gets a % score, how much needs improvement, and suggestions for this type of conversation.
              </p>
            </div>
          )}
        </div>
      </div>

      {result && !recording && (
        <section style={{ marginTop: 26 }}>
          <p className="muted small">
            {result.when
              ? `Your last conversation analysis · ${toDate(result.when).toLocaleString()}`
              : `✅ Saved as speech session #${result.id} — see your progress in Analytics.`}
          </p>
          <ConversationFeedback report={result.report} audioUrl={result.audioUrl} />
        </section>
      )}
    </>
  );
}
