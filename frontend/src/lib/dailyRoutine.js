// Daily routine: categories, the starting templates, and the maths (today's blocks incl. namaz, now/next, totals).
import { prayerTimes, PRAYERS } from "./prayerTimes";

export const CATEGORIES = {
  sleep: { label: "Sleep", color: "#475569", icon: "moon" },
  faith: { label: "Namaz & faith", color: "#0d9488", icon: "crescent" },
  coding: { label: "Coding (AI/ML)", color: "#2563eb", icon: "code" },
  work: { label: "Work", color: "#0284c7", icon: "briefcase" },
  learning: { label: "Learning & reading", color: "#7c3aed", icon: "book" },
  speaking: { label: "English speaking", color: "#db2777", icon: "mic" },
  health: { label: "Exercise, yoga & gym", color: "#16a34a", icon: "dumbbell" },
  leisure: { label: "Fun: games & videos", color: "#d97706", icon: "gamepad" },
  personal: { label: "Meals, family & planning", color: "#ca8a04", icon: "users" },
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const b = (id, start, minutes, category, title, note = "", link = "", days) => ({ id, start, minutes, category, title, note, link, ...(days ? { days } : {}) });

// A professional AI/ML day built around deep work, with speaking practice, exercise, rest and fun in proportion.
// Namaz blocks are added automatically at the real times for your location (they're not in the template).
export const TEMPLATES = {
  "aiml-pro": {
    label: "AI/ML professional",
    blocks: [
      b("quran", "05:30", 15, "faith", "Quran & reflection", "A few verses after Fajr, calm start before screens."),
      b("yoga", "05:45", 20, "health", "Yoga & breathing", "Anulom Vilom, sun salutations, stretches — follow the guided routine.", "/app/vision"),
      b("gym", "06:05", 45, "health", "Gym — strength training", "Compound lifts: squat, push, pull. Log your sets.", "", [1, 3, 5]),
      b("run", "06:05", 35, "health", "Run or brisk walk", "Easy pace, nose breathing; 3–5 km.", "", [0, 2, 4, 6]),
      b("breakfast", "06:55", 25, "personal", "Shower & breakfast", "Protein + fruit; water bottle filled for the day."),
      b("reading", "07:20", 30, "learning", "Reading — AI/ML", "One paper section or 10 pages of a technical book; write 3 takeaways."),
      b("english", "07:50", 20, "speaking", "English speaking practice", "Talk 2 minutes on a topic, read a paragraph aloud — get your confidence score.", "/app/speech"),
      b("plan", "08:15", 15, "personal", "Plan the day", "Pick the 3 most important tasks; phone on Do Not Disturb."),
      b("deep1", "08:30", 150, "coding", "Deep work — AI/ML coding", "Hardest task first: model code, experiments. Notifications off.", "/app/focus", WEEKDAYS),
      b("break1", "11:00", 10, "health", "Movement break", "Walk, water, 20-20-20 eye rule.", "", WEEKDAYS),
      b("work", "11:10", 80, "work", "Meetings, email, code review", "Batch communication here so deep work stays deep.", "", WEEKDAYS),
      b("lunch", "12:30", 45, "personal", "Lunch & rest", "Away from the screen."),
      b("deep2", "13:15", 135, "coding", "Deep work — training & debugging", "Run/analyse experiments, fix bugs, write tests.", "/app/focus", WEEKDAYS),
      b("walk", "15:45", 15, "health", "Short walk", "Outside if you can — sunlight resets energy."),
      b("learn", "16:00", 90, "learning", "Learning — courses & DSA", "One course lesson + 2 coding problems (LeetCode / Kaggle).", "/app/lab"),
      b("talk", "17:30", 30, "speaking", "English conversation / mock interview", "Real conversation practice or one interview answer with feedback.", "/app/conversation"),
      b("family", "18:15", 45, "personal", "Family & dinner", "Phone away."),
      b("fun", "19:15", 60, "leisure", "Games & videos", "Enjoy — with a timer, so it stays one hour."),
      b("side", "20:15", 45, "coding", "Side project / Kaggle / GitHub", "Small daily commits to your portfolio project."),
      b("review", "21:00", 15, "personal", "Review & plan tomorrow", "Journal: what went well, what's next. Tick off today.", "/app"),
      b("winddown", "21:15", 45, "leisure", "Wind down — no screens", "Light reading, family time; dim lights."),
      b("sleep", "22:00", 420, "sleep", "Sleep", "7 hours. Same time every day — the biggest focus booster."),
      // weekend versions of the work blocks
      b("project", "08:30", 180, "coding", "Weekend build — personal AI project", "Ship one feature or one experiment end to end.", "/app/focus", WEEKEND),
      b("outing", "12:00", 150, "leisure", "Friends, outing, gaming session", "Recharge properly — this is part of the plan.", "", WEEKEND),
    ],
  },
  student: {
    label: "Student — exams & coding",
    blocks: [
      b("quran", "05:30", 15, "faith", "Quran & reflection"),
      b("yoga", "05:45", 20, "health", "Yoga & stretching", "", "/app/vision"),
      b("study1", "06:15", 90, "learning", "Revision — hardest subject", "Active recall + past papers.", "/app/focus"),
      b("breakfast", "07:45", 30, "personal", "Breakfast & get ready"),
      b("college", "08:30", 300, "work", "College / classes", "", "", WEEKDAYS),
      b("lunch", "13:30", 45, "personal", "Lunch & rest"),
      b("code", "14:30", 120, "coding", "Coding practice — AI/ML & DSA", "", "/app/focus"),
      b("gym", "16:45", 60, "health", "Gym / sport"),
      b("english", "18:00", 30, "speaking", "English speaking & interview practice", "", "/app/interview"),
      b("fun", "19:30", 60, "leisure", "Games & videos (timer on)"),
      b("study2", "20:30", 75, "learning", "Study — notes & reading"),
      b("sleep", "22:30", 420, "sleep", "Sleep"),
    ],
  },
};

export const DEFAULT_PRAYER = { enabled: true, method: "karachi", asr: "hanafi", lat: null, lng: null, place: "", minutes: 15 };
export const newPlan = (template = "aiml-pro") => ({
  template,
  blocks: TEMPLATES[template].blocks.map((x) => ({ days: [0, 1, 2, 3, 4, 5, 6], ...x })),
  prayer: { ...DEFAULT_PRAYER },
  reminders: false,
});

export const CITIES = [
  ["Delhi", 28.6139, 77.209],
  ["Mumbai", 19.076, 72.8777],
  ["Hyderabad", 17.385, 78.4867],
  ["Bengaluru", 12.9716, 77.5946],
  ["Lucknow", 26.8467, 80.9462],
  ["Kolkata", 22.5726, 88.3639],
  ["Karachi", 24.8607, 67.0011],
  ["Lahore", 31.5204, 74.3587],
  ["Dhaka", 23.8103, 90.4125],
  ["Dubai", 25.2048, 55.2708],
  ["Riyadh", 24.7136, 46.6753],
  ["Makkah", 21.4225, 39.8262],
  ["London", 51.5074, -0.1278],
  ["New York", 40.7128, -74.006],
];

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (min) => `${String(Math.floor(fix(min) / 60)).padStart(2, "0")}:${String(fix(min) % 60).padStart(2, "0")}`;
const fix = (m) => ((Math.round(m) % 1440) + 1440) % 1440;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Today's prayer times for the plan's location, or null (no location / prayers off / polar day). */
export function todaysPrayers(plan, date = new Date()) {
  const p = plan?.prayer;
  if (!p?.enabled || p.lat == null || p.lng == null) return null;
  return prayerTimes(date, { lat: p.lat, lng: p.lng, method: p.method, asr: p.asr });
}

/**
 * Blocks for `date`: the plan's blocks for that weekday + a namaz block at each prayer time (Jumu'ah on Fridays),
 * sorted by start. Each block gets `startMin`/`endMin` (minutes since midnight; may pass 1440 for overnight sleep)
 * and `during` = the title of a longer block a prayer falls inside ("pause for Asr during Deep work").
 */
export function blocksFor(plan, date = new Date()) {
  if (!plan) return [];
  const wd = date.getDay();
  const blocks = plan.blocks
    .filter((x) => (x.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(wd))
    .map((x) => ({ ...x, startMin: toMin(x.start), endMin: toMin(x.start) + x.minutes }));
  const times = todaysPrayers(plan, date);
  if (times) {
    for (const [key, name] of PRAYERS) {
      const t = times[key];
      const startMin = t.getHours() * 60 + t.getMinutes();
      const jumuah = key === "dhuhr" && wd === 5;
      const minutes = jumuah ? 45 : key === "fajr" ? Math.max(plan.prayer.minutes, 20) : plan.prayer.minutes;
      const host = blocks.find((x) => x.category !== "faith" && x.category !== "sleep" && x.startMin < startMin && x.endMin > startMin + 1);
      blocks.push({
        id: `prayer-${key}`,
        title: jumuah ? "Jumu'ah — Friday prayer" : `${name} namaz`,
        start: fromMin(startMin),
        minutes,
        category: "faith",
        note: jumuah ? "Khutbah + congregational prayer — leave a little early." : "Wudu, prayer and a moment of dhikr.",
        link: "",
        prayer: key,
        startMin,
        endMin: startMin + minutes,
        during: host?.title ?? null,
      });
    }
  }
  return blocks.sort((a, z) => a.startMin - z.startMin);
}

/** The block happening at `minute` (prayers win over the block they pause), and the next one to start. */
export function nowAndNext(blocks, minute) {
  const inside = (x) => (x.startMin <= minute && minute < x.endMin) || (x.endMin > 1440 && minute < x.endMin - 1440);
  const now = blocks.filter(inside).sort((a, z) => (a.category === "faith" ? -1 : 0) - (z.category === "faith" ? -1 : 0) || z.startMin - a.startMin)[0] ?? null;
  const next = blocks.find((x) => x.startMin > minute) ?? blocks[0] ?? null;
  return { now, next };
}

/** Hours per category in a day's blocks (prayer time is taken out of the block it pauses). */
export function categoryHours(blocks) {
  const totals = {};
  for (const x of blocks) totals[x.category] = (totals[x.category] ?? 0) + x.minutes;
  for (const x of blocks) {
    if (x.during) {
      const host = blocks.find((h) => h.title === x.during);
      if (host) totals[host.category] -= x.minutes;
    }
  }
  return Object.entries(totals)
    .filter(([, m]) => m > 0)
    .map(([k, m]) => ({ key: k, hours: m / 60, ...CATEGORIES[k] }))
    .sort((a, z) => z.hours - a.hours);
}
