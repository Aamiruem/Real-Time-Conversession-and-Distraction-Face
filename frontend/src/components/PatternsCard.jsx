// Dashboard "Patterns & prediction": two pie charts that explain your habits and predict what works best next.
//  1. When you focus best — focus minutes by time of day (in your local time) + average focus per part of the day,
//     and the predicted focus if you plan your next session at your best time.
//  2. Your practice mix — focus sessions vs speech / conversation / interview practice, and what to balance next.
import Link from "@/components/Link";
import { ChartCard } from "./dashboard";
import { Icon } from "./Icons";
import { Donut } from "./ui";

const DAYPARTS = [
  ["Morning", "5 am – 12 pm", "#d97706"],
  ["Afternoon", "12 – 5 pm", "#0284c7"],
  ["Evening", "5 – 9 pm", "#7c3aed"],
  ["Night", "9 pm – 5 am", "#0d9488"],
];
const partOf = (hour) => (hour >= 5 && hour < 12 ? 0 : hour >= 12 && hour < 17 ? 1 : hour >= 17 && hour < 21 ? 2 : 3);

const MIX = [
  ["focus", "Focus sessions", "#16a34a", "/app/focus"],
  ["speech", "Speech practice", "#7c3aed", "/app/speech"],
  ["conversation", "Conversations", "#db2777", "/app/conversation"],
  ["interview", "Mock interviews", "#d97706", "/app/interview"],
];

/** Group sessions by part of the day; the prediction is the minutes-weighted average focus of the best part. */
export function focusByDaypart(times = []) {
  const parts = DAYPARTS.map(([name, hours, color]) => ({ name, hours, color, minutes: 0, weighted: 0, sessions: 0 }));
  for (const t of times) {
    const p = parts[partOf(new Date(t.at).getHours())];
    const w = Math.max(t.minutes, 1);
    p.minutes += t.minutes;
    p.weighted += t.focus * w;
    p.sessions += 1;
    p.w = (p.w ?? 0) + w;
  }
  for (const p of parts) p.focus = p.sessions ? p.weighted / p.w : null;
  const total = parts.reduce((a, p) => a + p.minutes, 0);
  const allW = parts.reduce((a, p) => a + (p.w ?? 0), 0);
  const overall = allW ? parts.reduce((a, p) => a + p.weighted, 0) / allW : null;
  // the best part needs at least 2 sessions unless that's all there is — one lucky session isn't a pattern
  const tried = parts.filter((p) => p.sessions);
  const pool = tried.some((p) => p.sessions >= 2) ? tried.filter((p) => p.sessions >= 2) : tried;
  const best = pool.reduce((b, p) => (b == null || p.focus > b.focus ? p : b), null);
  return { parts, total, overall, best, sessions: times.length };
}

function Legend({ rows }) {
  return (
    <div className="legend">
      {rows.map(([name, value, color, note]) => (
        <div key={name}>
          <i style={{ background: color }} />
          <span>
            {name}
            {note && <small className="muted"> · {note}</small>}
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
  const lift = day.best && day.overall != null ? day.best.focus - day.overall : 0;

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
                  center={`${Math.round(day.best.focus)}%`}
                  caption={`best: ${day.best.name}`}
                  label={`Focus minutes by time of day; best is ${day.best.name} at ${Math.round(day.best.focus)}% focus`}
                />
                <Legend
                  rows={day.parts.map((p) => [
                    p.name,
                    p.sessions ? `${Math.round(p.focus)}%` : "—",
                    p.color,
                    p.sessions ? `${Math.round(p.minutes)} min` : p.hours,
                  ])}
                />
              </div>
              <p className="pattern-insight">
                <Icon name="target" size={15} />
                <span>
                  <b>Prediction:</b> a session in the <b>{day.best.name.toLowerCase()}</b> ({day.best.hours}) should reach about{" "}
                  <b>{Math.round(day.best.focus)}% focus</b>
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
                <Legend rows={MIX.map(([k, name, color]) => [name, `${Math.round(((mix[k] ?? 0) / mixTotal) * 100)}%`, color, `${mix[k] ?? 0}`])} />
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
