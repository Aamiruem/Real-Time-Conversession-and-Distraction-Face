"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Metric, PageHead } from "@/components/ui";
import { api, toDate } from "@/lib/api";
import { STATE_COLORS } from "@/lib/attention";

const AXIS = { stroke: "#64748b", fontSize: 12 };
const TT = { contentStyle: { background: "#111a2e", border: "1px solid #1e2a44", borderRadius: 10 } };
const COLORS = ["#38bdf8", "#a78bfa", "#22c55e", "#eab308", "#f97316", "#ef4444", "#94a3b8"];
const day = (s) =>
  toDate(s).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Analytics() {
  const [tab, setTab] = useState("focus");
  const [summary, setSummary] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [speech, setSpeech] = useState([]);
  const [snaps, setSnaps] = useState([]);
  const [board, setBoard] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [ins, setIns] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([
      api("/analytics/me").then(setSummary),
      api("/attention/sessions").then(setSessions),
      api("/speech/sessions").then(setSpeech),
      api("/attention/snapshots?limit=500").then(setSnaps),
      api("/analytics/leaderboard").then(setBoard),
      api("/rooms").then((r) => {
        setRooms(r);
        setRoomId(r[0]?.id ?? null);
      }),
    ]).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (roomId)
      api(`/rooms/${roomId}/insights`)
        .then(setIns)
        .catch(() => {});
  }, [roomId]);

  const stateCounts = Object.entries(snaps.reduce((a, s) => ({ ...a, [s.state]: (a[s.state] ?? 0) + 1 }), {})).map(
    ([state, samples]) => ({ state, samples }),
  );

  return (
    <>
      <PageHead
        eyebrow="Insights"
        title="Analytics"
        highlight="Analytics"
        sub="Your focus history, speaking progress, leaderboard and conversation insights."
      />
      {err && <div className="alert error">{err}</div>}
      {summary && (
        <div className="grid g5" style={{ marginBottom: 20 }}>
          <Metric v={summary.sessions} l="Sessions" />
          <Metric v={summary.total_minutes} l="Minutes tracked" />
          <Metric v={`${summary.avg_focus_pct}%`} l="Avg focus" />
          <Metric v={`${summary.avg_distracted_pct}%`} l="Avg distracted" />
          <Metric v={`${summary.avg_speech_confidence}%`} l="Speaking confidence" />
        </div>
      )}
      <div className="tabs">
        {[
          ["focus", "🎯 Focus history"],
          ["speech", "🗣️ Speech progress"],
          ["live", "⏱️ Live samples"],
          ["board", "🏆 Leaderboard"],
          ["nlp", "🧠 Conversation insights"],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "focus" &&
        (sessions.length ? (
          <div className="card">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={sessions.map((s) => ({ ...s, when: day(s.started_at) }))}>
                <CartesianGrid stroke="#1e2a44" />
                <XAxis dataKey="when" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} />
                <Tooltip {...TT} />
                <Legend />
                <Line dataKey="focus_pct" name="Focused %" stroke="#22c55e" strokeWidth={2} />
                <Line dataKey="distracted_pct" name="Distracted %" stroke="#f97316" strokeWidth={2} />
                <Line dataKey="drowsy_pct" name="Drowsy %" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <table className="t" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Started</th>
                  <th>Minutes</th>
                  <th>Focus</th>
                  <th>Distracted</th>
                  <th>Drowsy</th>
                  <th>Blinks</th>
                  <th>Felt</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{day(s.started_at)}</td>
                    <td>{(s.duration_sec / 60).toFixed(1)}</td>
                    <td>{s.focus_pct}%</td>
                    <td>{s.distracted_pct}%</td>
                    <td>{s.drowsy_pct}%</td>
                    <td>{s.total_blinks}</td>
                    <td>{s.self_fatigue == null ? "—" : ["😀", "😐", "😫"][s.self_fatigue]}</td>
                    <td>
                      {s.report_url ? (
                        <a href={s.report_url} target="_blank" rel="noreferrer">
                          S3
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alert info">No saved sessions yet — finish one in the Focus Monitor.</div>
        ))}

      {tab === "speech" &&
        (speech.length ? (
          <div className="card">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={speech.map((s) => ({ ...s, when: day(s.created_at) }))}>
                <CartesianGrid stroke="#1e2a44" />
                <XAxis dataKey="when" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} />
                <Tooltip {...TT} />
                <Legend />
                {["confidence", "fluency", "pace", "clarity", "voice", "assertiveness", "eye_contact"].map((k, i) => (
                  <Line key={k} dataKey={k} stroke={COLORS[i]} strokeWidth={k === "confidence" ? 3 : 1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <table className="t" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Mode</th>
                  <th>Confidence</th>
                  <th>WPM</th>
                  <th>Fillers</th>
                  <th>Transcript</th>
                </tr>
              </thead>
              <tbody>
                {[...speech].reverse().map((s) => (
                  <tr key={s.id}>
                    <td>{day(s.created_at)}</td>
                    <td>{s.mode}</td>
                    <td>{s.confidence.toFixed(0)}%</td>
                    <td>{s.wpm}</td>
                    <td>{s.fillers}</td>
                    <td className="muted" style={{ maxWidth: 420 }}>
                      {s.transcript.slice(0, 120)}
                      {s.transcript.length > 120 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alert info">No speech sessions yet — record one in the Speech Coach.</div>
        ))}

      {tab === "live" &&
        (snaps.length ? (
          <div className="grid g2">
            <div className="card">
              <h3>Live focus % samples</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={snaps.map((s) => ({ ...s, when: toDate(s.timestamp).toLocaleTimeString() }))}>
                  <CartesianGrid stroke="#1e2a44" />
                  <XAxis dataKey="when" {...AXIS} />
                  <YAxis {...AXIS} domain={[0, 100]} />
                  <Tooltip {...TT} />
                  <Line dataKey="focus_pct" stroke="#38bdf8" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3>State distribution</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stateCounts}>
                  <CartesianGrid stroke="#1e2a44" />
                  <XAxis dataKey="state" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip {...TT} />
                  <Bar dataKey="samples">
                    {stateCounts.map((s) => (
                      <Cell key={s.state} fill={STATE_COLORS[s.state] ?? "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="alert info">No live samples yet.</div>
        ))}

      {tab === "board" &&
        (board.length ? (
          <div className="card">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={board}>
                <CartesianGrid stroke="#1e2a44" />
                <XAxis dataKey="username" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 100]} />
                <Tooltip {...TT} />
                <Bar dataKey="avg_focus_pct" name="Avg focus %" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="alert info">The leaderboard appears once sessions are saved.</div>
        ))}

      {tab === "nlp" &&
        (rooms.length ? (
          <div style={{ display: "grid", gap: 16 }}>
            <select style={{ maxWidth: 320 }} value={roomId ?? ""} onChange={(e) => setRoomId(Number(e.target.value))}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {ins && (
              <>
                <div className="grid g3">
                  <Metric v={ins.total_messages} l="Messages" />
                  <Metric v={ins.toxic_messages} l="Flagged toxic" />
                  <Metric v={Object.keys(ins.messages_per_user).length} l="Participants" />
                </div>
                <div className="card">
                  <p>
                    <b>📝 AI summary:</b> {ins.summary}
                  </p>
                  <p style={{ marginTop: 8 }}>
                    <b>🔑 Top keywords:</b>{" "}
                    {ins.top_keywords.map((k) => (
                      <span key={k} className="pill" style={{ marginRight: 6 }}>
                        {k}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="grid g3">
                  <div className="card">
                    <h3>Sentiment</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={Object.entries(ins.sentiment_distribution).map(([name, value]) => ({ name, value }))}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={80}
                        >
                          {Object.keys(ins.sentiment_distribution).map((k) => (
                            <Cell
                              key={k}
                              fill={{ positive: "#22c55e", neutral: "#94a3b8", negative: "#ef4444" }[k] ?? "#64748b"}
                            />
                          ))}
                        </Pie>
                        <Tooltip {...TT} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card">
                    <h3>Wording confidence</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={Object.entries(ins.confidence_by_user ?? {}).map(([user, confidence]) => ({
                          user,
                          confidence,
                        }))}
                      >
                        <XAxis dataKey="user" {...AXIS} />
                        <YAxis {...AXIS} domain={[0, 100]} />
                        <Tooltip {...TT} />
                        <Bar dataKey="confidence" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card">
                    <h3>Avg focus while chatting</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={Object.entries(ins.avg_focus_while_chatting).map(([user, focus]) => ({ user, focus }))}
                      >
                        <XAxis dataKey="user" {...AXIS} />
                        <YAxis {...AXIS} domain={[0, 100]} />
                        <Tooltip {...TT} />
                        <Bar dataKey="focus" fill="#22c55e" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="alert info">No rooms yet.</div>
        ))}
    </>
  );
}
