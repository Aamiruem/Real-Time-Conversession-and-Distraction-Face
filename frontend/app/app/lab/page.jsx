"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Metric, PageHead, RiskCard, SpeechResult } from "@/components/ui";
import { api } from "@/lib/api";
import { AttentionEngine, LEFT_EYE, RIGHT_EYE, THRESHOLDS } from "@/lib/attention";
import { loadFaceLandmarker } from "@/lib/useFaceTracker";

const AXIS = { stroke: "#64748b", fontSize: 12 };
const TT = { contentStyle: { background: "#111a2e", border: "1px solid #1e2a44", borderRadius: 10 } };

/* ---------------------------------------------------------------- computer vision on a photo */
function VisionLab() {
  const img = useRef(null);
  const canvas = useRef(null);
  const [src, setSrc] = useState("");
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function analyse() {
    const el = img.current;
    if (!el) return;
    setBusy(true);
    setErr("");
    try {
      const lmk = await loadFaceLandmarker();
      const res = lmk.detectForVideo(el, performance.now());
      const engine = new AttentionEngine();
      const lm = res.faceLandmarks?.[0];
      engine.update(lm, res.facialTransformationMatrixes?.[0]?.data, el.naturalWidth, el.naturalHeight);
      setM(engine.metrics());
      const c = canvas.current;
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(el, 0, 0);
      if (lm) {
        ctx.fillStyle = "#38bdf8";
        lm.forEach((p, i) => {
          ctx.fillStyle =
            LEFT_EYE.includes(i) || RIGHT_EYE.includes(i) ? "#4ade80" : i >= 468 ? "#f472b6" : "#38bdf866";
          ctx.fillRect(p.x * c.width - 1, p.y * c.height - 1, 2.5, 2.5);
        });
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const t = THRESHOLDS;
  const closed = m && m.ear < t.earClosed;
  const away = m && (Math.abs(m.yaw) > t.yawLimit || Math.abs(m.pitch) > t.pitchLimit || m.gaze !== "center");
  return (
    <div>
      <p className="muted">
        <b>Pipeline:</b> image → MediaPipe Face Landmarker (478 landmarks incl. iris, 3-D face transform) → eye aspect
        ratio, mouth ratio, head pose, iris gaze → attention verdict. Runs fully in your browser.
      </p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setM(null);
            setSrc(URL.createObjectURL(f));
          }
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img ref={img} src={src} alt="" style={{ display: "none" }} onLoad={analyse} />}
      {busy && <p className="muted">Analysing…</p>}
      {err && <div className="alert error">{err}</div>}
      <div className="grid g2" style={{ marginTop: 14, alignItems: "start" }}>
        <canvas ref={canvas} style={{ width: "100%", borderRadius: 14, display: src ? "block" : "none" }} />
        {m &&
          (m.state === "No Face" ? (
            <div className="alert error">No face found — try a well-lit, front-facing photo.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0 }}>{closed ? "😴 Eyes closed" : away ? "👀 Looking away" : "🎯 Attentive"}</h3>
              <div className="grid g2">
                <Metric v={m.ear.toFixed(3)} l={`Eye ratio (closed < ${t.earClosed})`} />
                <Metric v={m.mar.toFixed(2)} l={`Mouth ratio (yawn > ${t.marYawn})`} />
                <Metric v={`${m.yaw}°`} l={`Yaw (±${t.yawLimit})`} />
                <Metric v={`${m.pitch}°`} l={`Pitch (±${t.pitchLimit})`} />
                <Metric v={m.gaze} l="Iris gaze" />
                <Metric v={`${m.roll}°`} l="Roll" />
              </div>
              <p className="small muted">
                Live, these per-frame values are tracked over time: eyes closed &gt; 1.2 s = drowsy, looking away &gt;
                1.5 s = distracted.
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- NLP */

function NlpLab() {
  const [text, setText] = useState(
    "I think maybe we could sort of try the new plan, sorry if it's a bad idea. I will prepare the report by Friday and I recommend we test it with five users first. The last release was great!",
  );
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  return (
    <div>
      <p className="muted">
        <b>Pipeline:</b> text → VADER sentiment (or Amazon Comprehend) → toxicity lexicon → keyword extraction → hedging
        vs. assertive phrasing → extractive summary.
      </p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="btn"
        style={{ marginTop: 10 }}
        onClick={() =>
          api("/nlp/analyze", { method: "POST", json: { text } })
            .then(setR)
            .catch((e) => setErr(e.message))
        }
      >
        Analyse text
      </button>
      {err && <div className="alert error">{err}</div>}
      {r && (
        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          <div className="grid g4">
            <Metric
              v={`${{ positive: "😊", negative: "😟", neutral: "😐" }[r.sentiment_label]} ${r.sentiment_label}`}
              l={`Sentiment (${r.sentiment_score.toFixed(2)})`}
            />
            <Metric v={`${r.confidence.toFixed(0)}%`} l="Wording confidence" />
            <Metric v={r.is_toxic ? "⚠️ yes" : "✅ no"} l="Toxic language" />
            <Metric v={`${r.words} / ${r.sentences}`} l="Words / sentences" />
          </div>
          <div className="grid g2">
            <div className="card">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    ["negative", r.sentiment_detail.neg],
                    ["neutral", r.sentiment_detail.neu],
                    ["positive", r.sentiment_detail.pos],
                  ].map(([k, v]) => ({ k, v }))}
                >
                  <XAxis dataKey="k" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip {...TT} />
                  <Bar dataKey="v" name="share">
                    {["#ef4444", "#94a3b8", "#22c55e"].map((c) => (
                      <Cell key={c} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{ display: "grid", gap: 8 }}>
              <p>
                <b>🔑 Keywords:</b>{" "}
                {r.keywords.map((k) => (
                  <span key={k} className="pill" style={{ marginRight: 4 }}>
                    {k}
                  </span>
                ))}
              </p>
              <p>
                <b>🫣 Hedges:</b> {r.hedges.join(", ") || "none"}
              </p>
              <p>
                <b>💪 Assertive:</b> {r.assertive.join(", ") || "none"}
              </p>
              {r.toxic_words.length > 0 && (
                <p>
                  <b>⚠️ Flagged:</b> {r.toxic_words.join(", ")}
                </p>
              )}
              <p>
                <b>📝 Summary:</b> {r.summary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- speech upload */
function SpeechLab() {
  const [file, setFile] = useState(null);
  const [passage, setPassage] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState(null);
  const [err, setErr] = useState("");
  async function go() {
    if (!file) return;
    const form = new FormData();
    form.append("audio", file);
    form.append("mode", passage.trim() ? "read" : "free");
    form.append("prompt", passage.trim());
    form.append("save", "false");
    setBusy(true);
    setErr("");
    setR(null);
    try {
      setR((await api("/speech/analyze", { method: "POST", body: form })).report);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="muted">
        <b>Pipeline:</b> audio → faster-whisper speech-to-text (word timings + probabilities) → pace, fillers, pauses,
        clarity → pitch &amp; loudness from the raw signal → confidence score + tips.
      </p>
      <input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <label className="field" style={{ marginTop: 10 }}>
        <span>Optional: the text you read aloud (enables pronunciation accuracy)</span>
        <input value={passage} onChange={(e) => setPassage(e.target.value)} />
      </label>
      <button className="btn" disabled={!file || busy} onClick={go}>
        {busy ? "Analysing…" : "Analyse speech"}
      </button>
      {err && <div className="alert error">{err}</div>}
      {r && (
        <div style={{ marginTop: 16 }}>
          <SpeechResult r={r} audioUrl={file ? URL.createObjectURL(file) : undefined} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- machine learning */

const SLIDERS = [
  ["duration_min", "Session length (min)", 5, 240, 1, 60],
  ["hour", "Start hour", 0, 23, 1, 21],
  ["focus_pct", "Focused %", 0, 100, 1, 60],
  ["distracted_pct", "Distracted %", 0, 100, 1, 20],
  ["drowsy_pct", "Drowsy %", 0, 60, 1, 12],
  ["no_face_pct", "Away %", 0, 40, 1, 8],
  ["blinks_per_min", "Blinks / min", 3, 50, 1, 22],
  ["yawns_per_10min", "Yawns / 10 min", 0, 10, 0.5, 1.5],
  ["avg_ear", "Eye openness (EAR)", 0.15, 0.4, 0.01, 0.26],
];
const SHORT = { logistic_regression: "LogReg", random_forest: "RandomForest", gradient_boosting: "GradBoost" };

function MlLab() {
  const [card, setCard] = useState(null);
  const [feats, setFeats] = useState(Object.fromEntries(SLIDERS.map((s) => [s[0], s[5]])));
  const [pred, setPred] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/ml/model")
      .then(setCard)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="alert error">{err}</div>;
  if (!card) return <p className="muted">Loading model card…</p>;
  const max = Math.max(...card.test.confusion_matrix.flat());
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="muted">
        <b>{card.name}</b> — {card.task}.
      </p>
      <div className="grid g4">
        <Metric v={SHORT[card.algorithm] ?? card.algorithm} l="Selected algorithm" />
        <Metric v={`${(card.test.accuracy * 100).toFixed(0)}%`} l="Test accuracy" />
        <Metric v={card.test.f1_macro.toFixed(2)} l="Test F1 (macro)" />
        <Metric v={card.data.rows.toLocaleString()} l={`Rows (${card.data.user_labelled} user-labelled)`} />
      </div>
      <div className="grid g3">
        <div className="card">
          <h3>Model selection (5-fold CV F1)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={Object.entries(card.cv_f1_macro).map(([k, v]) => ({ k: SHORT[k] ?? k, v }))}>
              <XAxis dataKey="k" {...AXIS} />
              <YAxis {...AXIS} domain={[0, 1]} />
              <Tooltip {...TT} />
              <Bar dataKey="v" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Permutation importance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart layout="vertical" data={Object.entries(card.feature_importance).map(([k, v]) => ({ k, v }))}>
              <CartesianGrid stroke="#1e2a44" />
              <XAxis type="number" {...AXIS} />
              <YAxis type="category" dataKey="k" width={110} {...AXIS} />
              <Tooltip {...TT} />
              <Bar dataKey="v" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Confusion matrix (rows = actual)</h3>
          <table className="t" style={{ textAlign: "center" }}>
            <thead>
              <tr>
                <th />{" "}
                {card.labels.map((l) => (
                  <th key={l}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.test.confusion_matrix.map((row, i) => (
                <tr key={i}>
                  <th>{card.labels[i]}</th>
                  {row.map((v, j) => (
                    <td
                      key={j}
                      style={{ background: `rgba(56,189,248,${(v / max) * 0.7})`, fontWeight: i === j ? 800 : 400 }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>🎛️ Try a prediction</h3>
        <div className="grid g3">
          {SLIDERS.map(([k, label, min, max, step]) => (
            <label key={k} className="field">
              <span>
                {label}: <b>{feats[k]}</b>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={feats[k]}
                onChange={(e) => setFeats({ ...feats, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <button
          className="btn"
          onClick={() =>
            api("/ml/predict", { method: "POST", json: feats })
              .then(setPred)
              .catch((e) => setErr(e.message))
          }
        >
          Predict fatigue risk
        </button>
        {pred && (
          <div className="grid g2" style={{ marginTop: 14 }}>
            <RiskCard f={pred} />
            <div className="card">
              <h3>Class probabilities</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(pred.probabilities).map(([k, v]) => ({ k, v }))}>
                  <XAxis dataKey="k" {...AXIS} />
                  <YAxis {...AXIS} domain={[0, 1]} />
                  <Tooltip {...TT} />
                  <Bar dataKey="v">
                    {["#22c55e", "#eab308", "#ef4444"].map((c) => (
                      <Cell key={c} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      <p className="small muted">
        Trained {card.trained_at} · {card.limitations} Retrain with <code>python -m ml.train --with-db</code>.
      </p>
    </div>
  );
}

const ARCH = [
  ["Computer vision", "MediaPipe Face Landmarker (WebAssembly, in-browser)", "frontend/lib/attention.js · backend/cv/"],
  ["NLP", "VADER / Amazon Comprehend, keyword + summary algorithms", "backend/nlp/text_analyzer.py"],
  ["Speech AI", "faster-whisper (CTranslate2), autocorrelation pitch tracking", "backend/speech/"],
  ["Machine learning", "scikit-learn model selection, model card, explanations", "backend/ml/"],
  ["Real time", "WebSockets (FastAPI) for rooms, getUserMedia + MediaRecorder", "backend/app/websocket_manager.py"],
  ["API & auth", "FastAPI, JWT, bcrypt, optional email + SMS OTP (AWS SES / SNS)", "backend/app/"],
  ["Data", "SQLAlchemy → SQLite (dev) / PostgreSQL on AWS RDS, reports on S3", "backend/app/models.py"],
  ["Frontend & SEO", "Next.js (React, server-rendered marketing pages, sitemap, JSON-LD)", "frontend/"],
  ["Deploy", "Docker, docker-compose, Nginx (HTTPS), EC2", "deploy/ · deploy/aws/"],
];

export default function Lab() {
  const [tab, setTab] = useState("cv");
  return (
    <>
      <PageHead
        eyebrow="Computer vision · NLP · Speech · Machine learning"
        title="AI Lab"
        highlight="AI Lab"
        sub="Each AI technology in FocusLink, isolated so you can try it and see what it outputs — from raw input to result."
      />
      <div className="tabs">
        {[
          ["cv", "🎥 Computer vision"],
          ["nlp", "💬 NLP"],
          ["speech", "🗣️ Speech AI"],
          ["ml", "🧠 Machine learning"],
          ["arch", "🏗️ Architecture"],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "cv" && <VisionLab />}
      {tab === "nlp" && <NlpLab />}
      {tab === "speech" && <SpeechLab />}
      {tab === "ml" && <MlLab />}
      {tab === "arch" && (
        <div className="card">
          <table className="t">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Technology</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {ARCH.map(([a, b, c]) => (
                <tr key={a}>
                  <td>
                    <b>{a}</b>
                  </td>
                  <td>{b}</td>
                  <td>
                    <code>{c}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 14 }}>
            Data flow: the browser runs face tracking locally and records audio → summaries and recordings go to the
            FastAPI backend → stored in PostgreSQL (RDS) and S3 → the ML model retrains from labelled sessions →
            predictions are served back through the API.
          </p>
        </div>
      )}
    </>
  );
}
