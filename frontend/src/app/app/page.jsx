"use client";

import Link from "next/link";
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
import { api } from "@/lib/api";
import { STATE_COLORS } from "@/lib/attention";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  ["/app/focus", "🎥", "Focus Monitor", "Live focus & drowsiness"],
  ["/app/speech", "🗣️", "Speech Coach", "Confidence & pronunciation"],
  ["/app/conversation", "🗨️", "Conversation Coach", "Fluency, tone, interaction"],
  ["/app/interview", "💼", "Interview Prep", "Mock interviews, any field"],
  ["/app/rooms", "💬", "Focus Rooms", "Chat with live focus"],
  ["/app/analytics", "📊", "Analytics", "History & leaderboard"],
  ["/app/lab", "🧪", "AI Lab", "Try each AI model"],
];

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
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/analytics/dashboard")
      .then(setD)
      .catch((e) => setErr(e.message));
  }, []);

  const first = (user?.full_name || user?.username || "").split(" ")[0];
  if (err)
    return (
      <div className="alert error">
        Could not load your dashboard: {err}. Is the backend running and up to date? (restart it with{" "}
        <code>uvicorn app.main:app --reload --port 8010</code> from <code>backend/</code>)
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
          <p className="muted">
            {k.streak_days
              ? `🔥 ${k.streak_days}-day streak — keep it going today.`
              : "Start a streak today — one focus session or one practice counts."}
          </p>
          <div className="row" style={{ marginTop: 16, flexWrap: "wrap", flex: "none" }}>
            <Link href="/app/focus" className="btn" style={{ flex: "none" }}>
              ▶ Start focus session
            </Link>
            <Link href="/app/interview" className="btn ghost" style={{ flex: "none" }}>
              💼 Mock interview
            </Link>
          </div>
        </div>
        <div className="goals">
          <div className="card-title">Today's goals</div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <GoalRing value={Math.round(d.today.focus_minutes)} goal={d.today.goal_focus_minutes} unit="min" label="Focus time" />
            <GoalRing value={d.today.practice} goal={d.today.goal_practice} unit="" label="Speaking practice" color={SERIES[2]} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- KPIs */}
      <div className="kpi-grid">
        <Kpi icon="🎯" value={`${k.avg_focus_pct}%`} label="Average focus" sub={`${k.focus_sessions} sessions`} />
        <Kpi
          icon="⏱️"
          value={`${Math.round(k.week_minutes)} min`}
          label="Focus this week"
          sub={`${weekDelta >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(weekDelta))} min vs last week`}
          trend={weekDelta >= 0 ? "up" : "down"}
        />
        <Kpi icon="🗣️" value={`${k.avg_confidence}%`} label="Speaking confidence" sub={`${k.practice_sessions} practices`} />
        <Kpi
          icon="💼"
          value={k.latest_readiness == null ? "—" : `${Math.round(k.latest_readiness)}%`}
          label="Interview readiness"
          sub={k.best_readiness == null ? "no mock interview yet" : `best ${Math.round(k.best_readiness)}% · ${k.interview_answers} answer${k.interview_answers === 1 ? "" : "s"}`}
        />
        <Kpi icon="🔥" value={k.streak_days} label="Day streak" sub={`${k.messages_sent} room messages`} />
        <Kpi
          icon="🏆"
          value={k.rank ? `#${k.rank}` : "—"}
          label="Focus leaderboard"
          sub={k.rank ? `of ${k.ranked_users} people` : "do a focus session to rank"}
        />
      </div>

      {/* ---------------------------------------------------------------- activity + next steps */}
      <div className="grid split-2-1 dash-top">
        <ChartCard title="Focus minutes per day" sub="Last 14 days · hover a bar for practice and messages">
          <div className="chart-box" style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={d.activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <ReferenceLine y={d.today.goal_focus_minutes} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "daily goal", fill: "#94a3b8", fontSize: 11, position: "insideTopRight" }} />
                <Tooltip
                  {...TOOLTIP}
                  cursor={{ fill: "#ffffff0a" }}
                  formatter={(v, name, p) => [`${v} min · ${p.payload.practice} practice · ${p.payload.messages} msgs`, "Focus"]}
                />
                <Bar dataKey="focus_minutes" name="Focus minutes" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <ChartCard title="✨ Next steps" sub="Picked from your own data">
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
          {d.fatigue ? (
            <RiskCard f={d.fatigue} />
          ) : (
            <ChartCard title="🧠 Fatigue risk">
              <p className="small">Finish a focus session to get your machine-learning fatigue prediction.</p>
            </ChartCard>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- focus */}
      <div className="grid g3 dash-row">
        <ChartCard title="Focus by session" sub="Focus % in your last sessions">
          {d.focus_trend.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={d.focus_trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP} formatter={(v, n, p) => [`${v}% · ${p.payload.minutes} min`, "Focus"]} />
                  <Line type="monotone" dataKey="focus" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#111a2e" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="🎥" text="No focus sessions yet." href="/app/focus" cta="Start one" />
          )}
        </ChartCard>
        <ChartCard title="Where your time goes" sub="Average across all focus sessions">
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
        <ChartCard title="Speaking skills" sub="Average across your recordings">
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
        <ChartCard title="Speaking confidence" sub="Each Speech, Conversation or Interview recording">
          {d.speech_trend.length ? (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={d.speech_trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} />
                  <ReferenceLine y={70} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "confident", fill: "#94a3b8", fontSize: 11, position: "insideTopLeft" }} />
                  <Tooltip {...TOOLTIP} formatter={(v, n, p) => [`${v}% · ${p.payload.mode}`, "Confidence"]} />
                  <Line type="monotone" dataKey="confidence" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#111a2e" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart icon="🎙️" text="Your confidence trend appears after your first recording." href="/app/speech" cta="Record now" />
          )}
        </ChartCard>
        <ChartCard
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
                    cursor={{ fill: "#ffffff0a" }}
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
        <ChartCard title="Recent activity">
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
        <ChartCard title="Explore">
          <div className="explore">
            {FEATURES.map(([href, icon, title, text]) => (
              <Link key={href} href={href}>
                <span>{icon}</span>
                <b>{title}</b>
                <small>{text}</small>
              </Link>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
