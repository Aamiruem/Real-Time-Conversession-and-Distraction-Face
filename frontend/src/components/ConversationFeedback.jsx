import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { Gauge, SpeechResult } from "./ui";

const ICONS = { fluency: "🌊", word_confidence: "💬", focus: "👀", interaction: "🤝", voice_modulation: "🎚️" };
// radar axis labels have little room, so they use one word each
const SHORT = {
  fluency: "Fluency",
  word_confidence: "Confidence",
  focus: "Focus",
  interaction: "Interaction",
  voice_modulation: "Modulation",
};
const STATUS = {
  Excellent: { color: "#22c55e", cls: "excellent" },
  Good: { color: "#38bdf8", cls: "good" },
  "Needs improvement": { color: "#eab308", cls: "improve" },
  Weak: { color: "#ef4444", cls: "weak" },
};

function AreaCard({ a, typeLabel }) {
  const st = STATUS[a.status] ?? STATUS.Good;
  return (
    <article className="card area" style={{ "--area": st.color }}>
      <header className="area-head">
        <span>
          {ICONS[a.key]} <b>{a.label}</b>
        </span>
        <span className="status-chip">{a.status}</span>
      </header>
      <div className="area-score">
        {a.score.toFixed(0)}
        <small>%</small>
      </div>
      <div className="split-bar" role="img" aria-label={`${a.score}% strong, ${a.needs_improvement}% needs improvement`}>
        <div style={{ width: `${a.score}%` }} />
      </div>
      <div className="split-legend">
        <span>✓ {a.score.toFixed(0)}% strong</span>
        <span>⚠ {a.needs_improvement.toFixed(0)}% needs improvement</span>
      </div>
      <ul className="evidence">
        {a.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <h4>How to improve</h4>
      <ol className="suggestions">
        {a.suggestions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {a.drill && <div className="drill">🏋️ {a.drill}</div>}
      <footer className="small muted">
        Counts {a.weight}% of your score for {typeLabel.toLowerCase()}
      </footer>
    </article>
  );
}

/** Five-area conversation feedback for a speech report that has `report.conversation`. */
export function ConversationFeedback({ report, audioUrl }) {
  const c = report.conversation;
  if (!c) return <SpeechResult r={report} audioUrl={audioUrl} />;
  const best = c.areas.find((a) => a.key === c.best_area);
  const worst = c.areas.find((a) => a.key === c.focus_area);
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="card conv-hero">
        <div style={{ textAlign: "center" }}>
          <Gauge value={c.overall} label={`${c.type_label} score`} size={220} />
          <span className="status-chip" style={{ "--area": (STATUS[c.status] ?? STATUS.Good).color }}>
            {c.status}
          </span>
        </div>
        <div>
          <div className="eyebrow">Your feedback</div>
          <h2 style={{ margin: "6px 0 10px" }}>{c.summary}</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <div className="metric">
              <div className="v">
                {ICONS[best.key]} {best.score.toFixed(0)}%
              </div>
              <div className="l">Strongest · {best.label}</div>
            </div>
            <div className="metric">
              <div className="v" style={{ color: "#eab308" }}>
                {ICONS[worst.key]} {worst.needs_improvement.toFixed(0)}%
              </div>
              <div className="l">To improve · {worst.label}</div>
            </div>
          </div>
          {audioUrl && <audio controls src={audioUrl} style={{ width: "100%", marginTop: 14 }} />}
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={c.areas.map((a) => ({ area: SHORT[a.key], score: a.score }))} outerRadius="66%">
              <PolarGrid stroke="#1e2a44" />
              <PolarAngleAxis dataKey="area" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.3} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="area-grid">
        {[...c.areas]
          .sort((x, y) => x.score - y.score)
          .map((a) => (
            <AreaCard key={a.key} a={a} typeLabel={c.type_label} />
          ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>📝 What you said</h3>
          <p style={{ lineHeight: 1.8 }}>{report.transcript}</p>
        </div>
        <div className="card">
          <h3>✨ Say it like this</h3>
          <p style={{ lineHeight: 1.8, color: "var(--text)" }}>{report.improved || "—"}</p>
          <p className="small" style={{ marginTop: 8 }}>
            Your own words without fillers and hedges — read it aloud, pause at each full stop.
          </p>
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Full speech report (pace, pronunciation, tips)</summary>
        <div style={{ marginTop: 16 }}>
          <SpeechResult r={report} />
        </div>
      </details>
    </div>
  );
}
