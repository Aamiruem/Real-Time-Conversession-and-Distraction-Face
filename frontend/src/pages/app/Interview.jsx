import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewFeedback } from "@/components/InterviewFeedback";
import { PageHead } from "@/components/ui";
import { api, cachedApi, toDate } from "@/lib/api";
import { loadBodyModels } from "@/lib/body";
import { cameraCheck } from "@/lib/presence";
import { loadFaceLandmarker, useFaceTracker } from "@/lib/useFaceTracker";
import { useVoiceCommands } from "@/lib/useVoiceCommands";
import { levelPct, useVoiceRecorder } from "@/lib/useVoiceRecorder";

const TABS = [
  ["mock", "🎬 Mock interview"],
  ["guide", "📘 Prep guide"],
  ["bank", "❓ Question bank"],
  ["vocab", "📖 Vocabulary & voice"],
];
const SHORTCUTS = [
  ["R", "record / stop"],
  ["N", "next question"],
  ["H", "hints"],
  ["C", "camera on / off"],
  ["V", "voice commands"],
  ["1–4", "sections"],
];
const VOICE_EXAMPLES = "“start recording”, “stop recording”, “next question”, “show hints”, “camera check”, “question bank”";
const fmt = (s) => new Date(s * 1000).toISOString().slice(14, 19);

