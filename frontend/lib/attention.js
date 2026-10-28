export const LEFT_EYE = [362, 385, 387, 263, 373, 380];
export const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
export const LEFT_IRIS = 473;
export const RIGHT_IRIS = 468;
const MOUTH = { top: 13, bottom: 14, left: 78, right: 308 };

export const STATES = ["Focused", "Distracted", "Drowsy", "Yawning", "No Face"];
export const STATE_COLORS = {
  Focused: "#22c55e",
  Distracted: "#f97316",
  Drowsy: "#ef4444",
  Yawning: "#eab308",
  "No Face": "#94a3b8",
  "Offline cam": "#64748b",
};
export const STATE_EMOJI = {
  Focused: "🎯",
  Distracted: "👀",
  Drowsy: "😴",
  Yawning: "🥱",
  "No Face": "❔",
  "Offline cam": "📷",
};

export const THRESHOLDS = {
  earClosed: 0.21, // below this the eye counts as closed
  drowsySeconds: 1.2, // eyes closed this long -> drowsy
  marYawn: 0.6,
  yawnSeconds: 0.8,
  yawLimit: 25, // degrees
  pitchLimit: 20,
  gazeLow: 0.38,
  gazeHigh: 0.62,
  distractSeconds: 1.5,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function eyeAspectRatio(pts, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => pts[i]);
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4) + 1e-6);
}

/** Euler angles (degrees) from MediaPipe's 4x4 column-major facial transformation matrix. */
export function headPose(m) {
  const r = (row, col) => m[col * 4 + row];
  const deg = 180 / Math.PI;
  const pitch = Math.atan2(r(2, 1), r(2, 2)) * deg;
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * deg;
  const roll = Math.atan2(r(1, 0), r(0, 0)) * deg;
  return { yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), roll: +roll.toFixed(1) };
}

export class AttentionEngine {
  t = THRESHOLDS;
  start = 0;
  last = null;
  stateTime = { Focused: 0, Distracted: 0, Drowsy: 0, Yawning: 0, "No Face": 0 };
  eyeClosedSince = null;
  yawnSince = null;
  awaySince = null;
  eyeWasClosed = false;
  yawnCounted = false;
  blinkTimes = [];
  earSum = 0;
  earN = 0;
  frameTimes = [];
  lastTimeline = 0;
  m = AttentionEngine.empty();

  static empty() {
    return {
      state: "No Face",
      ear: 0,
      mar: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      gaze: "center",
      blinksTotal: 0,
      blinksPerMin: 0,
      yawnsTotal: 0,
      fps: 0,
      focusPct: 0,
      distractedPct: 0,
      drowsyPct: 0,
      noFacePct: 0,
      elapsedSec: 0,
      avgEar: 0,
      alarm: false,
      faceX: 0.5,
      timeline: [],
    };
  }

  constructor() {
    this.reset();
  }

  reset() {
    this.start = performance.now() / 1000;
    this.last = null;
    this.stateTime = { Focused: 0, Distracted: 0, Drowsy: 0, Yawning: 0, "No Face": 0 };
    this.eyeClosedSince = this.yawnSince = this.awaySince = null;
    this.eyeWasClosed = this.yawnCounted = false;
    this.blinkTimes = [];
    this.earSum = this.earN = 0;
    this.frameTimes = [];
    this.lastTimeline = 0;
    this.m = AttentionEngine.empty();
  }

  /** Feed one video frame's result. `landmarks` are normalised (0..1); w/h are the frame size in pixels. */
  update(landmarks, matrix, w, h) {
    const now = performance.now() / 1000;
    const dt = this.last === null ? 0 : Math.min(now - this.last, 1);
    this.last = now;
    this.frameTimes.push(now);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    const m = this.m;
    if (this.frameTimes.length > 1) {
      m.fps = (this.frameTimes.length - 1) / (this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0] + 1e-6);
    }

