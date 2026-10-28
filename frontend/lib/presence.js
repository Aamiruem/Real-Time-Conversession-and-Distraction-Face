// On-camera presence for the interview coach: smile (MediaPipe face blendshapes), expressiveness, framing,
// head posture and picture quality (brightness, contrast, sharpness, resolution).
// summary() returns the same keys as backend/cv/attention_detector.py AttentionDetector.presence().

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const QUALITY_W = 160;

export class PresenceTracker {
  constructor() {
    this.canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    this.reset();
  }

  reset() {
    this.frames = 0;
    this.faceFrames = 0;
    this.smileFrames = 0;
    this.ratios = [];
    this.sizeSum = this.offSum = this.tiltSum = 0;
    this.q = { n: 0, brightness: 0, contrast: 0, sharpness: 0 };
    this.width = this.height = 0;
    this.live = { smiling: false, brightness: 0, sharpness: 0, faceSize: 0, offset: 0 };
  }

  /** One video frame: normalised landmarks, blendshape categories, the <video>, and the attention metrics. */
  update(lm, blend, video, m) {
    this.frames += 1;
    this.width = video.videoWidth;
    this.height = video.videoHeight;
    if (lm) {
      this.faceFrames += 1;
      let x0 = 1,
        y0 = 1,
        x1 = 0,
        y1 = 0;
      for (const p of lm) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      const size = x1 - x0;
      const off = Math.abs((x0 + x1) / 2 - 0.5) + Math.abs((y0 + y1) / 2 - 0.45);
      this.sizeSum += size;
      this.offSum += off;
      this.tiltSum += Math.abs(m.roll);
      // mouth width relative to the outer eye corners (same measure as the Python engine)
      if (this.ratios.length < 3000) this.ratios.push(dist(lm[61], lm[291]) / (dist(lm[33], lm[263]) + 1e-6));
      const score = (name) => blend?.find((c) => c.categoryName === name)?.score ?? 0;
      const smiling = (score("mouthSmileLeft") + score("mouthSmileRight")) / 2 > 0.45;
      if (smiling) this.smileFrames += 1;
      Object.assign(this.live, { smiling, faceSize: size, offset: off });
    }
    if (this.frames % 5 === 1) this.quality(video);
  }

  quality(video) {
    if (!this.canvas || !video.videoWidth) return;
    const w = QUALITY_W;
    const h = Math.max(1, Math.round((QUALITY_W * video.videoHeight) / video.videoWidth));
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < g.length; i++) {
      g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      sum += g[i];
    }
    const mean = sum / g.length;
    let varSum = 0;
    for (const v of g) varSum += (v - mean) ** 2;
    // variance of the Laplacian = sharpness (blurry images have weak edges)
    let lapSum = 0,
      lapSq = 0,
      n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
        lapSum += lap;
        lapSq += lap * lap;
        n += 1;
      }
    }
    const sharp = n ? lapSq / n - (lapSum / n) ** 2 : 0;
    this.q.n += 1;
    this.q.brightness += mean;
    this.q.contrast += Math.sqrt(varSum / g.length);
    this.q.sharpness += sharp;
    Object.assign(this.live, { brightness: mean, sharpness: sharp });
  }

  summary(eyeContact = null) {
    const n = Math.max(this.faceFrames, 1);
    const qn = Math.max(this.q.n, 1);
    const r = this.ratios;
    let expressiveness = null;
    if (r.length > 20) {
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
      expressiveness = +((sd / mean) * 100).toFixed(1);
    }
    const round = (v, d = 1) => +v.toFixed(d);
    return {
      smile_pct: this.faceFrames > 20 ? round((100 * this.smileFrames) / this.faceFrames) : null,
      expressiveness,
      face_visible_pct: round((100 * this.faceFrames) / Math.max(this.frames, 1)),
      face_size: round(this.sizeSum / n, 3),
      center_offset: round(this.offSum / n, 3),
      head_tilt: round(this.tiltSum / n),
      brightness: round(this.q.brightness / qn),
      contrast: round(this.q.contrast / qn),
      sharpness: round(this.q.sharpness / qn),
      width: this.width,
      height: this.height,
      eye_contact: eyeContact,
    };
  }
}

/** Live camera check (0-100 per item) for the "before you start" panel. */
export function cameraCheck(live, height) {
  const light = live.brightness < 85 ? "Too dark" : live.brightness > 190 ? "Too bright" : "Good";
  const sharp = live.sharpness < 40 ? "Blurry" : live.sharpness < 90 ? "OK" : "Sharp";
  const frame =
    !live.faceSize ? "No face" : live.faceSize < 0.16 ? "Move closer" : live.faceSize > 0.45 ? "Move back" : live.offset > 0.1 ? "Centre yourself" : "Good";
  const res = height >= 720 ? `HD ${height}p` : height ? `${height}p — low` : "—";
  return [
    ["💡", "Lighting", light, light === "Good"],
    ["🔍", "Sharpness", sharp, sharp !== "Blurry"],
    ["🖼️", "Framing", frame, frame === "Good"],
    ["📷", "Resolution", res, height >= 720],
    ["😊", "Smile", live.smiling ? "Smiling" : "Neutral", true],
  ];
}
