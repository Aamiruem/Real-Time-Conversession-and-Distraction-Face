import { STATE_COLORS, STATE_EMOJI } from "@/lib/attention";
import { Icon } from "./Icons";

export function PageHead({ eyebrow, title, highlight, sub }) {
  const parts = highlight ? title.split(highlight) : [title];
  return (
    <header className="page-head">
      <div className="eyebrow">{eyebrow}</div>
      <h1>
        {parts[0]}
        {highlight && <span className="grad">{highlight}</span>}
        {parts[1]}
      </h1>
      <p>{sub}</p>
    </header>
  );
}

export const Metric = ({ v, l }) => (
  <div className="metric">
    <div className="v">{v}</div>
    <div className="l">{l}</div>
  </div>
);

export function Gauge({ value, label, size = 180 }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = 70,
    c = Math.PI * r;
  const color = v >= 70 ? "#22c55e" : v >= 40 ? "#eab308" : "#ef4444";
  return (
    <figure style={{ margin: 0, textAlign: "center" }} aria-label={`${label}: ${v.toFixed(0)}%`}>
      <svg width={size} height={size * 0.62} viewBox="0 0 180 112">
        <path d="M20 100 A70 70 0 0 1 160 100" fill="none" stroke="var(--line)" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M20 100 A70 70 0 0 1 160 100"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray .4s" }}
        />
        <text x="90" y="92" textAnchor="middle" fill="var(--text)" fontSize="30" fontWeight="800">
          {v.toFixed(0)}%
        </text>
      </svg>
      <figcaption className="muted small">{label}</figcaption>
    </figure>
  );
}

/** Ring chart: `segments` are [label, percent, color]; the first segment's percent is shown in the middle. */
export function Donut({ segments, size = 150, label, center, caption }) {
  const r = 52,
    c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={label}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
      {segments.map(([k, v, color]) => {
        const len = (Math.max(0, v) / 100) * c;
        const el = (
          <circle
            key={k}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dasharray .4s, stroke-dashoffset .4s" }}
          />
        );
        offset += len;
        return el;
      })}
      <text x="70" y="72" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="800">
        {center ?? `${(segments[0]?.[1] ?? 0).toFixed(1)}%`}
      </text>
      <text x="70" y="92" textAnchor="middle" fill="var(--muted)" fontSize="10" letterSpacing="1.5">
        {(caption ?? segments[0]?.[0] ?? "").toUpperCase()}
      </text>
    </svg>
  );
}

export function StateBadge({ state, focus }) {
  return (
    <div className="badge" style={{ background: STATE_COLORS[state] ?? "#334155" }}>
      {STATE_EMOJI[state]} {state}
      <div style={{ fontSize: ".8rem", fontWeight: 400 }}>Focus score {focus.toFixed(0)}%</div>
    </div>
  );
}

