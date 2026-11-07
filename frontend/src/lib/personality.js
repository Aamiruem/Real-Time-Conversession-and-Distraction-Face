// Presence Studio's report: face, body and voice measurements -> area scores, the impression you give (personality
// traits as others perceive them) and prioritised suggestions. Same thresholds as the interview coach
// (backend/interview/coach.py) where both measure the same thing.

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
/** 100 inside [lo, hi], falling off linearly outside (to 0 at `span` away). */
const band = (v, lo, hi, span) => (v == null ? 60 : v < lo ? 100 - ((lo - v) / span) * 100 : v > hi ? 100 - ((v - hi) / span) * 100 : 100);

export const TRAITS = {
  confident: { label: "Confident", text: "steady eye contact, upright posture and a clear voice" },
  warm: { label: "Warm", text: "smiles, a lively face and a friendly, varied tone" },
  energetic: { label: "Energetic", text: "gestures, vocal energy and a lively pitch" },
  composed: { label: "Composed", text: "calm hands, a steady head and well-placed pauses" },
  engaged: { label: "Engaged", text: "you stay in frame, look at the camera and keep talking" },
};

/**
 * @param {{ eye: number, face: object, body: object, voice: object }} m eye = focus % while speaking;
 *   face = PresenceTracker.summary(); body = BodyTracker.summary(); voice = VoiceAnalyser.summary()
 */
export function presenceReport({ eye = 0, face = {}, body = {}, voice = {} }) {
  const smile = face.smile_pct ?? 0;
  const expr = face.expressiveness;
  const tilt = Math.abs(face.head_tilt ?? 0);
  const slouch = body.slouch_pct ?? 0;
  const act = body.gesture_activity;
  const hands = body.hands_visible_pct ?? 0;
  const touch = body.face_touch_pct ?? 0;
  const crossed = body.arms_crossed_pct ?? 0;
  const speak = voice.speaking_pct ?? 0;
  const loud = voice.loudness_db;
  const energy = voice.energy_variation;
  const pitchVar = voice.pitch_variation;
  const longPauses = voice.long_pauses ?? 0;
  const minutes = Math.max((voice.seconds ?? 0) / 60, 0.25);

  const gestureScore = hands < 15 ? 60 : act == null ? 75 : act < 0.02 ? 65 : act <= 0.12 ? 100 : Math.max(50, 100 - (act - 0.12) * 300);
  const areas = {
    face: clamp(eye * 0.55 + (face.face_visible_pct ?? 0) * 0.15 + band(expr, 8, 30, 20) * 0.15 + band(smile, 15, 70, 40) * 0.15),
    body: clamp((100 - slouch * 0.9) * 0.45 + gestureScore * 0.35 + (100 - touch * 2) * 0.1 + (100 - crossed * 1.5) * 0.1),
    voice: clamp(band(speak, 45, 85, 45) * 0.3 + band(loud, -38, -14, 15) * 0.25 + band(energy, 4, 11, 6) * 0.2
      + band(pitchVar, 12, 32, 15) * 0.25 - (longPauses / minutes) * 4),
  };
  const overall = clamp(areas.face * 0.35 + areas.body * 0.3 + areas.voice * 0.35);

  const traits = {
    confident: clamp(eye * 0.35 + (100 - slouch) * 0.25 + band(loud, -34, -12, 15) * 0.25 + (100 - (longPauses / minutes) * 15) * 0.15),
    warm: clamp(band(smile, 20, 80, 30) * 0.45 + band(expr, 10, 30, 15) * 0.25 + band(pitchVar, 15, 35, 15) * 0.3),
    energetic: clamp(gestureScore * 0.3 + band(energy, 5, 12, 6) * 0.3 + band(pitchVar, 15, 35, 15) * 0.2 + band(speak, 55, 90, 40) * 0.2),
    composed: clamp((100 - touch * 3) * 0.35 + (100 - Math.max(0, tilt - 6) * 6) * 0.3 + (100 - crossed) * 0.15 + band(voice.phrases_per_min, 6, 22, 15) * 0.2),
    engaged: clamp(eye * 0.45 + (face.face_visible_pct ?? 0) * 0.25 + band(speak, 45, 90, 45) * 0.3),
  };
  const ranked = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  const impression = `${TRAITS[ranked[0][0]].label} & ${TRAITS[ranked[1][0]].label.toLowerCase()} communicator`;

  // suggestions: what to fix first (biggest effect on how you come across), then what already works
  const tips = [];
  const add = (area, gap, text) => tips.push({ area, gap, text });
  if (eye < 60) add("face", 60 - eye, "Look into the camera lens, not at your own picture — aim for most of the time while you talk.");
  if ((face.face_visible_pct ?? 100) < 80) add("face", 30, "Stay in frame: sit centred, with your face at about a third from the top of the picture.");
  if (smile < 10) add("face", 25, "Smile at the start and end of what you say — it instantly makes you look friendlier and more confident.");
  if (expr != null && expr < 6) add("face", 20, "Let your face move with your words (eyebrows, smile) — a still face reads as nervous or bored.");
  if (tilt > 10) add("face", 15, "Keep your head level — a strong tilt looks unsure.");
  if (slouch > 20) add("body", slouch, "Sit up: back against the chair, chest open, shoulders relaxed and level.");
  if (hands < 15) add("body", 25, "Let your hands be seen — open gestures at chest height make you look open and sure.");
  else if (act != null && act < 0.02) add("body", 20, "Use a few open hand gestures to underline your key points.");
  else if (act != null && act > 0.12) add("body", 20, "Slow your gestures down and keep them inside your chest area.");
  if (touch > 10) add("body", touch, "Avoid touching your face or hair — rest your hands between gestures.");
  if (crossed > 20) add("body", crossed, "Uncross your arms — it reads as closed or defensive.");
  if (speak < 40) add("voice", 40 - speak + 10, "Talk more continuously — long silences make the listener lose the thread.");
  if (loud != null && loud < -40) add("voice", 30, "Speak up: project as if to someone across the room, or move closer to the mic.");
  if (energy != null && energy < 4) add("voice", 25, "Vary your volume — lean on key words to add energy.");
  if (pitchVar != null && pitchVar < 10) add("voice", 30, "Your tone is flat — let your pitch rise and fall, and slow down on important points.");
  if (longPauses / minutes > 3) add("voice", 20, "Fewer long pauses: plan your next point while finishing the current one, or use a short bridge (“next…”).");
  tips.sort((a, b) => b.gap - a.gap);

  const strengths = [];
  if (eye >= 70) strengths.push("Strong eye contact");
  if (smile >= 20) strengths.push("Friendly, smiling face");
  if (slouch <= 10 && (body.body_visible_pct ?? 0) > 30) strengths.push("Upright, confident posture");
  if (act != null && act >= 0.02 && act <= 0.12) strengths.push("Natural hand gestures");
  if (pitchVar != null && pitchVar >= 15) strengths.push("Expressive, varied voice");
  if (speak >= 50 && longPauses / minutes <= 2) strengths.push("Fluent, steady delivery");

  return {
    overall,
    areas,
    traits,
    topTraits: ranked.slice(0, 2).map(([k]) => k),
    impression,
    tips: tips.slice(0, 6),
    strengths,
    measures: { eye, ...face, ...body, ...voice },
  };
}