function QuestionDetails({ q, frameworks }) {
  const fw = frameworks?.[q.framework];
  return (
    <div className="iv-qdetails">
      <p>
        <b>They look for:</b> {q.looks_for}
      </p>
      {fw && (
        <div className="tags" style={{ margin: "8px 0" }}>
          {fw.steps.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      <div className="grid g2" style={{ gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            Answer outline
          </div>
          <ol className="suggestions">
            {q.outline.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </div>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            Avoid
          </div>
          <ul className="suggestions" style={{ paddingLeft: 18 }}>
            {q.pitfalls.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function InterviewPrep() {
  const cam = useFaceTracker({ audio: true, presence: true, body: true });
  const mic = useVoiceRecorder();
  const [tab, setTab] = useState("mock");
  const [fields, setFields] = useState([]);
  const [field, setField] = useState("general");
  const [questions, setQuestions] = useState([]);
  const [qid, setQid] = useState("g-about");
  const [guide, setGuide] = useState(null);
  const [hints, setHints] = useState(false);
  const [whisper, setWhisper] = useState("base.en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    // deep links from the command palette: /app/interview?tab=bank
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (TABS.some(([k]) => k === t)) setTab(t);
    // recommendations link to a question: ?q=g-weakness (general) or ?q=sales-0 (role-specific → that field)
    const q = params.get("q");
    if (q) {
      if (!q.startsWith("g-")) setField(q.slice(0, q.lastIndexOf("-")));
      setQid(q);
    }
    const onTab = (e) => TABS.some(([k]) => k === e.detail) && setTab(e.detail);
    window.addEventListener("presence:tab", onTab);
    cachedApi("/interview/fields", 600_000).then(setFields).catch((e) => setErr(e.message));
    cachedApi("/interview/guide", 600_000).then(setGuide).catch(() => {});
    // warm up the camera AI while you read the question, so "Camera check" starts almost instantly
    const warm = () => loadFaceLandmarker().then(() => loadBodyModels()).catch(() => {});
    const idle = window.requestIdleCallback ? window.requestIdleCallback(warm) : window.setTimeout(warm, 1500);
    api("/speech/sessions/latest")
      .then((r) => r?.report?.interview && setResult((cur) => cur ?? { report: r.report, when: r.created_at }))
      .catch(() => {});
    return () => {
      window.removeEventListener("presence:tab", onTab);
      (window.cancelIdleCallback ?? window.clearTimeout)(idle);
    };
  }, []);
  useEffect(() => {
    cachedApi(`/interview/questions?field=${field}`, 600_000)
      .then((qs) => {
        setQuestions(qs);
        setQid((cur) => (qs.some((q) => q.id === cur) ? cur : qs[0]?.id));
      })
      .catch((e) => setErr(e.message));
  }, [field]);

  const q = questions.find((x) => x.id === qid);
  const f = fields.find((x) => x.key === field);
  const camOn = cam.status === "running";
  const recording = mic.recording;
  const m = cam.metrics;
  const live = cam.presence.current?.live;
  const bodyLive = cam.body.current?.live;
  const categories = useMemo(() => [...new Set(questions.map((x) => x.category))], [questions]);

  function practise(id) {
    setQid(id);
    setTab("mock");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function nextQuestion() {
    const i = questions.findIndex((x) => x.id === qid);
    setQid(questions[(i + 1) % questions.length].id);
    setHints(false);
  }

  async function onRecord() {
    setErr("");
    let media = cam.stream.current;
    if (!camOn) media = await cam.start();
    if (!media) return;
    // measure only this answer: restart the attention + presence statistics
    cam.engine.current.reset();
    cam.presence.current.reset();
    cam.body.current.reset();
    await mic.begin(media);
  }

  async function onStop() {
    const take = await mic.finish();
    if (!take) return;
    const eye = cam.engine.current.metrics().focusPct;
    const presence = { ...cam.presence.current.summary(eye), ...cam.body.current.summary() };
    if (take.seconds < 8) return setErr("Answer too short — speak for at least 8 seconds (aim for 45–120).");
    const form = new FormData();
    form.append("audio", take.blob, take.filename);
    form.append("question_id", qid);
    form.append("field", field);
    form.append("presence", JSON.stringify(presence));
    form.append("whisper_model", whisper);
    setBusy(true);
    try {
      const r = await api("/interview/answer", { method: "POST", body: form });
      setResult({ report: r.report, audioUrl: take.url, id: r.session_id });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function randomQuestion() {
    if (questions.length) setQid(questions[Math.floor(Math.random() * questions.length)].id);
    setHints(false);
  }

  // one place for every action: buttons, keyboard shortcuts and voice commands all call run()
  function run(intent) {
    if (busy) return;
    const tabs = { mock: "mock", guide: "guide", bank: "bank", vocab: "vocab" };
    if (tabs[intent]) return setTab(tabs[intent]);
    if (intent === "record" && !recording && q) return onRecord();
    if (intent === "stop" && recording) return onStop();
    if (intent === "toggleRecord") return recording ? onStop() : q && onRecord();
    if (recording) return; // nothing else changes mid-answer
    if (intent === "next") return nextQuestion();
    if (intent === "random") return randomQuestion();
    if (intent === "hints") return setHints(true);
    if (intent === "hideHints") return setHints(false);
    if (intent === "toggleHints") return setHints((h) => !h);
    if (intent === "camera" && !camOn) return cam.start();
    if (intent === "cameraOff" && camOn) return cam.stop();
    if (intent === "toggleCamera") return camOn ? cam.stop() : cam.start();
  }
  const runRef = useRef(run);
  runRef.current = run;
  const voice = useVoiceCommands((intent) => runRef.current(intent), { recording });

  useEffect(() => {
    const keys = { r: "toggleRecord", n: "next", h: "toggleHints", c: "toggleCamera", 1: "mock", 2: "guide", 3: "bank", 4: "vocab" };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "v") return voice.toggle();
      if (k === "?") return setShowKeys((v) => !v);
      if (keys[k]) {
        e.preventDefault();
        runRef.current(keys[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voice.toggle]);

  const fieldPicker = (
    <label className="field" style={{ marginBottom: 0, minWidth: 0 }}>
      <span>Job field</span>
      <select value={field} onChange={(e) => setField(e.target.value)} disabled={recording}>
        {fields.map((x) => (
          <option key={x.key} value={x.key}>
            {x.icon} {x.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHead
        eyebrow="AI interview coach · any field"
        title="Interview Prep"
        highlight="Interview Prep"
        sub="Practise real interview questions on camera. AI scores your answer's content, your delivery and your on-camera presence — and the guide covers everything from getting the interview to the follow-up email."
      />
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="cmd-bar" role="toolbar" aria-label="Interview commands">
        <button className={`cmd ${camOn ? "on" : ""}`} onClick={() => run("toggleCamera")} disabled={recording || busy || cam.status === "loading"} title="Camera on / off (C)">
          📷 <span>{camOn ? "Camera off" : "Camera check"}</span>
        </button>
        <button className={`cmd primary ${recording ? "rec" : ""}`} onClick={() => run("toggleRecord")} disabled={busy || !q || cam.status === "loading"} title="Record / stop (R)">
          {recording ? "■" : "●"} <span>{recording ? `Stop · ${fmt(mic.seconds)}` : "Record answer"}</span>
        </button>
        <button className="cmd" onClick={() => run("next")} disabled={recording || !questions.length} title="Next question (N)">
          ⏭️ <span>Next</span>
        </button>
        <button className="cmd" onClick={() => run("random")} disabled={recording || !questions.length} title="Random question">
          🔀 <span>Random</span>
        </button>
        <button className={`cmd ${hints ? "on" : ""}`} onClick={() => { setTab("mock"); run("toggleHints"); }} disabled={recording || !q} title="Hints (H)">
          💡 <span>Hints</span>
        </button>
        <span className="cmd-sep" />
        {voice.supported && (
          <button className={`cmd ${voice.enabled ? "on listening" : ""}`} onClick={voice.toggle} title="Voice commands (V)">
            🎙️ <span>{voice.enabled ? "Listening…" : "Voice commands"}</span>
          </button>
        )}
        <button className={`cmd ${showKeys ? "on" : ""}`} onClick={() => setShowKeys((v) => !v)} title="Keyboard shortcuts (?)">
          ⌨️ <span>Shortcuts</span>
        </button>
      </div>
      {(showKeys || voice.enabled) && (
        <div className="cmd-help">
          {showKeys && (
            <div className="tags">
              {SHORTCUTS.map(([k, label]) => (
                <span key={k}>
                  <kbd>{k}</kbd> {label}
                </span>
              ))}
            </div>
          )}
          {voice.enabled && (
            <p className="small">
              🎙️ Say {VOICE_EXAMPLES}. While you answer, only “stop recording” counts.{" "}
              {voice.heard && <b>Heard: {voice.heard}</b>}
              <span className="muted"> Voice commands use your browser's speech recognition service.</span>
            </p>
          )}
        </div>
      )}

      {tab === "mock" && (
        <>
          <div className="grid split-3-2">
            <div>
              <div className="card iv-question">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="status-chip">{q?.category ?? "…"}</span>
                  {q && <span className="status-chip" style={{ "--area": "#a78bfa" }}>{guide?.frameworks[q.framework]?.label}</span>}
                </div>
                <h2>{q?.q ?? "Loading questions…"}</h2>
                {hints && q && <QuestionDetails q={q} frameworks={guide?.frameworks} />}
              </div>

              <div className="card feed">
                <div className="feed-head">
                  <span className={`chip ${recording ? "live" : ""}`}>
                    <span className="dot" /> {recording ? `Answering ${fmt(mic.seconds)}` : camOn ? "Camera on" : "Camera off"}
                  </span>
                  <span className="chip">
                    {camOn ? `${m.fps.toFixed(0)} fps · ${cam.videoRef.current?.videoHeight ?? 0}p` : "HD camera"}
                  </span>
                </div>
                <div className="video-wrap">
                  <video ref={cam.videoRef} playsInline muted />
                  <canvas ref={cam.canvasRef} />
                  {camOn && live && (
                    <div className={`hud ${m.faceX < 0.5 ? "right" : ""}`} aria-hidden="true">
                      <span>Eye contact</span>
                      <b>{m.focusPct.toFixed(0)}%</b>
                      <span>Smile</span>
                      <b>{live.smiling ? "yes 😊" : "neutral"}</b>
                      <span>Light</span>
                      <b>{live.brightness.toFixed(0)}</b>
                      <span>Tilt</span>
                      <b>{Math.abs(m.roll).toFixed(0)}°</b>
                    </div>
                  )}
                  {!camOn && (
                    <div className="placeholder">
                      {cam.status === "loading" ? "Starting camera…" : "Start the camera check, then record your answer"}
                    </div>
                  )}
                </div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                {recording ? (
                  <button className="btn danger" onClick={onStop}>
                    ■ Stop &amp; get feedback
                  </button>
                ) : (
                  <>
                    {!camOn && (
                      <button className="btn ghost" onClick={() => cam.start()} disabled={cam.status === "loading" || busy}>
                        📷 Camera check
                      </button>
                    )}
                    <button className="btn" onClick={onRecord} disabled={busy || !q || cam.status === "loading"}>
                      ● Record answer
                    </button>
                    {camOn && (
                      <button className="btn ghost" style={{ flex: "none" }} onClick={() => cam.stop()} disabled={busy}>
                        Camera off
                      </button>
                    )}
                  </>
                )}
              </div>
              {cam.error && <div className="alert error">{cam.error}</div>}
              {mic.error && <div className="alert error">{mic.error}</div>}
              {err && <div className="alert error">{err}</div>}
              {busy && (
                <div className="alert info">
                  <span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} /> Analysing
                  your answer — transcript, content, delivery and presence…
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <div className="card">
                <div style={{ display: "grid", gap: 12 }}>
                  {fieldPicker}
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span>Question</span>
                    <select value={qid} onChange={(e) => setQid(e.target.value)} disabled={recording}>
                      {categories.map((c) => (
                        <optgroup key={c} label={c}>
                          {questions
                            .filter((x) => x.category === c)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.q.length > 60 ? x.q.slice(0, 58) + "…" : x.q}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field" style={{ margin: "12px 0 0" }}>
                  <span>Speech model</span>
                  <select value={whisper} onChange={(e) => setWhisper(e.target.value)} disabled={recording}>
                    <option value="base.en">base.en — fast (installed)</option>
                    <option value="small.en">small.en — more accurate (~480 MB download)</option>
                    <option value="medium.en">medium.en — most accurate, slower (~1.5 GB)</option>
                  </select>
                </label>
              </div>

              {recording ? (
                <div className="card">
                  <div className="card-title">Live</div>
                  <div className="timer">{fmt(mic.seconds)}</div>
                  <div className="small" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>🎙️ Voice</span>
                    <b>{mic.level.toFixed(0)} dB</b>
                  </div>
                  <div className="bar" style={{ margin: "6px 0 12px" }}>
                    <div style={{ width: `${levelPct(mic.level)}%`, background: "var(--grad)" }} />
                  </div>
                  <p className="small" style={{ margin: 0 }}>
                    {m.state !== "Focused"
                      ? "👉 Look at the camera lens."
                      : mic.seconds > 3 && mic.level < -50
                        ? "🔈 Speak up a little."
                        : mic.seconds < 45
                          ? "✅ Good — give an example and a result (aim for 45–120 s)."
                          : mic.seconds > 120
                            ? "⏱️ Wrap up with your result."
                            : "✅ Great length — finish with your result and stop."}
                  </p>
                </div>
              ) : camOn && live ? (
                <div className="card">
                  <div className="card-title">Camera check</div>
                  <div className="iv-check">
                    {cameraCheck(live, cam.videoRef.current?.videoHeight ?? 0).map(([icon, label, value, ok]) => (
                      <div key={label} className={ok ? "ok" : "warn"}>
                        <span>
                          {icon} {label}
                        </span>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                  <p className="small" style={{ marginTop: 10 }}>
                    Head and shoulders in frame, light in front of you, camera at eye level.
                  </p>
                </div>
              ) : (
                <div className="card">
                  <div className="card-title">Before you answer</div>
                  <ul className="suggestions" style={{ paddingLeft: 18 }}>
                    <li>Smile, take one breath, then start with a clear first sentence.</li>
                    <li>Look at the camera lens, not at yourself.</li>
                    <li>Structure: {q ? guide?.frameworks[q.framework]?.steps.map((s) => s.split(" —")[0]).join(" → ") : "…"}</li>
                    <li>45–120 seconds, finish with a result, then stop.</li>
                  </ul>
                </div>
              )}
              {camOn && bodyLive && (
                <div className="card">
                  <div className="card-title">Body language · live</div>
                  <div className="iv-check">
                    {[
                      ["🧍", "Posture", bodyLive.posture, bodyLive.posture === "Upright"],
                      ["📐", "Shoulders", `${bodyLive.tilt.toFixed(0)}° tilt`, bodyLive.tilt <= 8],
                      ["✋", "Hands", bodyLive.touching ? "touching face" : bodyLive.hands, !bodyLive.touching && bodyLive.hands !== "hidden"],
                      ["👐", "Gestures", bodyLive.gesture, bodyLive.gesture === "natural"],
                      [
                        "📱",
                        "In frame",
                        [...bodyLive.objects, bodyLive.people > 1 ? `${bodyLive.people} people` : ""].filter(Boolean).join(", ") || "clear",
                        !bodyLive.objects.includes("cell phone") && bodyLive.people <= 1,
                      ],
                    ].map(([icon, label, value, ok]) => (
                      <div key={label} className={ok ? "ok" : "warn"}>
                        <span>
                          {icon} {label}
                        </span>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                  <p className="small" style={{ marginTop: 10 }}>
                    Sit back so your shoulders and hands are in view — open hand gestures at chest level look confident.
                  </p>
                </div>
              )}
              {f && (
                <div className="card">
                  <div className="card-title">
                    {f.icon} {f.label}
                  </div>
                  <p className="small">
                    <b>Dress:</b> {f.dress}
                  </p>
                  <div className="tags" style={{ marginTop: 8 }}>
                    {f.skills.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {result && !recording && (
            <section style={{ marginTop: 26 }}>
              <p className="muted small">
                {result.when
                  ? `Your last mock-interview answer · ${toDate(result.when).toLocaleString()}`
                  : `✅ Saved as session #${result.id} — see your progress in Analytics.`}
              </p>
              <InterviewFeedback report={result.report} audioUrl={result.audioUrl} />
            </section>
          )}
        </>
      )}

      {tab === "guide" && guide && (
        <>
          {f && (
            <div className="card iv-field">
              <div style={{ maxWidth: 320 }}>{fieldPicker}</div>
              <div>
                <div className="card-title">👔 Dress code</div>
                <p className="small">{f.dress}</p>
              </div>
              <div>
                <div className="card-title">🎯 Skills they test</div>
                <div className="tags">
                  {f.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="iv-guide">
            {guide.sections.map((s) => (
              <article key={s.id} className="card">
                <h3>
                  {s.icon} {s.title}
                </h3>
                <p>{s.intro}</p>
                <ul className="suggestions" style={{ paddingLeft: 18, marginTop: 10 }}>
                  {s.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "bank" && (
        <>
          <div className="card" style={{ marginBottom: 16, maxWidth: 420 }}>
            {fieldPicker}
          </div>
          {categories.map((c) => (
            <section key={c} style={{ marginBottom: 18 }}>
              <h3 className="iv-cat">{c}</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {questions
                  .filter((x) => x.category === c)
                  .map((x) => (
                    <details key={x.id} className="card iv-bank">
                      <summary>
                        <span>{x.q}</span>
                        <span className="status-chip" style={{ "--area": "#a78bfa" }}>
                          {guide?.frameworks[x.framework]?.label}
                        </span>
                      </summary>
                      <QuestionDetails q={x} frameworks={guide?.frameworks} />
                      <button className="btn sm" style={{ marginTop: 12 }} onClick={() => practise(x.id)}>
                        🎬 Practise this question
                      </button>
                    </details>
                  ))}
              </div>
            </section>
          ))}
        </>
      )}

      {tab === "vocab" && guide && (
        <div className="grid split-3-2" style={{ alignItems: "start" }}>
          <div className="card">
            <h3>🔁 Say this, not that</h3>
            <table className="swaps">
              <thead>
                <tr>
                  <th>Weak</th>
                  <th>Strong</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {guide.word_swaps.map((s) => (
                  <tr key={s.weak}>
                    <td>
                      <s>{s.weak}</s>
                    </td>
                    <td>{s.strong}</td>
                    <td className="muted">{s.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="card">
              <h3>💪 Power verbs</h3>
              <div className="tags">
                {[...new Set([...(f?.power_words ?? []), ...guide.power_verbs])].slice(0, 36).map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
            </div>
            {guide.sections
              .filter((s) => s.id === "voice" || s.id === "answer")
              .map((s) => (
                <div key={s.id} className="card">
                  <h3>
                    {s.icon} {s.title}
                  </h3>
                  <ul className="suggestions" style={{ paddingLeft: 18 }}>
                    {s.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
