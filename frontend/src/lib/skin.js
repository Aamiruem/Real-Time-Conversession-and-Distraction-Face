// Skin check: measures how the skin LOOKS on camera — not a diagnosis. Uses the face mesh (478 points) to sample
// fixed zones (forehead, cheeks, nose, chin, under-eyes), converts pixels to CIELAB (the colour space used to
// measure skin colour) and scores five visible traits plus the lighting. A scan averages ~3 s of frames (median),
// so one odd frame can't swing the result. Everything stays on the device.
//
// Limits (shown to the user): a webcam image depends on light, camera, white balance and makeup; it cannot see
// inside the body, cannot tell diseases apart, and is never a substitute for a dermatologist.

// face-mesh landmark ids for each zone: [centre points to average, width × face width, height × face width]
const ZONES = {
  forehead: [[151, 151, 10], 0.16, 0.07],
  leftCheek: [[50, 205], 0.12, 0.1],
  rightCheek: [[280, 425], 0.12, 0.1],
  nose: [[5, 4], 0.06, 0.05],
  chin: [[17, 152, 200], 0.1, 0.06],
  leftUnderEye: [[230, 119], 0.08, 0.035],
  rightUnderEye: [[450, 348], 0.08, 0.035],
};

/** Zone rectangles in video pixels (for sampling and for drawing on the overlay). */
export function skinZones(landmarks, w, h) {
  const fw = Math.hypot((landmarks[454].x - landmarks[234].x) * w, (landmarks[454].y - landmarks[234].y) * h);
  const out = {};
  for (const [name, [ids, zw, zh]] of Object.entries(ZONES)) {
    const cx = (ids.reduce((a, i) => a + landmarks[i].x, 0) / ids.length) * w;
    const cy = (ids.reduce((a, i) => a + landmarks[i].y, 0) / ids.length) * h;
    out[name] = { x: Math.round(cx - (zw * fw) / 2), y: Math.round(cy - (zh * fw) / 2), w: Math.max(4, Math.round(zw * fw)), h: Math.max(4, Math.round(zh * fw)) };
  }
  return { zones: out, faceWidth: fw };
}

// sRGB (0-255) -> CIELAB (D65)
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** One zone's pixels as L, a, b arrays (+ the grid width, for the texture filter). */
function readZone(ctx, z) {
  const { data } = ctx.getImageData(z.x, z.y, z.w, z.h);
  const L = new Float32Array(z.w * z.h), A = new Float32Array(z.w * z.h), B = new Float32Array(z.w * z.h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) [L[p], A[p], B[p]] = lab(data[i], data[i + 1], data[i + 2]);
  return { L, A, B, w: z.w, h: z.h };
}

/** Mean absolute Laplacian of L: fine texture (pores, bumps, roughness) — higher is rougher. */
function texture(zone) {
  const { L, w, h } = zone;
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      s += Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]);
      n++;
    }
  return n ? s / n : 0;
}

// every frame is measured as if the face were this wide, so texture doesn't change with distance to the camera
const FACE_PX = 240;

/**
 * Measure one video frame. Returns raw measurements; `{ cutOff: true }` when part of the face (usually the chin or
 * forehead) is outside the picture — too close to the camera; or null when there's no face.
 */
export function measureFrame(video, landmarks, canvas) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !landmarks) return null;
  const faceWidth = skinZones(landmarks, vw, vh).faceWidth;
  const k = Math.min(1, FACE_PX / faceWidth); // only ever shrink (enlarging would invent smoothness)
  const w = Math.round(vw * k), h = Math.round(vh * k);
  const { zones } = skinZones(landmarks, w, h);
  if (Object.values(zones).some((z) => z.x < 0 || z.y < 0 || z.x + z.w > w || z.y + z.h > h)) return { cutOff: true };
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const Z = Object.fromEntries(Object.entries(zones).map(([k, z]) => [k, readZone(ctx, z)]));
  const skin = [Z.forehead, Z.leftCheek, Z.rightCheek, Z.chin];
  const all = (key, zs) => zs.flatMap((z) => Array.from(z[key]));
  const Ls = all("L", skin), As = all("A", skin);
  const medL = median(Ls), medA = median(As);
  // red blemishes: clearly redder AND not brighter than the surrounding skin
  const spots = skin.reduce((n, z) => n + z.A.filter((a, i) => a > medA + 7 && z.L[i] <= medL + 2).length, 0) / Ls.length;
  // shine: specular highlights (much brighter, almost colourless) on the T-zone
  const tz = [Z.forehead, Z.nose];
  const tL = all("L", tz), tA = all("A", tz), tB = all("B", tz);
  const shine = tL.filter((l, i) => l > medL + 15 && Math.hypot(tA[i], tB[i]) < 20).length / tL.length;
  const cheekL = (mean(Z.leftCheek.L) + mean(Z.rightCheek.L)) / 2;
  return {
    faceWidth,
    brightness: medL,
    asymmetry: Math.abs(mean(Z.leftCheek.L) - mean(Z.rightCheek.L)),
    overexposed: Ls.filter((l) => l > 96).length / Ls.length,
    // relative, not absolute: cheeks + nose compared with the same person's forehead and chin. An absolute a*
    // threshold would wrongly call warmer and darker skin tones "red".
    redness: (mean(Z.leftCheek.A) + mean(Z.rightCheek.A) + mean(Z.nose.A)) / 3 - (mean(Z.forehead.A) + mean(Z.chin.A)) / 2,
    spots,
    shine,
    unevenness: mean(skin.map((z) => sd(Array.from(z.L)))),
    texture: mean([Z.leftCheek, Z.rightCheek, Z.forehead].map(texture)),
    underEye: cheekL - (mean(Z.leftUnderEye.L) + mean(Z.rightUnderEye.L)) / 2,
  };
}

