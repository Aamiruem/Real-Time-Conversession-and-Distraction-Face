import { ConversationFeedback } from "./ConversationFeedback";
import { Gauge } from "./ui";

const SECTION_ICONS = { content: "🧠", delivery: "🎙️", presence: "🎥", body: "🧍" };
const color = (v) => (v >= 85 ? "#22c55e" : v >= 70 ? "#38bdf8" : v >= 50 ? "#eab308" : "#ef4444");

function Section({ s }) {
  return (
    <article className="card iv-section" style={{ "--area": color(s.score) }}>
      <header className="area-head">
        <span>
          {SECTION_ICONS[s.key]} <b>{s.label}</b>
        </span>
        <span className="area-score" style={{ fontSize: "1.6rem", margin: 0 }}>
          {s.score.toFixed(0)}
          <small>%</small>
        </span>
      </header>
      <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
        {s.items.map((i) => (
          <div key={i.key} className="iv-item" style={{ "--area": color(i.score) }}>
            <div className="iv-item-head">
              <b>{i.label}</b>
              <span>{i.score.toFixed(0)}%</span>
            </div>
            <div className="split-bar" style={{ height: 7 }}>
              <div style={{ width: `${i.score}%` }} />
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {i.detail}
            </div>
            <div className="small" style={{ marginTop: 2 }}>
              → {i.tip}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

/** Mock-interview feedback for a report that has `report.interview` (content, delivery, presence). */
export function InterviewFeedback({ report, audioUrl }) {
  const iv = report.interview;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="card iv-hero">
        <div style={{ textAlign: "center" }}>
          <Gauge value={iv.readiness} label="Interview readiness" size={220} />
          <b>{iv.level}</b>
        </div>
        <div>
          <div className="eyebrow">
            {iv.field_label} · {iv.question.category}
          </div>
          <h2 style={{ margin: "6px 0 12px" }}>“{iv.question.q}”</h2>
          <div className="card-title" style={{ marginBottom: 6 }}>
            Do this next
          </div>
          <ol className="suggestions" style={{ fontSize: ".95rem" }}>
            {iv.top_tips.map((t) => (
              <li key={t.label}>
                <b>{t.label}:</b> {t.tip}
              </li>
            ))}
          </ol>
          {audioUrl && <audio controls src={audioUrl} style={{ width: "100%" }} />}
        </div>
      </div>

      <div className="iv-sections">
        {iv.sections.map((s) => (
          <Section key={s.key} s={s} />
        ))}
      </div>

      <div className="grid g3" style={{ alignItems: "start" }}>
        <div className="card">
          <h3>🧩 {iv.framework.label} structure</h3>
          <ul className="checklist">
            {iv.structure.map((p) => (
              <li key={p.part} className={p.done ? "done" : ""}>
                {p.done ? "✓" : "○"} {p.part}
              </li>
            ))}
          </ul>
          <div className="card-title" style={{ margin: "14px 0 6px" }}>
            A strong answer covers
          </div>
          <ol className="suggestions">
            {iv.question.outline.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h3>📖 Vocabulary</h3>
          {iv.swaps.length ? (
            <table className="swaps">
              <tbody>
                {iv.swaps.map((s) => (
                  <tr key={s.weak}>
                    <td>
                      <s>{s.weak}</s> ×{s.count}
                    </td>
                    <td>→ {s.strong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No weak phrases found — nice.</p>
          )}
          <div className="card-title" style={{ margin: "14px 0 6px" }}>
            Power verbs you used
          </div>
          <div className="tags">
            {iv.power_verbs.length ? iv.power_verbs.map((v) => <span key={v}>{v}</span>) : <i className="muted">none yet</i>}
          </div>
        </div>
        <div className="card">
          <h3>⚠️ Avoid</h3>
          <ul className="suggestions" style={{ paddingLeft: 18 }}>
            {iv.question.pitfalls.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="card-title" style={{ margin: "14px 0 6px" }}>
            👔 Dress for {iv.field_label.toLowerCase()}
          </div>
          <p className="small">{iv.dress}</p>
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          Delivery in detail — fluency, word confidence, interaction, voice modulation, transcript
        </summary>
        <div style={{ marginTop: 16 }}>
          <ConversationFeedback report={report} />
        </div>
      </details>
    </div>
  );
}
