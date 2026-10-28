// Builds the dashboard in the browser from endpoints every backend version has, for when the backend is too old
// to have GET /analytics/dashboard. Same shape (and the same rules) as backend/app/routers/analytics_routes.py;
// only the interview-readiness history needs the new backend, because it lives inside saved reports.
import { api, toDate } from "./api";

const GOAL_FOCUS_MINUTES = 30;
const GOAL_PRACTICE = 2;
const SKILLS = { fluency: "Fluency", pace: "Pace", clarity: "Clarity", voice: "Voice", assertiveness: "Confidence", eye_contact: "Eye contact" };
const SKILL_PAGE = { fluency: "/app/speech", pace: "/app/speech", clarity: "/app/speech", voice: "/app/conversation", assertiveness: "/app/conversation", eye_contact: "/app/focus" };
const KINDS = { interview: ["💼", "Mock interview", "/app/interview"], conversation: ["🗨️", "Conversation practice", "/app/conversation"] };

const dayKey = (d) => d.toISOString().slice(0, 10);
const label = (d) => d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
const round1 = (v) => Math.round(v * 10) / 10;

export async function buildDashboardFallback(username) {
  const [focus, speech, msgsSummary, fatigue, board] = await Promise.all([
    api("/attention/sessions"),
    api("/speech/sessions"),
    api("/analytics/me"),
    api("/ml/fatigue/me").catch(() => null),
    api("/analytics/leaderboard").catch(() => []),
  ]);
  const f = focus.map((s) => ({ ...s, at: toDate(s.started_at) })).sort((a, b) => a.at - b.at);
  const sp = speech.map((s) => ({ ...s, at: toDate(s.created_at) })).sort((a, b) => a.at - b.at);

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getTime() - (13 - i) * 864e5));
  const perDay = Object.fromEntries(days.map((d) => [dayKey(d), { focus_minutes: 0, practice: 0, messages: 0 }]));
  const active = new Set();
  for (const s of f) {
    active.add(dayKey(s.at));
    if (perDay[dayKey(s.at)]) perDay[dayKey(s.at)].focus_minutes += s.duration_sec / 60;
  }
  for (const s of sp) {
    active.add(dayKey(s.at));
    if (perDay[dayKey(s.at)]) perDay[dayKey(s.at)].practice += 1;
  }
  let streak = 0;
  let d = active.has(dayKey(today)) ? today : new Date(today.getTime() - 864e5);
  while (active.has(dayKey(d))) {
    streak += 1;
    d = new Date(d.getTime() - 864e5);
  }
  const weekCut = dayKey(new Date(today.getTime() - 7 * 864e5));
  const week = Object.entries(perDay).reduce((a, [k, v]) => a + (k > weekCut ? v.focus_minutes : 0), 0);
  const lastWeek = Object.entries(perDay).reduce((a, [k, v]) => a + (k <= weekCut ? v.focus_minutes : 0), 0);

  const avg = (attr) => (f.length ? round1(f.reduce((a, s) => a + s[attr], 0) / f.length) : 0);
  const skills = Object.keys(SKILLS)
    .map((k) => {
      const vals = sp.map((s) => s[k]).filter((v) => v != null);
      return vals.length ? { key: k, label: SKILLS[k], score: round1(vals.reduce((a, b) => a + b, 0) / vals.length) } : null;
    })
    .filter(Boolean);

  const recent = [
    ...f.slice(-8).map((s) => ({
      kind: "focus", icon: "🎥", title: `Focus session · ${Math.round(s.duration_sec / 60)} min`, score: Math.round(s.focus_pct),
      score_label: "focus", when: s.at.toISOString(), href: "/app/focus",
    })),
    ...sp.slice(-8).map((s) => {
      const [icon, title, href] = KINDS[s.mode] ?? ["🗣️", "Speech practice", "/app/speech"];
      return { kind: s.mode, icon, title, detail: s.prompt.slice(0, 80), score: Math.round(s.confidence), score_label: "confidence", when: s.at.toISOString(), href };
    }),
  ].sort((a, b) => (a.when < b.when ? 1 : -1));

  const rankIdx = board.findIndex((r) => r.username === username);
  const t = perDay[dayKey(today)];
  const steps = [];
  if (fatigue?.risk === "high") steps.push({ icon: "😴", text: "High fatigue risk — take a 10-minute break first", href: "/app/focus" });
  if (t.focus_minutes < GOAL_FOCUS_MINUTES)
    steps.push({ icon: "🎥", text: `Do a focus session — ${Math.round(GOAL_FOCUS_MINUTES - t.focus_minutes)} min left for today's goal`, href: "/app/focus" });
  if (skills.length) {
    const weak = skills.reduce((a, b) => (b.score < a.score ? b : a));
    steps.push({ icon: "🎯", text: `Your weakest speaking skill is ${weak.label.toLowerCase()} (${Math.round(weak.score)}%) — practise it`, href: SKILL_PAGE[weak.key] });
  } else steps.push({ icon: "🗣️", text: "Record your first speech to get a confidence score", href: "/app/speech" });
  steps.push({ icon: "💼", text: "Try a mock interview for your job field", href: "/app/interview" });

  const conf = sp.map((s) => s.confidence);
  return {
    limited: true,
    kpis: {
      focus_sessions: f.length,
      focus_minutes: round1(f.reduce((a, s) => a + s.duration_sec, 0) / 60),
      avg_focus_pct: avg("focus_pct"),
      avg_distracted_pct: avg("distracted_pct"),
      practice_sessions: sp.length,
      avg_confidence: conf.length ? round1(conf.reduce((a, b) => a + b, 0) / conf.length) : 0,
      interview_answers: sp.filter((s) => s.mode === "interview").length,
      latest_readiness: null,
      best_readiness: null,
      messages_sent: msgsSummary.messages_sent ?? 0,
      streak_days: streak,
      week_minutes: round1(week),
      last_week_minutes: round1(lastWeek),
      rank: rankIdx >= 0 ? rankIdx + 1 : null,
      ranked_users: board.length,
    },
    today: { focus_minutes: round1(t.focus_minutes), practice: t.practice, goal_focus_minutes: GOAL_FOCUS_MINUTES, goal_practice: GOAL_PRACTICE },
    activity: days.map((day) => ({
      date: dayKey(day),
      label: day.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", timeZone: "UTC" }),
      ...Object.fromEntries(Object.entries(perDay[dayKey(day)]).map(([k, v]) => [k, round1(v)])),
    })),
    state_split: { Focused: avg("focus_pct"), Distracted: avg("distracted_pct"), Drowsy: avg("drowsy_pct"), "No Face": avg("no_face_pct") },
    focus_trend: f.slice(-12).map((s) => ({
      label: label(s.at), focus: round1(s.focus_pct), distracted: round1(s.distracted_pct), drowsy: round1(s.drowsy_pct), minutes: round1(s.duration_sec / 60),
    })),
    speech_trend: sp.slice(-12).map((s) => ({ label: label(s.at), confidence: round1(s.confidence), mode: s.mode })),
    skills,
    interview_trend: [],
    latest_conversation: null,
    recent: recent.slice(0, 8),
    fatigue,
    next_steps: steps.slice(0, 4),
  };
}