/** Is the picture good enough to judge skin? Problems come back as plain-language fixes. */
export function lightingCheck(m) {
  const issues = [];
  if (m.faceWidth < 220) issues.push("Move closer — your face should fill about a third of the picture.");
  if (m.brightness < 42) issues.push("Too dark — face a window or a lamp.");
  if (m.brightness > 85 || m.overexposed > 0.04) issues.push("Too bright — step back from direct light or lower the lamp.");
  if (m.asymmetry > 9) issues.push("Light falls on one side — face the light source straight on.");
  const score = Math.round(100 - issues.length * 25 - Math.min(20, m.asymmetry));
  return { ok: issues.length === 0, score: Math.max(0, score), issues };
}

// 0 = none visible … 100 = strongly visible. Thresholds are for a typical webcam in even indoor light.
const TRAITS = [
  ["redness", "Redness (cheeks/nose vs your forehead)", (m) => clamp01((m.redness - 1.5) / 6)],
  ["spots", "Red spots / blemishes", (m) => clamp01(m.spots / 0.05)],
  ["shine", "Shine / oiliness (T-zone)", (m) => clamp01(m.shine / 0.06)],
  ["unevenness", "Uneven tone", (m) => clamp01((m.unevenness - 2.5) / 5)],
  // texture depends most on the camera (sharpness, noise): lenient, and labelled so
  ["texture", "Visible texture (camera-dependent)", (m) => clamp01((m.texture - 2.5) / 4)],
  ["underEye", "Dark circles", (m) => clamp01((m.underEye - 7) / 14)],
];

/** Combine a scan's frames (median of each measurement) into scores, a lighting verdict and findings. */
export function summarizeScan(frames) {
  if (frames.length < 5) return null;
  const keys = Object.keys(frames[0]);
  const m = Object.fromEntries(keys.map((k) => [k, median(frames.map((x) => x[k]))]));
  const light = lightingCheck(m);
  const traits = TRAITS.map(([id, label, score]) => {
    const v = Math.round(score(m) * 100);
    return { id, label, value: v, level: v >= 60 ? "high" : v >= 30 ? "moderate" : "low" };
  });
  // dry-looking: rough texture with almost no shine
  const dryLooking = traits.find((t) => t.id === "texture").value >= 45 && traits.find((t) => t.id === "shine").value < 15;
  const clarity = Math.round(100 - mean(traits.map((t) => t.value)));
  return { at: new Date().toISOString(), frames: frames.length, light, traits, dryLooking, clarity, raw: m };
}