export function Bars({ items }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((it) => {
        const color = it.value >= 75 ? "#22c55e" : it.value >= 50 ? "#eab308" : "#ef4444";
        return (
          <div key={it.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem" }}>
              <span>{it.label}</span>
              <b>{it.value.toFixed(0)}</b>
            </div>
            <div className="bar">
              <div style={{ width: `${it.value}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RISK_COLOR = { low: "#22c55e", medium: "#eab308", high: "#ef4444" };

/** Fatigue risk: a low/medium/high meter, the advice, and what drives it (each factor vs. a typical session). */
export function RiskCard({ f }) {
  const color = RISK_COLOR[f.risk];
  const score = Math.max(0, Math.min(100, f.risk_score));
  // how far each factor is from typical (relative), capped so one extreme value doesn't flatten the rest
  const rows = f.factors.map((x) => {
    const typical = Number(x.typical) || 0;
    const rel = typical ? (Number(x.value) - typical) / Math.abs(typical) : 0;
    return { ...x, width: Math.min(100, Math.abs(rel) * 100), raises: x.effect > 0 };
  });
  return (
    <div className="card risk-card tinted" style={{ "--c": "#e11d48" }}>
      <div className="risk-head">
        <div className="chart-head" style={{ margin: 0 }}>
          <span className="nav-ico">
            <Icon name="pulse" size={17} />
          </span>
          <h3>Fatigue risk</h3>
        </div>
        <span className="pill" style={{ color, borderColor: color, background: `${color}22` }}>
          {f.risk.toUpperCase()} · {score.toFixed(0)}/100
        </span>
      </div>
      <div className="risk-meter" role="img" aria-label={`Fatigue risk ${score.toFixed(0)} out of 100: ${f.risk}`}>
        <div className="risk-zones">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
        <i style={{ left: `${score}%`, borderColor: color }} />
      </div>
      <p className="risk-advice">{f.advice}</p>
      {rows.length > 0 && (
        <>
          <div className="risk-legend small muted">
            <span>
              <i className="lower" /> lowers risk
            </span>
            <span>What drives it — vs. a typical session</span>
            <span>
              raises risk <i className="raise" />
            </span>
          </div>
          <ul className="risk-factors">
            {rows.map((x) => (
              <li key={x.feature}>
                <span className="rf-label">{x.label}</span>
                <span className="rf-track" title={`${x.value} (typical ${x.typical})`}>
                  <span className={`rf-bar ${x.raises ? "raise" : "lower"}`} style={{ width: `${x.width / 2}%` }} />
                </span>
                <span className="rf-value">
                  <b>{x.value}</b> <span className="muted">vs {x.typical}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted" style={{ margin: "10px 0 0" }}>
        {f.model.algorithm.replace(/_/g, " ")} model · test F1 {f.model.test_f1_macro}
      </p>
    </div>
  );
}

const SCORE_LABELS = {
  fluency: "Fluency",
  pace: "Pace",
  voice: "Voice energy",
  assertiveness: "Assertiveness",
  clarity: "Pronunciation clarity",
  eye_contact: "Eye contact",
};

export function SpeechResult({ r, audioUrl }) {
  const m = r.metrics;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="grid g2" style={{ alignItems: "center" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <Gauge value={r.confidence} label="Confidence" size={220} />
          <b>{r.level}</b>
        </div>
        <div className="card">
          <Bars items={Object.entries(r.scores).map(([k, v]) => ({ label: SCORE_LABELS[k] ?? k, value: v }))} />
        </div>
      </div>
      <div className="grid g5">
        <Metric v={m.wpm} l="Words / min (120–160)" />
        <Metric v={m.fillers} l="Filler words" />
        <Metric v={m.long_pauses} l="Long pauses" />
        <Metric v={`${m.pitch_var_st.toFixed(1)} st`} l="Pitch variety" />
        <Metric v={m.eye_contact == null ? "—" : `${m.eye_contact.toFixed(0)}%`} l="Eye contact" />
      </div>
      {r.reading && <Metric v={`${r.reading.accuracy.toFixed(0)}%`} l="Reading accuracy" />}
      {r.strengths.length > 0 && (
        <div className="alert ok">
          💪 <b>Strengths:</b> {r.strengths.join(" · ")}
        </div>
      )}
      <div className="card">
        <h3>🧭 How to sound more confident</h3>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          {r.tips.map((t) => (
            <li key={t.title} style={{ marginBottom: 8 }}>
              <b>{t.title}</b> — <span className="muted">{t.detail}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>📝 What you said</h3>
          <div className="transcript">
            {r.words.map((w, i) => (
              <span
                key={i}
                className={w.filler ? "filler" : w.unclear ? "unclear" : ""}
                title={`${(w.prob * 100).toFixed(0)}% clear`}
              >
                {w.word}{" "}
              </span>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            🟧 filler word · 〰️ unclear pronunciation (hover a word for its clarity)
          </p>
        </div>
        <div className="card">
          <h3>✨ Say it like this</h3>
          <div className="alert info" style={{ fontSize: "1rem" }}>
            {r.improved || "—"}
          </div>
          <p className="small">
            Your words without fillers and hedges. Read it aloud with a steady voice, pause at each full stop and end
            sentences on a lower pitch.
          </p>
        </div>
      </div>
      {r.reading && r.reading.misread.length > 0 && (
        <div className="card">
          <h3>🔤 Pronunciation practice</h3>
          <table className="t">
            <thead>
              <tr>
                <th>Expected</th>
                <th>We heard</th>
              </tr>
            </thead>
            <tbody>
              {r.reading.misread.map((p, i) => (
                <tr key={i}>
                  <td>{p.expected}</td>
                  <td>{p.heard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {audioUrl && <audio controls src={audioUrl} style={{ width: "100%" }} />}
    </div>
  );
}
