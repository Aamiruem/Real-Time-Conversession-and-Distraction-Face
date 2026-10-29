// Whole-body analysis for the interview coach (computer vision, runs in the browser):
//   * MediaPipe Pose Landmarker (full model) -> posture (slouching, shoulder tilt), hands (visible, gesture activity,
//                                   face touching, crossed arms)
//   * MediaPipe Object Detector (EfficientDet-Lite2) -> things in the frame: phone, other people, cups, books…
// Pose runs on every 3rd frame and objects once a second, so the camera stays smooth.
// summary() returns the same keys as backend/cv/body_tracker.py.

let modelsPromise = null;

/** Pose landmarker + object detector, created once and shared (loaded from our own /public folder). */
export function loadBodyModels() {
  modelsPromise ??= (async () => {
    const { FilesetResolver, ObjectDetector, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = async (create) => {
      try {
        return await create("GPU");
      } catch {
        return await create("CPU");
      }
    };
    const [pose, objects] = await Promise.all([
      make((delegate) =>
        PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_full.task", delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      ),
      make((delegate) =>
        ObjectDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/mediapipe/efficientdet_lite2.tflite", delegate },
          runningMode: "VIDEO",
          scoreThreshold: 0.4,
          maxResults: 10, // up to 10 things at once, any of the 80 everyday COCO object types
        }),
      ),
    ]);
    return { pose, objects };
  })();
  modelsPromise.catch(() => (modelsPromise = null));
  return modelsPromise;
}

/** "cell phone" -> "Cell phone" for on-screen labels. */
export const prettyLabel = (l) => l.charAt(0).toUpperCase() + l.slice(1);

