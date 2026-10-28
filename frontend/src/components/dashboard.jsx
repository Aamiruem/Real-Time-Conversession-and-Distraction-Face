import Link from "@/components/Link";

// Validated categorical slots for the dark surface (dataviz reference palette, dark steps):
// single-series charts use SERIES[0]; never cycle beyond three.
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
export const GRID = "var(--line)";
export const TICK = { fill: "var(--muted)", fontSize: 11 };
export const TOOLTIP = {
  contentStyle: { background: "var(--surface2)", border: "1px solid #1e2a44", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "var(--text)", fontWeight: 700 },
  itemStyle: { color: "var(--text)" },
  cursor: { stroke: "var(--muted)", strokeDasharray: "3 3" },
};

export function ChartCard({ title, sub, action, children, className = "" }) {
  return (
    <section className={`card chart-card ${className}`}>
      <header className="chart-head">
        <div>
          <h3>{title}</h3>
          {sub && <p className="small muted">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyChart({ icon, text, href, cta }) {
  return (
    <div className="empty-chart">
      <span>{icon}</span>
      <p>{text}</p>
      {href && (
        <Link href={href} className="btn sm">
          {cta}
        </Link>
      )}
    </div>
  );
}

/** Stat tile: icon, value, label and an optional delta line (↑ green / ↓ amber, always with text). */
export function Kpi({ icon, value, label, sub, trend }) {
  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-l">{label}</span>
      </div>
      <div className="kpi-v">{value}</div>
      {sub && <div className={`kpi-sub ${trend ?? ""}`}>{sub}</div>}
    </div>
  );
}

/** Progress ring for a daily goal. */
export function GoalRing({ value, goal, label, unit, color = SERIES[0] }) {
  const pct = Math.min(1, goal ? value / goal : 0);
  const r = 34,
    c = 2 * Math.PI * r;
  return (
    <figure className="goal" aria-label={`${label}: ${value} of ${goal} ${unit}`}>
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke={GRID} strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={pct >= 1 ? "#22c55e" : color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dasharray .6s" }}
        />
        <text x="44" y="49" textAnchor="middle" fill="var(--text)" fontSize="16" fontWeight="800">
          {pct >= 1 ? "✓" : `${Math.round(pct * 100)}%`}
        </text>
      </svg>
      <figcaption>
        <b>
          {value}/{goal} {unit}
        </b>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
