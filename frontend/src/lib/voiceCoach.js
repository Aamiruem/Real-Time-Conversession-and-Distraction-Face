// Spoken coaching: a (preferably female, natural-sounding) voice that guides you during focus sessions and
// interview practice — where to move your face, what to fix in the picture, and what to say instead.
// Uses the browser's built-in speech synthesis: free, private (nothing leaves the device), no API key.
//
// Never says the voice-command phrases ("start recording", "next question"…) so the command listener
// can't mistake the coach for you.
import { useEffect, useState, useSyncExternalStore } from "react";

const STORE_KEY = "presence.voiceCoach";
const GAP_MS = 3500; // quiet time between two live cues
const HOLD_MS = 1500; // a problem must last this long before it is mentioned

// Best first: neural/online voices, then the classic female voices of each platform
const FEMALE = [
  /neerja|aria|jenny|sonia|natasha|libby|michelle|emma|ava/i, // Microsoft Edge natural voices
  /google uk english female|google us english/i, // Chrome
  /zira|heera|hazel|susan|catherine|linda/i, // Windows
  /samantha|veena|karen|moira|tessa|fiona|serena|allison|victoria/i, // macOS / iOS
  /female|woman/i,
];
const MALE = /\b(david|mark|ravi|george|james|guy|ryan|daniel|alex|fred|male)\b/i;

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function load() {
  try {
    return { on: true, voiceURI: "", rate: 1, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { on: true, voiceURI: "", rate: 1 };
  }
}

/** English voices, best female voice first. */
export function rankVoices(voices) {
  const score = (v) => {
    const i = FEMALE.findIndex((re) => re.test(v.name));
    let s = i === -1 ? 50 : i * 5;
    if (MALE.test(v.name) && i === -1) s += 100;
    if (/natural|online|neural/i.test(v.name)) s -= 3;
    if (/en[-_]IN/i.test(v.lang)) s -= 1; // Indian English when available
    return s;
  };
  return voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(a) - score(b));
}

