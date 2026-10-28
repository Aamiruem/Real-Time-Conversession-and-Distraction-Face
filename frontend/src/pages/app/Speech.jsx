import { useEffect, useState } from "react";
import { PageHead, SpeechResult, StateBadge } from "@/components/ui";
import { api, toDate } from "@/lib/api";
import { useFaceTracker } from "@/lib/useFaceTracker";
import { levelPct, useVoiceRecorder } from "@/lib/useVoiceRecorder";

const TOPICS = [
  "Introduce yourself as if you were starting a job interview.",
  "Describe a project you are proud of and the hardest problem you solved in it.",
  "Convince your team to adopt an idea you believe in.",
  "Explain what you do to a 10-year-old.",
  "Tell a story about a time you failed and what you learned.",
  "Pitch a product you use every day in 60 seconds.",
];
const PASSAGES = [
  "The quick brown fox jumps over the lazy dog. She sells sea shells by the sea shore.",
  "Thank you all for coming today. I am confident that this plan will help our team deliver better results, faster and with fewer mistakes.",
  "Peter Piper picked a peck of pickled peppers. Red lorry, yellow lorry. Unique New York.",
  "Particularly, the specific statistics show a significant improvement in the thoroughness of our research.",
];

export default function SpeechCoach() {
  const { videoRef, canvasRef, metrics: m, status, error, start, stop } = useFaceTracker({ audio: true });
  const [mode, setMode] = useState("free");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [custom, setCustom] = useState("");
  const [passage, setPassage] = useState(PASSAGES[0]);
  const [whisper, setWhisper] = useState("small.en");
  const { level, seconds, error: recError, begin, finish } = useVoiceRecorder();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const prompt = mode === "free" ? custom.trim() || topic : passage;

  useEffect(() => {
    api("/speech/sessions/latest")
      .then((r) => r?.report && setResult((cur) => cur ?? { report: r.report, when: r.created_at, id: r.id }))
      .catch(() => {});
  }, []);

  async function onStart() {
    setErr("");
    const media = await start();
    if (media && !(await begin(media))) stop();
  }

  async function onStop() {
    const take = await finish();
    const final = stop();
    if (!take) return;
    if (take.seconds < 4) return setErr("Recording too short — speak for at least 4 seconds.");
    const form = new FormData();
    form.append("audio", take.blob, take.filename);
    form.append("mode", mode);
    form.append("prompt", prompt);
    form.append("eye_contact", String(final.focusPct));
    form.append("whisper_model", whisper);
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

  const running = status === "running";
  return (
    <>
      <PageHead
        eyebrow="Speech AI"
        title="Speech Coach"
        highlight="Speech Coach"
        sub="Speak to the camera. You get a confidence score from your voice, words and eye contact — plus pronunciation feedback and a better way to say it."
      />
      <div className="grid split-3-2">
        <div>
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--accent)" }}>
            <div className="eyebrow">{mode === "free" ? "Talk about" : "Read this aloud, clearly"}</div>
            <div style={{ fontSize: "1.1rem", marginTop: 4 }}>{prompt}</div>
          </div>
          <div className="video-wrap">
            <video ref={videoRef} playsInline muted />
            <canvas ref={canvasRef} />
            {!running && (
              <div className="placeholder">
                {status === "loading" ? "Loading…" : "Press Record and allow camera + microphone"}
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {running ? (
              <button className="btn danger" onClick={onStop}>
                ■ Stop &amp; analyse
              </button>
            ) : (
              <button className="btn" onClick={onStart} disabled={busy || status === "loading"}>
                ● Record
              </button>
            )}
          </div>
          {error && <div className="alert error">{error}</div>}
          {recError && <div className="alert error">{recError}</div>}
          {err && <div className="alert error">{err}</div>}
          {busy && (
            <div className="alert info">
              <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Transcribing and
              analysing… (the first run loads the speech model)
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="card">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={mode === "free" ? "on" : ""} onClick={() => setMode("free")} disabled={running}>
                🎤 Free talk
              </button>
              <button className={mode === "read" ? "on" : ""} onClick={() => setMode("read")} disabled={running}>
                📖 Read aloud
              </button>
            </div>
            {mode === "free" ? (
              <>
                <button
                  className="btn ghost sm"
                  onClick={() => setTopic(TOPICS[(TOPICS.indexOf(topic) + 1) % TOPICS.length])}
                >
                  🔀 New topic
                </button>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>…or your own topic</span>
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="e.g. Why should we hire you?"
                  />
                </label>
              </>
            ) : (
              <label className="field">
                <span>Passage</span>
                <select value={passage} onChange={(e) => setPassage(e.target.value)}>
                  {PASSAGES.map((p) => (
                    <option key={p} value={p}>
                      {p.slice(0, 48)}…
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Speech model</span>
              <select value={whisper} onChange={(e) => setWhisper(e.target.value)}>
                <option value="small.en">small.en — accurate (recommended)</option>
                <option value="base.en">base.en — fastest</option>
                <option value="medium.en">medium.en — most accurate, slower</option>
              </select>
            </label>
          </div>
          {running && (
            <>
              <StateBadge state={m.state} focus={m.focusPct} />
              <div className="card">
                <div className="small">
                  🎙️ Mic level {level.toFixed(0)} dB · ⏺️ {seconds.toFixed(0)} s · 👀 eye contact{" "}
                  {m.focusPct.toFixed(0)}%
                </div>
                <div className="bar" style={{ marginTop: 8 }}>
                  <div
                    style={{
                      width: `${levelPct(level)}%`,
                      background: "var(--grad)",
                    }}
                  />
                </div>
                <p className="small" style={{ marginTop: 8 }}>
                  {m.state !== "Focused"
                    ? "👉 Look at the camera lens while you speak."
                    : seconds > 3 && level < -50
                      ? "🔈 I can barely hear you — speak up."
                      : "✅ Good — keep going."}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {result && !running && (
        <section style={{ marginTop: 26 }}>
          <p className="muted small">
            {result.when
              ? `Your last analysis · ${toDate(result.when).toLocaleString()}`
              : `✅ Saved as speech session #${result.id} — see your progress in Analytics.`}
          </p>
          <SpeechResult r={result.report} audioUrl={result.audioUrl} />
        </section>
      )}
    </>
  );
}
