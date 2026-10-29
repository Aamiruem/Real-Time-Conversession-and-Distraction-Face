// Dashboard "Patterns & prediction": two pie charts that explain your habits and predict what works best next.
//  1. When you focus best — focus minutes by time of day (in your local time) + average focus per part of the day,
//     and the predicted focus if you plan your next session at your best time. Same parts of the day as the
//     backend's recommendations (coach/recommend.py), so the two never disagree.
//  2. Your practice mix — focus sessions vs speech / conversation / interview practice, and what to balance next.
import Link from "@/components/Link";
import { ChartCard } from "./dashboard";
import { Icon } from "./Icons";
import { Donut } from "./ui";

const DAYPARTS = [
  ["Morning", "5 am – 12 pm", "#d97706"],
  ["Afternoon", "12 – 5 pm", "#0284c7"],
  ["Evening", "5 – 10 pm", "#7c3aed"],
  ["Night", "10 pm – 5 am", "#0d9488"],
];
const partOf = (hour) => (hour >= 5 && hour < 12 ? 0 : hour >= 12 && hour < 17 ? 1 : hour >= 17 && hour < 22 ? 2 : 3);
const PRIOR = 2; // sessions' worth of pull toward your overall average (so one lucky session isn't "your best time")

const MIX = [
  ["focus", "Focus sessions", "#16a34a", "/app/focus"],
  ["speech", "Speech practice", "#7c3aed", "/app/speech"],
  ["conversation", "Conversations", "#db2777", "/app/conversation"],
  ["interview", "Mock interviews", "#d97706", "/app/interview"],
];

/**
 * Group sessions by part of the day. The prediction for each part is its average focus shrunk toward your overall
 * average by sample size — (sum + overall × PRIOR) / (sessions + PRIOR) — and the best part is the highest prediction.
 */
export function focusByDaypart(times = []) {
  const parts = DAYPARTS.map(([name, hours, color]) => ({ name, hours, color, minutes: 0, sum: 0, sessions: 0 }));
  for (const t of times) {
    const p = parts[partOf(new Date(t.at).getHours())];
    p.minutes += t.minutes;
    p.sum += t.focus;
    p.sessions += 1;
  }
  const overall = times.length ? times.reduce((a, t) => a + t.focus, 0) / times.length : null;
  for (const p of parts) {
    p.focus = p.sessions ? p.sum / p.sessions : null;
    p.predicted = p.sessions ? (p.sum + overall * PRIOR) / (p.sessions + PRIOR) : null;
  }
  const best = parts.filter((p) => p.sessions).reduce((b, p) => (b == null || p.predicted > b.predicted ? p : b), null);
  const total = parts.reduce((a, p) => a + p.minutes, 0);
  return { parts, total, overall, best, sessions: times.length };
}

function Legend({ rows }) {
  return (
    <div className="legend">
      {rows.map(([name, value, color, note]) => (
        <div key={name}>
          <i style={{ background: color }} />
          <span className="legend-name">
            {name}
            {note && <small className="muted">{note}</small>}
          </span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

export function PatternsCard({ focusTimes, mix }) {
  const day = focusByDaypart(focusTimes);
  const mixTotal = MIX.reduce((a, [k]) => a + (mix?.[k] ?? 0), 0);
  const practice = MIX.slice(1);
  const least = practice.reduce((m, row) => ((mix?.[row[0]] ?? 0) < (mix?.[m[0]] ?? 0) ? row : m), practice[0]);
  const lift = day.best ? day.best.predicted - day.overall : 0;

  return (
    <ChartCard icon="trend" color="#0891b2" title="Patterns & prediction" sub="From your own sessions · times in your local time" className="patterns">
      <div className="patterns-grid">
        <section className="pattern">
          <h4>When you focus best</h4>
          {day.sessions ? (
            <>
              <div className="pattern-chart">
                <Donut
                  size={136}
                  segments={day.parts.map((p) => [p.name, day.total ? (p.minutes / day.total) * 100 : 0, p.color])}
                  center={`${Math.round(day.best.predicted)}%`}
                  caption={day.best.name}
                  label={`Focus minutes by time of day; predicted best is ${day.best.name} at ${Math.round(day.best.predicted)}% focus`}
                />
                <Legend
                  rows={day.parts.map((p) => [
                    p.name,
                    p.sessions ? `${Math.round(p.focus)}%` : "—",
                    p.color,
                    p.sessions ? `${Math.round(p.minutes)} min · ${p.sessions} session${p.sessions === 1 ? "" : "s"}` : `${p.hours} · no data`,
                  ])}
                />
              </div>
              <p className="pattern-insight">
                <Icon name="target" size={15} />
                <span>
                  <b>Prediction:</b> a session in the <b>{day.best.name.toLowerCase()}</b> ({day.best.hours}) should reach about{" "}
                  <b>{Math.round(day.best.predicted)}% focus</b>
                  {lift >= 1 ? ` — ${Math.round(lift)} points above your average` : ""}.{" "}
                  {day.sessions < 6 && <span className="muted">Based on {day.sessions} session{day.sessions === 1 ? "" : "s"} — it gets sharper with more.</span>}
                </span>
              </p>
            </>
          ) : (
            <p className="pattern-empty">
              Do a few focus sessions at different times — this predicts when you concentrate best.{" "}
              <Link href="/app/focus">Start one →</Link>
            </p>
          )}
        </section>

        <section className="pattern">
          <h4>Your practice mix</h4>
          {mixTotal ? (
            <>
              <div className="pattern-chart">
                <Donut
                  size={136}
                  segments={MIX.map(([k, name, color]) => [name, ((mix[k] ?? 0) / mixTotal) * 100, color])}
                  center={String(mixTotal)}
                  caption="sessions"
                  label={`Practice mix: ${MIX.map(([k, name]) => `${name} ${mix[k] ?? 0}`).join(", ")}`}
                />
                <Legend
                  rows={MIX.map(([k, name, color]) => [
                    name,
                    `${Math.round(((mix[k] ?? 0) / mixTotal) * 100)}%`,
                    color,
                    `${mix[k] ?? 0} session${mix[k] === 1 ? "" : "s"}`,
                  ])}
                />
              </div>
              <p className="pattern-insight">
                <Icon name="bulb" size={15} />
                <span>
                  <b>Balance next:</b> {least[1].toLowerCase()} is your least-practised skill ({mix[least[0]] ?? 0}).{" "}
                  <Link href={least[3]}>Practise it →</Link>
                </span>
              </p>
            </>
          ) : (
            <p className="pattern-empty">
              Your mix of focus, speech, conversation and interview practice appears here. <Link href="/app/speech">Record a speech →</Link>
            </p>
          )}
        </section>
      </div>
    </ChartCard>
  );
}