/** Text that reads well aloud: no markdown, symbols spelled out. */
export function speakable(text) {
  return String(text)
    .replace(/[*_`#]/g, "")
    .replace(/×\s*(\d+)/g, "$1 times")
    .replace(/\s\/\s/g, ", or ")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

class VoiceCoach {
  settings = load();
  listeners = new Set();
  voices = [];
  lastByKey = new Map();
  lastSpoke = 0;
  muted = false;
  lastText = "";
  hold = { key: null, since: 0 };

  constructor() {
    if (!supported()) return;
    const refresh = () => {
      this.voices = rankVoices(window.speechSynthesis.getVoices());
      this.emit();
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  emit() {
    this.snapshot = { ...this.settings, voices: this.voices, supported: supported(), lastText: this.lastText };
    this.listeners.forEach((l) => l());
  }
  getSnapshot = () => this.snapshot ?? (this.emit(), this.snapshot);

  update(patch) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.settings));
    } catch {
      /* private mode: settings last for this visit */
    }
    if (!this.settings.on) this.stop();
    this.emit();
  }

  get voice() {
    return this.voices.find((v) => v.voiceURI === this.settings.voiceURI) ?? this.voices[0] ?? null;
  }

  utter(text) {
    const line = speakable(text);
    const u = new SpeechSynthesisUtterance(line);
    u.onstart = () => {
      this.lastText = line; // the caption follows the sentence being spoken
      this.emit();
    };
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    }
    u.rate = this.settings.rate;
    u.pitch = 1.05; // a touch brighter and friendlier
    return u;
  }

  /** Speak now, interrupting anything else; resolves when finished (max `timeoutMs`). */
  say(text, timeoutMs = 8000) {
    if (!supported() || !this.settings.on || !text) return Promise.resolve();
    window.speechSynthesis.cancel();
    this.lastSpoke = Date.now();
    return new Promise((resolve) => {
      const u = this.utter(text);
      u.onend = u.onerror = resolve;
      window.speechSynthesis.speak(u);
      setTimeout(resolve, timeoutMs);
    });
  }

  /** Speak several sentences in order (feedback after an answer). Short sentences avoid Chrome's long-utterance cut-off. */
  sayAll(lines) {
    if (!supported() || !this.settings.on) return;
    window.speechSynthesis.cancel();
    for (const line of lines.filter(Boolean)) window.speechSynthesis.speak(this.utter(line));
    this.lastSpoke = Date.now();
  }

  /**
   * A live cue (key, text): spoken only if it has lasted HOLD_MS, isn't on cooldown and the coach isn't busy.
   * Call it on every metrics update with the current problem, or cue(null) when everything is fine.
   */
  cue(c, { cooldown = 15000, now = Date.now() } = {}) {
    if (!c) {
      this.hold = { key: null, since: 0 };
      return false;
    }
    const [key, text] = c;
    if (this.hold.key !== key) this.hold = { key, since: now };
    if (!supported() || !this.settings.on || this.muted) return false;
    if (now - this.hold.since < HOLD_MS) return false;
    if (now - (this.lastByKey.get(key) ?? -Infinity) < cooldown) return false;
    // busy: re-checked on the next metrics update, so a cue that is still true gets its turn (a stale one does not)
    if (now - this.lastSpoke < GAP_MS || window.speechSynthesis.speaking) return false;
    this.lastByKey.set(key, now);
    this.lastSpoke = now;
    window.speechSynthesis.speak(this.utter(text));
    return true;
  }

  /** Mention something once per `cooldown` without the hold time (session start, praise…). */
  once(key, text, cooldown = 60000) {
    const now = Date.now();
    if (!supported() || !this.settings.on || this.muted) return;
    if (now - (this.lastByKey.get(key) ?? -Infinity) < cooldown) return;
    this.lastByKey.set(key, now);
    this.lastSpoke = now;
    window.speechSynthesis.speak(this.utter(text));
  }

  /** Quiet while the microphone records your answer (the coach's voice would end up in the transcript). */
  setMuted(m) {
    this.muted = m;
    if (m) this.stop();
  }

  stop() {
    if (supported()) window.speechSynthesis.cancel();
  }

  reset() {
    this.stop();
    this.muted = false;
    this.lastText = "";
    this.emit();
    this.lastByKey.clear();
    this.hold = { key: null, since: 0 };
  }
}

export const voiceCoach = new VoiceCoach();

/** Settings + voices for the UI: { supported, on, voiceURI, rate, voices }. */
export function useVoiceCoach() {
  const snap = useSyncExternalStore(voiceCoach.subscribe, voiceCoach.getSnapshot, () => SERVER_SNAPSHOT);
  return snap;
}
const SERVER_SNAPSHOT = { on: false, voiceURI: "", rate: 1, voices: [], supported: false };

/** Stop talking when the page using the coach goes away. */
export function useVoiceCoachLifecycle() {
  const [coach] = useState(() => voiceCoach);
  useEffect(() => () => coach.reset(), [coach]);
  return coach;
}

// ---------- what to say ----------

/**
 * Where the face is, from MediaPipe face landmarks (raw camera coordinates — the preview is mirrored, the
 * landmarks are not). cx/cy: face centre (0-1); size: face width; turn: nose offset from the eye midpoint
 * in eye-widths (negative = turned towards the user's right); tilt: nose drop below the eye line in eye-widths.
 */
export function faceFrame(lm) {
  if (!lm) return null;
  let x0 = 1,
    y0 = 1,
    x1 = 0,
    y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const [eyeR, eyeL, nose] = [lm[33], lm[263], lm[1]];
  const eyeW = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeR.y) || 1e-6;
  const mid = { x: (eyeR.x + eyeL.x) / 2, y: (eyeR.y + eyeL.y) / 2 };
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    size: x1 - x0,
    turn: (nose.x - mid.x) / eyeW,
    tilt: (nose.y - mid.y) / eyeW,
  };
}

/** Learns your natural head tilt from the first steady frames, so "chin up/down" fits your face. */
export class TiltBaseline {
  samples = [];
  value = null;
  add(f) {
    if (this.value !== null || !f || Math.abs(f.turn) > 0.08) return;
    this.samples.push(f.tilt);
    if (this.samples.length >= 25) this.value = this.samples.sort((a, b) => a - b)[12];
  }
  reset() {
    this.samples = [];
    this.value = null;
  }
}

/** Position in the frame: closer / back / left / right / up / down. */
export function framingCue(f) {
  if (!f) return ["noface", "I can't see your face. Please sit in front of the camera."];
  if (f.size < 0.16) return ["closer", "Please move a little closer to the camera."];
  if (f.size > 0.45) return ["back", "You're a little too close. Please lean back a bit."];
  // a face on the image's left is on the user's right (the camera faces you)
  if (f.cx < 0.4) return ["left", "Please move a little to your left."];
  if (f.cx > 0.6) return ["right", "Please move a little to your right."];
  if (f.cy < 0.3) return ["down", "You're high in the frame. Move down a little, or tilt the camera up."];
  if (f.cy > 0.62) return ["up", "You're low in the frame. Sit up a little, or raise your camera."];
  return null;
}

/** Where the face points: turn back to the camera, chin up / down. */
export function headCue(f, baseTilt) {
  if (!f) return null;
  if (f.turn < -0.2) return ["turn-left", "Turn your face a little to your left, back to the camera."];
  if (f.turn > 0.2) return ["turn-right", "Turn your face a little to your right, back to the camera."];
  if (baseTilt !== null && baseTilt !== undefined) {
    if (f.tilt - baseTilt > 0.13) return ["chin-up", "Lift your chin a little and look at the camera."];
    if (f.tilt - baseTilt < -0.13) return ["chin-down", "Lower your chin a little."];
  }
  return null;
}

/** Picture quality: light and sharpness (from PresenceTracker.live). */
export function pictureCue(live) {
  if (!live?.brightness) return null;
  if (live.brightness < 85) return ["dark", "It's a bit dark. Turn on a light in front of you, not behind you."];
  if (live.brightness > 195) return ["bright", "There's too much light. Move away from the window or dim the light behind you."];
  if (live.sharpness && live.sharpness < 40) return ["blurry", "The picture is blurry. Please wipe your camera lens."];
  return null;
}

/** Focus session: what to say for the current attention state (attention.js metrics + faceFrame). */
export function focusCue(m, f, baseTilt) {
  switch (m.state) {
    case "Drowsy":
      return ["drowsy", "You look sleepy. Sit up straight and take a deep breath."];
    case "Yawning":
      return ["yawn", "Feeling tired? A quick stretch or a glass of water will help."];
    case "No Face":
      return ["noface", "I can't see you. Come back to the screen when you're ready."];
    case "Distracted":
      return headCue(f, baseTilt) ?? ["eyes", "Bring your eyes back to the screen."];
    default:
      return null;
  }
}

/** Spoken feedback after an interview answer: score, fillers, "don't say / say", pace, top tip, a strength. */
export function answerFeedback(report) {
  if (!report) return [];
  const iv = report.interview ?? {};
  const m = report.metrics ?? {};
  const lines = [];
  const score = Math.round(iv.readiness ?? report.confidence ?? 0);
  lines.push(`Your answer scored ${score} out of 100.`);
  if (report.strengths?.[0]) lines.push(`Well done: ${report.strengths[0]}.`);

  const fillers = Object.entries(m.filler_breakdown ?? {}).sort((a, b) => b[1] - a[1]);
  if (fillers.length && fillers[0][1] >= 2) {
    const [word, n] = fillers[0];
    lines.push(`You said "${word}" ${n} times. Next time, pause silently instead.`);
  }
  for (const s of (iv.swaps ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 2)) {
    if (/drop it/i.test(s.strong)) lines.push(`Drop the word "${s.weak}". ${s.why}`);
    else if (/^\(/.test(s.strong)) lines.push(`Instead of "${s.weak}", ${s.strong.replace(/[()]/g, "")}.`);
    else lines.push(`Don't say "${s.weak}". Say "${s.strong}" instead.`);
  }
  if (m.wpm > 175) lines.push("You spoke a little fast. Slow down and let your points land.");
  else if (m.wpm && m.wpm < 105) lines.push("Speak a little faster, with more energy.");
  const tip = iv.top_tips?.[0] ?? report.tips?.[0];
  if (tip?.tip) lines.push(`Most important: ${tip.tip}`);
  return lines.slice(0, 6);
}
