"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHead, Metric, RiskCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CARDS = [
  ["/app/focus", "🎥", "Focus Monitor", "Live focus %, distraction, blinks, yawns and a drowsiness alarm."],
  ["/app/speech", "🗣️", "Speech Coach", "Pronunciation, pace, fillers and a confidence score with tips."],
  ["/app/rooms", "💬", "Focus Rooms", "Real-time chat where everyone sees each other's live focus."],
  ["/app/lab", "🧪", "AI Lab", "Try each AI technology on its own: CV, NLP, Speech and ML."],
  ["/app/analytics", "📊", "Analytics", "History, speaking progress, leaderboard and conversation insights."],
];

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [fatigue, setFatigue] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/analytics/me")
      .then(setSummary)
      .catch((e) => setErr(e.message));
    api("/ml/fatigue/me")
      .then(setFatigue)
      .catch(() => {});
  }, []);

  const first = (user?.full_name || user?.username || "").split(" ")[0];
  return (
    <>
      <PageHead
        eyebrow="Dashboard"
        title={`Welcome back, ${first}`}
        highlight={first}
        sub="Here's where your focus and communication stand today."
      />
      {err && <div className="alert error">{err}</div>}
      {summary && (
        <div className="grid g5" style={{ marginBottom: 22 }}>
          <Metric v={summary.sessions} l="Focus sessions" />
          <Metric v={`${summary.avg_focus_pct}%`} l="Avg focus" />
          <Metric v={summary.total_minutes} l="Minutes tracked" />
          <Metric v={`${summary.avg_speech_confidence}%`} l="Speaking confidence" />
          <Metric v={summary.messages_sent} l="Messages sent" />
        </div>
      )}
      <div className="grid split-2-1">
        <section>
          <h2 style={{ fontSize: "1.2rem" }}>🚀 Jump back in</h2>
          <div className="grid g3">
            {CARDS.map(([href, icon, title, text]) => (
              <Link key={href} href={href} className="card feature-card">
                <div className="ic">{icon}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 style={{ fontSize: "1.2rem" }}>🧠 Fatigue risk</h2>
          {fatigue ? (
            <RiskCard f={fatigue} />
          ) : (
            <div className="card">
              <p>Finish a Focus Monitor session to get your machine-learning fatigue prediction.</p>
            </div>
          )}
          <h2 style={{ fontSize: "1.2rem" }}>🔐 Account</h2>
          <div className="card">
            <p>
              📧 {user?.email} {user?.email_verified ? "✅" : "⚠️"}
            </p>
            <p>
              📱 {user?.phone || "no mobile number"} {user?.phone ? (user.phone_verified ? "✅" : "⚠️") : ""}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