    let state;
    if (!landmarks?.length) {
      state = "No Face";
      this.eyeClosedSince = this.yawnSince = this.awaySince = null;
    } else {
      const pts = landmarks.map((p) => ({ x: p.x * w, y: p.y * h }));
      state = this.analyze(pts, matrix, now);
      // where the face sits on screen (the video is mirrored), so overlays can stay out of its way
      let x0 = 1,
        x1 = 0;
      for (const p of landmarks) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
      }
      this.m.faceX = 1 - (x0 + x1) / 2;
    }
    m.state = state;
    this.stateTime[state] += dt;
    this.percentages(now);
  }

  analyze(pts, matrix, now) {
    const { t, m } = this;
    // eyes, blinks, drowsiness
    const ear = (eyeAspectRatio(pts, LEFT_EYE) + eyeAspectRatio(pts, RIGHT_EYE)) / 2;
    m.ear = +ear.toFixed(3);
    this.earSum += ear;
    this.earN += 1;
    const closed = ear < t.earClosed;
    if (closed && this.eyeClosedSince === null) this.eyeClosedSince = now;
    if (!closed) {
      if (this.eyeWasClosed && this.eyeClosedSince !== null && now - this.eyeClosedSince < t.drowsySeconds) {
        m.blinksTotal += 1;
        this.blinkTimes.push(now);
      }
      this.eyeClosedSince = null;
    }
    this.eyeWasClosed = closed;
    this.blinkTimes = this.blinkTimes.filter((b) => now - b <= 60);
    m.blinksPerMin = this.blinkTimes.length;
    const drowsy = this.eyeClosedSince !== null && now - this.eyeClosedSince >= t.drowsySeconds;

    // mouth, yawns
    const mar = dist(pts[MOUTH.top], pts[MOUTH.bottom]) / (dist(pts[MOUTH.left], pts[MOUTH.right]) + 1e-6);
    m.mar = +mar.toFixed(3);
    if (mar > t.marYawn) {
      this.yawnSince ??= now;
      if (now - this.yawnSince >= t.yawnSeconds && !this.yawnCounted) {
        m.yawnsTotal += 1;
        this.yawnCounted = true;
      }
    } else {
      this.yawnSince = null;
      this.yawnCounted = false;
    }
    const yawning = this.yawnSince !== null && now - this.yawnSince >= t.yawnSeconds;

    // head pose + gaze
    if (matrix) Object.assign(m, headPose(matrix));
    const r = (pts[RIGHT_IRIS].x - pts[33].x) / (pts[133].x - pts[33].x + 1e-6);
    const l = (pts[LEFT_IRIS].x - pts[362].x) / (pts[263].x - pts[362].x + 1e-6);
    const ratio = (r + l) / 2;
    m.gaze = ratio < t.gazeLow ? "right" : ratio > t.gazeHigh ? "left" : "center"; // camera image is not mirrored

    const away = Math.abs(m.yaw) > t.yawLimit || Math.abs(m.pitch) > t.pitchLimit || m.gaze !== "center";
    if (away) this.awaySince ??= now;
    else this.awaySince = null;
    const distracted = this.awaySince !== null && now - this.awaySince >= t.distractSeconds;

    if (drowsy) return "Drowsy";
    if (yawning) return "Yawning";
    if (distracted) return "Distracted";
    return "Focused";
  }

  percentages(now) {
    const st = this.stateTime;
    const total = Object.values(st).reduce((a, b) => a + b, 0) || 1e-6;
    const m = this.m;
    const pct = (v) => +((100 * v) / total).toFixed(1);
    m.focusPct = pct(st.Focused);
    m.distractedPct = pct(st.Distracted);
    m.drowsyPct = pct(st.Drowsy + st.Yawning);
    m.noFacePct = pct(st["No Face"]);
    m.elapsedSec = +(now - this.start).toFixed(1);
    m.avgEar = this.earN ? +(this.earSum / this.earN).toFixed(3) : 0;
    m.alarm = m.state === "Drowsy";
    if (now - this.lastTimeline >= 2) {
      this.lastTimeline = now;
      m.timeline.push({ t: m.elapsedSec, state: m.state, focus_pct: m.focusPct, ear: m.ear });
    }
  }

  metrics() {
    return { ...this.m, timeline: [...this.m.timeline] };
  }
}

/** Payload for POST /attention/update */
export const livePayload = (m) => ({
  state: m.state,
  focus_pct: m.focusPct,
  distracted_pct: m.distractedPct,
  ear: m.ear,
  yaw: m.yaw,
  pitch: m.pitch,
  gaze: m.gaze,
});

/** Payload for POST /attention/sessions */
export const sessionPayload = (m, startedAt) => ({
  started_at: startedAt,
  duration_sec: m.elapsedSec,
  focus_pct: m.focusPct,
  distracted_pct: m.distractedPct,
  drowsy_pct: m.drowsyPct,
  no_face_pct: m.noFacePct,
  total_blinks: m.blinksTotal,
  total_yawns: m.yawnsTotal,
  avg_ear: m.avgEar,
  timeline: m.timeline,
});