// COCO labels worth commenting on in an interview (the rest are named on screen but not scored)
const NOTABLE = ["cell phone", "person", "cup", "bottle", "book", "laptop", "tv", "remote", "keyboard", "mouse", "dog", "cat"];
const P = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16 };
const vis = (p) => p && (p.visibility ?? 1) > 0.5 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1.05;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class BodyTracker {
  constructor() {
    this.models = null;
    this.reset();
  }

  reset() {
    this.frames = 0;
    this.poseSamples = 0;
    this.bodySamples = 0;
    this.uprightRatios = [];
    this.slouchSamples = 0;
    this.tiltSum = 0;
    this.handSamples = 0;
    this.motionSum = 0;
    this.motionN = 0;
    this.touchSamples = 0;
    this.crossedSamples = 0;
    this.prevWrists = null;
    this.objectChecks = 0;
    this.objectSeen = {};
    this.peopleMax = 0;
    this.lastObjects = 0;
    this.lastPose = null;
    this.detections = [];
    this.live = { posture: "—", tilt: 0, hands: "—", gesture: "—", objects: [], named: [], people: 0, touching: false };
  }

  async load() {
    this.models = await loadBodyModels();
  }

  /** Call once per video frame (after face tracking). */
  update(video, now) {
    if (!this.models || !video.videoWidth) return;
    this.frames += 1;
    if (this.frames % 3 === 0) this.pose(this.models.pose.detectForVideo(video, now).landmarks?.[0]);
    if (now - this.lastObjects > 500) { // twice a second: boxes follow moving objects
      this.lastObjects = now;
      this.objects(this.models.objects.detectForVideo(video, now).detections ?? []);
    }
  }

  pose(lm) {
    this.poseSamples += 1;
    this.lastPose = lm ?? null;
    if (!lm || !vis(lm[P.lSh]) || !vis(lm[P.rSh])) {
      this.live.posture = "No body";
      return;
    }
    this.bodySamples += 1;
    const ls = lm[P.lSh],
      rs = lm[P.rSh],
      nose = lm[P.nose];
    const sw = dist(ls, rs) || 1e-6;
    const tilt = Math.abs((Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI) % 180;
    const tiltDeg = Math.min(tilt, 180 - tilt);
    this.tiltSum += tiltDeg;
    // head height above the shoulder line, relative to shoulder width: drops when you slouch
    const upright = ((ls.y + rs.y) / 2 - nose.y) / sw;
    this.uprightRatios.push(upright);
    if (this.uprightRatios.length > 600) this.uprightRatios.shift();
    const sorted = [...this.uprightRatios].sort((a, b) => a - b);
    const ref = sorted[Math.floor(sorted.length * 0.9)];
    const slouched = this.uprightRatios.length > 15 && upright < ref * 0.78;
    if (slouched) this.slouchSamples += 1;

    // hands: visibility, movement (gesture activity), touching the face, crossed arms
    const lw = lm[P.lWr],
      rw = lm[P.rWr];
    const wrists = [lw, rw].filter(vis);
    let touching = false,
      crossed = false;
    if (wrists.length) {
      this.handSamples += 1;
      touching = wrists.some((w) => dist(w, nose) < 0.55 * sw);
      if (touching) this.touchSamples += 1;
      if (this.prevWrists) {
        const moves = wrists.map((w, i) => (this.prevWrists[i] ? dist(w, this.prevWrists[i]) / sw : 0));
        this.motionSum += Math.max(...moves);
        this.motionN += 1;
      }
    }
    if (vis(lw) && vis(rw) && vis(lm[P.lEl]) && vis(lm[P.rEl])) {
      // each wrist past the opposite elbow, at chest height
      crossed = (lw.x - rw.x) * (ls.x - rs.x) < 0 && lw.y < lm[P.lEl].y + 0.05 && rw.y < lm[P.rEl].y + 0.05;
      if (crossed) this.crossedSamples += 1;
    }
    this.prevWrists = [lw, rw].map((w) => (vis(w) ? w : null));
    const activity = this.motionN ? this.motionSum / this.motionN : 0;
    Object.assign(this.live, {
      posture: slouched ? "Slouching" : tiltDeg > 8 ? "Tilted" : "Upright",
      tilt: tiltDeg,
      hands: wrists.length ? `${wrists.length} visible` : "hidden",
      gesture: !wrists.length ? "—" : activity < 0.02 ? "still" : activity > 0.12 ? "a lot" : "natural",
      touching,
    });
  }

  objects(dets) {
    this.objectChecks += 1;
    this.detections = dets;
    const all = dets.map((d) => d.categories[0]?.categoryName).filter(Boolean);
    const counts = {};
    for (const l of all) if (l !== "person") counts[l] = (counts[l] ?? 0) + 1;
    // every object in view, by name: "Laptop", "Cup ×2"…
    this.live.named = Object.entries(counts).map(([l, n]) => (n > 1 ? `${prettyLabel(l)} ×${n}` : prettyLabel(l)));
    const labels = all.filter((l) => NOTABLE.includes(l));
    const people = labels.filter((l) => l === "person").length;
    this.peopleMax = Math.max(this.peopleMax, people);
    for (const l of new Set(labels)) this.objectSeen[l] = (this.objectSeen[l] ?? 0) + 1;
    Object.assign(this.live, { objects: [...new Set(labels.filter((l) => l !== "person"))], people });
  }

  /** Draw the upper-body skeleton and a named box for every object (not people — no box over your face). */
  draw(canvas, video) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width,
      h = canvas.height;
    const lm = this.lastPose;
    if (lm) {
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 3;
      for (const [a, b] of [
        [P.lSh, P.rSh],
        [P.lSh, P.lEl],
        [P.lEl, P.lWr],
        [P.rSh, P.rEl],
        [P.rEl, P.rWr],
      ]) {
        if (!vis(lm[a]) || !vis(lm[b])) continue;
        ctx.beginPath();
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = "#a78bfa";
      for (const i of [P.lWr, P.rWr]) {
        if (!vis(lm[i])) continue;
        ctx.beginPath();
        ctx.arc(lm[i].x * w, lm[i].y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    const sx = w / (video.videoWidth || w),
      sy = h / (video.videoHeight || h);
    ctx.font = "600 15px system-ui, sans-serif";
    for (const d of this.detections) {
      const label = d.categories[0]?.categoryName;
      if (!d.boundingBox || !label || label === "person") continue;
      const { originX, originY, width, height } = d.boundingBox;
      const color = label === "cell phone" ? "#f97316" : NOTABLE.includes(label) ? "#38bdf8" : "#4ade80";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(originX * sx, originY * sy, width * sx, height * sy);
      // the canvas is mirrored with CSS: flip the label back so it reads correctly
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      const tx = w - (originX + width) * sx,
        ty = Math.max(18, originY * sy - 6);
      const text = `${prettyLabel(label)} ${Math.round(d.categories[0].score * 100)}%`;
      ctx.fillStyle = color;
      ctx.fillRect(tx, ty - 16, ctx.measureText(text).width + 10, 20);
      ctx.fillStyle = "#04121f";
      ctx.fillText(text, tx + 5, ty - 1);
      ctx.restore();
    }
  }

  summary() {
    const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : 0);
    const objects = Object.entries(this.objectSeen)
      .filter(([l]) => l !== "person")
      .map(([label, n]) => ({ label, pct: pct(n, this.objectChecks) }))
      .sort((a, b) => b.pct - a.pct);
    return {
      body_visible_pct: pct(this.bodySamples, this.poseSamples),
      slouch_pct: pct(this.slouchSamples, this.bodySamples),
      shoulder_tilt: this.bodySamples ? +(this.tiltSum / this.bodySamples).toFixed(1) : null,
      hands_visible_pct: pct(this.handSamples, this.bodySamples),
      gesture_activity: this.motionN ? +(this.motionSum / this.motionN).toFixed(3) : null,
      face_touch_pct: pct(this.touchSamples, this.handSamples),
      arms_crossed_pct: pct(this.crossedSamples, this.bodySamples),
      people_max: this.peopleMax,
      phone_pct: pct(this.objectSeen["cell phone"] ?? 0, this.objectChecks),
      objects,
    };
  }
}
