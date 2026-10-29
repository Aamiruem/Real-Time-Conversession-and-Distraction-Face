import Link from "@/components/Link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard, EmptyChart, GoalRing, GRID, Kpi, SERIES, TICK, TOOLTIP, timeAgo } from "@/components/dashboard";
import { Donut, RiskCard } from "@/components/ui";
import { PatternsCard } from "@/components/PatternsCard";
import { openCoach } from "@/components/CoachPanel";
import { cachedApi, peekCache } from "@/lib/api";
import { useBackendStatus } from "@/lib/backend";
import { buildDashboardFallback } from "@/lib/dashboardFallback";
import { STATE_COLORS } from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { SECTIONS } from "@/lib/sections";
import { Icon } from "@/components/Icons";

const FEATURES = ["/app/routine", "/app/focus", "/app/speech", "/app/conversation", "/app/interview", "/app/meet", "/app/rooms", "/app/vision", "/app/lab"];

// time-of-day advice ("you focus best in the evening") uses the viewer's own clock
const TZ = -new Date().getTimezoneOffset();
const RECS = `/recommendations?tz=${TZ}`;
const INSIGHT = `/coach/insight?tz=${TZ}`;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function Skeleton() {
  return (
    <div className="dash">
      <div className="card skeleton" style={{ height: 160 }} />
      <div className="kpi-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="kpi skeleton" style={{ height: 92 }} />
        ))}
      </div>
      <div className="card skeleton" style={{ height: 300 }} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  // show the last dashboard instantly when you come back, then refresh it in the background
  const [d, setD] = useState(() => peekCache("/analytics/dashboard") ?? null);
  const [err, setErr] = useState("");
  const [recs, setRecs] = useState(() => peekCache(RECS) ?? null);
  const [insight, setInsight] = useState(() => peekCache(INSIGHT) ?? null);
  const backend = useBackendStatus();

  // (re)load whenever the backend becomes reachable or changes version — e.g. right after it is restarted
  useEffect(() => {
    if (backend.status === "checking" || backend.status === "offline") return;
    let alive = true;
    setErr("");
    cachedApi("/analytics/dashboard", 0)
      .catch((e) => {
        // older backend without the dashboard endpoint: build it from the data it does have
        if (e.status === 404 && user) return buildDashboardFallback(user.username);
        throw e;
      })
      .then((data) => alive && setD(data))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [backend.status, backend.version, user]);

  useEffect(() => {
    if (backend.status !== "ok") return;
    cachedApi(RECS, 0).then(setRecs).catch(() => setRecs(null));
    cachedApi(INSIGHT, 60_000).then(setInsight).catch(() => setInsight(null));
  }, [backend.status]);

  const first = (user?.full_name || user?.username || "").split(" ")[0];
  if (err && !d)
    return (
      <div className="card empty-state">
        <span aria-hidden="true">📉</span>
        <h2>Your dashboard didn't load</h2>
        <p className="muted">{err}</p>
        <button className="btn" onClick={() => location.reload()}>
          ↻ Try again
        </button>
      </div>
    );
  if (!d) return <Skeleton />;

  const k = d.kpis;
  const weekDelta = k.week_minutes - k.last_week_minutes;
  const split = Object.entries(d.state_split).map(([name, v]) => [name, v, STATE_COLORS[name]]);

  return (
    <div className="dash">
      {/* ---------------------------------------------------------------- hero */}
      <section className="card dash-hero">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1>
            {greeting()}, <span className="grad">{first}</span>
          </h1>
          {d.limited && (
            <span className="status-chip" style={{ "--area": "#eab308", marginBottom: 8 }} title="Restart the backend for interview readiness and the newest panels">
              Limited mode · older backend
            </span>
          )}
          <p className="muted">
            {k.streak_days
              ? `🔥 ${k.streak_days}-day streak — keep it going today.`
              : "Start a streak today — one focus session or one practice counts."}
          </p>
          <div className="row" style={{ marginTop: 16, flexWrap: "wrap", flex: "none" }}>
            <Link href="/app/focus" className="btn" style={{ flex: "none" }}>
              <Icon name="play" size={16} /> Start focus session
            </Link>
            <Link href="/app/routine" className="btn ghost" style={{ flex: "none" }}>
              <Icon name="clock" size={16} /> Daily routine
            </Link>
            <Link href="/app/interview" className="btn ghost" style={{ flex: "none" }}>
              <Icon name="briefcase" size={16} /> Mock interview
            </Link>
          </div>
        </div>
        <div className="goals">
          <div className="card-title goals-title">
            <Icon name="goal" size={15} /> Today's goals
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <GoalRing value={Math.round(d.today.focus_minutes)} goal={d.today.goal_focus_minutes} unit="min" label="Focus time" />
            <GoalRing value={d.today.practice} goal={d.today.goal_practice} unit="" label="Speaking practice" color={SERIES[2]} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- AI coach insight */}
      {insight && (
        <section className="card insight">
          <span className="nav-ico lg">
            <Icon name="sparkles" size={21} />
          </span>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>
              Your coach says <span className="engine">{insight.engine === "claude" ? "Claude" : "Built-in coach"}</span>
            </div>
            {insight.answer.split("\n").map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="insight-actions">
            <button className="btn sm" onClick={() => openCoach()}>
              Ask a follow-up
            </button>
            <button className="btn ghost sm" onClick={() => openCoach("What should I practise next?")}>
              What next?
            </button>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- KPIs */}
      <div className="kpi-grid">
        <Kpi icon="target" color="#16a34a" value={`${k.avg_focus_pct}%`} label="Average focus" sub={`${k.focus_sessions} sessions`} />
        <Kpi
          icon="timer"
          color="#0284c7"
          value={`${Math.round(k.week_minutes)} min`}
          label="Focus this week"
          sub={`${weekDelta >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(weekDelta))} min vs last week`}
          trend={weekDelta >= 0 ? "up" : "down"}
        />
        <Kpi icon="mic" color="#7c3aed" value={`${k.avg_confidence}%`} label="Speaking confidence" sub={`${k.practice_sessions} practices`} />
        <Kpi
          icon="briefcase"
          color="#d97706"
          value={k.latest_readiness == null ? "—" : `${Math.round(k.latest_readiness)}%`}
          label="Interview readiness"
          sub={k.best_readiness == null ? "no mock interview yet" : `best ${Math.round(k.best_readiness)}% · ${k.interview_answers} answer${k.interview_answers === 1 ? "" : "s"}`}
        />
        <Kpi icon="flame" color="#ea580c" value={k.streak_days} label="Day streak" sub={`${k.messages_sent} room messages`} />
        <Kpi
          icon="trophy"
          color="#ca8a04"
          value={k.rank ? `#${k.rank}` : "—"}
          label="Focus leaderboard"
          sub={k.rank ? `of ${k.ranked_users} people` : "do a focus session to rank"}
        />
      </div>

      {/* ---------------------------------------------------------------- activity + next steps */}
      <div className="grid split-2-1 dash-top">
        <div className="dash-col">
        <ChartCard icon="chart" color="#2563eb" title="Focus minutes per day" sub="Last 14 days · hover a bar for practice and messages">
          <div className="chart-box" style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={d.activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <ReferenceLine y={d.today.goal_focus_minutes} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "daily goal", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} />
                <Tooltip
                  {...TOOLTIP}
                  cursor={{ fill: "var(--hover)" }}
                  formatter={(v, name, p) => [`${v} min · ${p.payload.practice} practice · ${p.payload.messages} msgs`, "Focus"]}
                />
                <Bar dataKey="focus_minutes" name="Focus minutes" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        {d.fatigue ? (
          <RiskCard f={d.fatigue} />
        ) : (
          <ChartCard icon="pulse" color="#e11d48" title="Fatigue risk">
            <p className="small">Finish a focus session to get your machine-learning fatigue prediction.</p>
          </ChartCard>
        )}
        <PatternsCard focusTimes={d.focus_times} mix={d.practice_mix} />
        </div>
        <div className="dash-col">
          {recs?.length ? (
            <ChartCard icon="bulb" color="#7c3aed" title="Recommended for you" sub="Ranked by how much each should help — from your own data">
              <ul className="recs">
                {recs.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href}>
                      <span className="rec-ico">{r.icon}</span>
                      <span className="rec-body">
                        <b>{r.title}</b>
                        <span className="small muted">{r.reason}</span>
                        <span className="small">→ {r.action}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ChartCard>
          ) : null}
          {d.next_steps?.length > 0 && (
          <ChartCard icon="zap" color="#d97706" title={recs?.length ? "Quick actions" : "Next steps"} sub="Picked from your own data">
            <div className="next-steps">
              {d.next_steps.map((s) => (
                <Link key={s.text} href={s.href}>
                  <span>{s.icon}</span>
                  <span>{s.text}</span>
                  <span className="muted">→</span>
                </Link>
              ))}
            </div>
          </ChartCard>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- focus */}
      <div className="grid g3 dash-row">
        <ChartCard icon="focus" color="#16a34a" title="Focus by session" sub="Focus % in your last sessions">
          {d.focus_trend.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={d.focus_trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(v, n, p) => [`${v}% · ${p.payload.minutes} min`, "Focus"]} />
                  <Line type="monotone" dataKey="focus" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="🎥" text="No focus sessions yet." href="/app/focus" cta="Start one" />
          )}
        </ChartCard>
        <ChartCard icon="pie" color="#0d9488" title="Where your time goes" sub="Average across all focus sessions">
          {k.focus_sessions ? (
            <div className="split-donut">
              <Donut segments={split} size={150} label={`Focused ${k.avg_focus_pct}%`} />
              <div className="legend">
                {split.map(([name, v, c]) => (
                  <div key={name}>
                    <i style={{ background: c }} />
                    {name}
                    <b>{v.toFixed(1)}%</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart icon="🍩" text="Your focus / distracted / drowsy split appears here." />
          )}
        </ChartCard>
        <ChartCard icon="award" color="#7c3aed" title="Speaking skills" sub="Average across your recordings">
          {d.skills.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <RadarChart data={d.skills} outerRadius="70%">
                  <PolarGrid stroke={GRID} />
                  <PolarAngleAxis dataKey="label" tick={TICK} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(v) => [`${v}%`, "Score"]} />
                  <Radar dataKey="score" stroke={SERIES[0]} fill={SERIES[0]} fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="🗣️" text="Record a speech to map your skills." href="/app/speech" cta="Speech Coach" />
          )}
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- speaking + interview */}
      <div className="grid g2 dash-row">
        <ChartCard icon="trend" color="#db2777" title="Speaking confidence" sub="Each Speech, Conversation or Interview recording">
          {d.speech_trend.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={d.speech_trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
                  <ReferenceLine y={70} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "confident", fill: "var(--muted)", fontSize: 11, position: "insideTopLeft" }} />
                  <Tooltip {...TOOLTIP} formatter={(v, n, p) => [`${v}% · ${p.payload.mode}`, "Confidence"]} />
                  <Line type="monotone" dataKey="confidence" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="🎙️" text="Your confidence trend appears after your first recording." href="/app/speech" cta="Record now" />
          )}
        </ChartCard>
        <ChartCard
          icon="briefcase"
          color="#d97706"
          title="Interview readiness"
          sub="Each mock-interview answer · hover for content, delivery and presence"
          action={
            <Link href="/app/interview" className="btn ghost sm">
              Practise
            </Link>
          }
        >
          {d.interview_trend.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={d.interview_trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
                  <Tooltip
                    {...TOOLTIP}
                    cursor={{ fill: "var(--hover)" }}
                    formatter={(v, n, p) => [
                      `${Math.round(v)}% · content ${Math.round(p.payload.content ?? 0)} · delivery ${Math.round(p.payload.delivery ?? 0)}${p.payload.presence != null ? ` · presence ${Math.round(p.payload.presence)}` : ""}`,
                      "Readiness",
                    ]}
                  />
                  <Bar dataKey="readiness" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="💼" text="Answer a mock-interview question to track your readiness." href="/app/interview" cta="Start" />
          )}
        </ChartCard>
      </div>

      {/* ---------------------------------------------------------------- recent + explore */}
      <div className="grid split-2-1 dash-row">
        <ChartCard icon="clock" color="#0284c7" title="Recent activity">
          {d.recent.length ? (
            <ul className="feed">
              {d.recent.map((r) => (
                <li key={r.when + r.title}>
                  <Link href={r.href}>
                    <span className="feed-icon">{r.icon}</span>
                    <span className="feed-text">
                      <b>{r.title}</b>
                      {r.detail && <span className="small muted">{r.detail}</span>}
                    </span>
                    <span className="feed-score">
                      <b>{r.score}%</b>
                      <span className="small muted">
                        {r.score_label} · {timeAgo(r.when)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChart icon="📭" text="Nothing yet — your sessions and practice show up here." />
          )}
        </ChartCard>
        <ChartCard icon="compass" color="#4f46e5" title="Explore">
          <div className="explore">
            {FEATURES.map((href) => {
              const f = SECTIONS[href];
              return (
                <Link key={href} href={href} style={{ "--c": f.color }}>
                  <span className="nav-ico">
                    <Icon name={f.icon} size={17} />
                  </span>
                  <b>{f.label}</b>
                  <small>{f.desc}</small>
                </Link>
              );
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