// ------------------------------------------------------------------------------------------------- advice
// General, widely accepted skincare and wellbeing guidance. Ingredients are over-the-counter types to ask a
// pharmacist about — never prescription medicines or doses.
export const ADVICE = {
  redness: {
    title: "Calm redness",
    care: ["Wash with lukewarm (not hot) water and a gentle, fragrance-free cleanser.", "Skip harsh scrubs and alcohol toners.", "Moisturise twice a day; wear SPF 30+ daily — sun makes redness worse."],
    ingredients: ["Niacinamide 2–5%", "Azelaic acid (OTC strengths)", "Centella asiatica / panthenol soothing creams"],
    habits: ["Notice triggers: very spicy food, alcohol, heat, hot showers, stress."],
    doctor: "Redness that stays, burns, stings or comes with bumps should be checked by a dermatologist (it can have several causes that need different treatment).",
  },
  spots: {
    title: "Fewer blemishes",
    care: ["Cleanse twice a day and after sweating.", "Use non-comedogenic (won't block pores) moisturiser and sunscreen.", "Don't squeeze or pick — it causes marks and scars.", "Change pillowcases twice a week; clean your phone screen."],
    ingredients: ["Salicylic acid (BHA) 0.5–2% cleanser", "Benzoyl peroxide 2.5–5% as a spot treatment (can bleach fabric)", "Adapalene 0.1% gel (OTC in some countries)", "Niacinamide"],
    habits: ["Some people break out more with lots of sugary food or milk — notice your own pattern."],
    doctor: "See a dermatologist for painful deep lumps, scarring, or spots that don't improve after 8–12 weeks — effective prescription treatments exist.",
  },
  shine: {
    title: "Balance oiliness",
    care: ["Gel or foam cleanser morning and night.", "Still moisturise — use a light, oil-free gel.", "Blotting papers during the day; a clay mask once a week."],
    ingredients: ["Niacinamide 2–5%", "Salicylic acid 0.5–2%", "Oil-free / matte sunscreen"],
    habits: ["Over-washing makes skin produce more oil — twice a day is enough."],
  },
  unevenness: {
    title: "Even out tone",
    care: ["Sunscreen SPF 30+ every day, reapplied outdoors — the single biggest help for marks and uneven tone.", "Be patient: tone changes take 8–12 weeks."],
    ingredients: ["Vitamin C serum (morning)", "Niacinamide", "Azelaic acid", "Gentle AHA (lactic / glycolic) 1–2× a week"],
    habits: ["Avoid 'fairness' or bleaching creams with steroids or mercury — they damage skin."],
    doctor: "A dark patch that is new, growing, or changing colour should be checked by a doctor.",
  },
  texture: {
    title: "Smoother texture",
    care: ["Exfoliate gently 1–2× a week (not daily).", "Moisturise right after washing while skin is slightly damp."],
    ingredients: ["Lactic acid or mandelic acid (mild AHA)", "Ceramide moisturiser", "Retinol (start 2×/week at night, always with sunscreen; not in pregnancy)"],
    habits: ["Drink water through the day; sleep 7–9 hours."],
  },
  underEye: {
    title: "Brighter under-eyes",
    care: ["Sleep 7–9 hours on a regular schedule.", "Cold compress or chilled spoons for 5 minutes in the morning.", "Sunscreen around the eyes; sunglasses outdoors."],
    ingredients: ["Caffeine eye serum", "Vitamin C or niacinamide eye cream", "Hyaluronic acid"],
    habits: ["Less salt and alcohol in the evening; treat allergies (rubbing the eyes darkens them)."],
    doctor: "New, sudden dark circles with tiredness can be linked to low iron or other health issues — a doctor can check with a simple blood test.",
  },
  dry: {
    title: "Hydrate dry-looking skin",
    care: ["Short lukewarm showers; pat dry.", "Rich moisturiser twice a day and after washing.", "Use a humidifier in dry or air-conditioned rooms."],
    ingredients: ["Ceramides", "Hyaluronic acid", "Glycerin", "Urea 5–10% (body)"],
    habits: ["Soap-free cleanser; avoid hot water."],
  },
};

export const DAILY_ROUTINE = [
  ["Morning", "Gentle cleanser → (serum) → moisturiser → sunscreen SPF 30+"],
  ["Night", "Cleanser (double cleanse if wearing sunscreen/makeup) → treatment → moisturiser"],
  ["Weekly", "1–2× gentle exfoliation; wash pillowcases and makeup brushes"],
];

export const LIFESTYLE = [
  ["💧", "Water", "6–8 glasses a day; more in heat or after exercise."],
  ["😴", "Sleep", "7–9 hours — skin repairs overnight; dark circles and dullness follow short sleep."],
  ["🥗", "Food", "Vegetables, fruit, nuts, fish/flaxseed (omega-3); less sugar and fried food."],
  ["☀️", "Sun", "Daily sunscreen and shade at midday — the main cause of early ageing and uneven tone."],
  ["🚭", "Smoking", "Smoking speeds up wrinkles and dull skin; quitting helps within months."],
  ["🧘", "Stress", "Stress can trigger breakouts and flare-ups — breathing and yoga below help."],
];

export const EXERCISE = [
  ["Brisk walk / cycling / dancing", "150 min a week", "Better circulation brings oxygen to the skin; shower or wash your face after sweating."],
  ["Strength training", "2× a week", "Good posture and muscle tone support how the whole body looks."],
  ["Neck & shoulder stretches", "5 min daily", "Undo screen posture (forward head) that strains the neck."],
];

export const YOGA = [
  ["Anulom Vilom (alternate-nostril breathing)", "5 min", "Calms stress — a common trigger for breakouts."],
  ["Bhramari (humming bee breath)", "5 rounds", "Relaxes the face and jaw."],
  ["Adho Mukha Svanasana (downward dog)", "5 breaths", "Gentle inversion; brings blood flow to the face."],
  ["Bhujangasana (cobra)", "5 breaths", "Opens the chest; counters slouching."],
  ["Viparita Karani (legs up the wall)", "3–5 min", "Restful; good before sleep."],
  ["Balasana (child's pose)", "1 min", "Releases neck and back tension."],
];

/** Warning signs that always mean "see a doctor" — whatever the scan says. */
export const SEE_A_DOCTOR = [
  "A mole or spot that changes — Asymmetric, irregular Border, several Colours, Diameter over 6 mm, or Evolving (ABCDE).",
  "A sore or spot that bleeds, itches or hasn't healed in 3 weeks.",
  "A rash with fever, blisters, spreading quickly, or on the eyes, mouth or genitals.",
  "Painful, hot, swollen skin (possible infection).",
  "Yellowing of the skin or the whites of the eyes.",
  "Sudden hair loss, or skin changes together with weight loss or tiredness.",
];
