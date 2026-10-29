// Vision Studio: every MediaPipe computer-vision model on one live camera, in the browser.
//   objects   EfficientDet-Lite2 — boxes + names for 80 everyday object types (COCO)
//   refine    EfficientNet-Lite2 — 1,000 ImageNet names, run on each object box ("cup" -> "coffee mug")
//   scene     EfficientNet-Lite2 on the whole frame — what the picture shows
//   hands     Gesture Recognizer — 21 points per hand + named gestures (👍 ✌️ ✋ ☝️ ✊ 🤟 👎)
//   pose      Pose Landmarker (full) — 33-point body skeleton
//   face      Face Landmarker — 468-point mesh + 52 expression scores (smile, brows, blink…)
//   segment   Selfie segmentation — which pixels are you
// Models take turns (one or two per frame) so the camera stays smooth with everything on.

export const MODELS = [
  { id: "objects", label: "Object detection", icon: "📦", color: "#38bdf8" },
  { id: "refine", label: "Fine names (1,000 types)", icon: "🔎", color: "#f59e0b" },
  { id: "scene", label: "Scene recognition", icon: "🖼️", color: "#a78bfa" },
  { id: "hands", label: "Hands + gestures", icon: "✋", color: "#f472b6" },
  { id: "pose", label: "Body pose", icon: "🧍", color: "#4ade80" },
  { id: "face", label: "Face mesh + expressions", icon: "🙂", color: "#2dd4bf" },
  { id: "segment", label: "Person segmentation", icon: "✂️", color: "#818cf8" },
];

export const GESTURES = {
  Thumb_Up: ["👍", "Thumbs up"],
  Thumb_Down: ["👎", "Thumbs down"],
  Victory: ["✌️", "Victory"],
  Open_Palm: ["✋", "Open palm"],
  Pointing_Up: ["☝️", "Pointing up"],
  Closed_Fist: ["✊", "Fist"],
  ILoveYou: ["🤟", "I love you"],
};
// blendshape -> [label for the panel, phrase for "you're …"]
const EXPRESSIONS = {
  mouthSmileLeft: ["Smiling", "smiling"],
  browInnerUp: ["Eyebrows raised", "raising your eyebrows"],
  jawOpen: ["Mouth open", "opening your mouth"],
  eyeBlinkLeft: ["Eyes closed", "closing your eyes"],
  mouthPucker: ["Puckered lips", "puckering your lips"],
  browDownLeft: ["Frowning", "frowning"],
  cheekPuff: ["Cheeks puffed", "puffing your cheeks"],
};

/** The most descriptive synonym: "Pembroke, Pembroke Welsh corgi" -> "Pembroke Welsh corgi"; "cell phone" -> "Cell phone". */
export const niceName = (label = "") => {
  const names = label.split(",").map((n) => n.trim().replace(/_/g, " ")).filter(Boolean);
  const best = names.reduce((a, b) => (b.split(" ").length > a.split(" ").length ? b : a), names[0] ?? "");
  return best.charAt(0).toUpperCase() + best.slice(1);
};

let loading = null;

/** Load every model once (GPU when available, CPU otherwise). */
export function loadVisionModels() {
  loading ??= (async () => {
    const v = await import("@mediapipe/tasks-vision");
    const files = await v.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = async (Task, options) => {
      try {
        return await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: "GPU" } });
      } catch {
        return await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" } });
      }
    };
    const path = (f) => ({ modelAssetPath: `/mediapipe/${f}` });
    const [objects, classifier, hands, pose, face, segment] = await Promise.all([
      make(v.ObjectDetector, { baseOptions: path("efficientdet_lite2.tflite"), runningMode: "VIDEO", scoreThreshold: 0.35, maxResults: 15 }),
      make(v.ImageClassifier, { baseOptions: path("efficientnet_lite2.tflite"), runningMode: "IMAGE", maxResults: 5 }),
      make(v.GestureRecognizer, { baseOptions: path("gesture_recognizer.task"), runningMode: "VIDEO", numHands: 2 }),
      make(v.PoseLandmarker, { baseOptions: path("pose_landmarker_full.task"), runningMode: "VIDEO", numPoses: 2 }),
      make(v.FaceLandmarker, { baseOptions: path("face_landmarker.task"), runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: true }),
      make(v.ImageSegmenter, { baseOptions: path("selfie_segmenter_landscape.tflite"), runningMode: "VIDEO", outputConfidenceMasks: true }),
    ]);
    return { v, objects, classifier, hands, pose, face, segment };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export class VisionEngine {
  constructor(models) {
    this.m = models;
    this.results = {};
    this.ms = {}; // last run time per model
    this.turn = 0;
    this.lastTs = 0;
    this.crop = document.createElement("canvas");
    this.maskCanvas = document.createElement("canvas");
  }

  timed(id, fn) {
    const t = performance.now();
    const out = fn();
    this.ms[id] = Math.round(performance.now() - t);
    return out;
  }

  /** Run the next models for this frame (round robin). */
  step(video, enabled) {
    const start = performance.now();
    const { m } = this;
    // [model, minimum ms between runs, run]. Each frame gets a ~35 ms budget: models that don't fit wait for the
    // next frame (the start rotates, so all get turns). Adaptive too: a model that took T ms waits at least 4×T
    // before running again, so on CPU-only devices no model hogs the time and the video stays smooth.
    const tasks = [
      ["face", 50, (ts) => (this.results.face = m.face.detectForVideo(video, ts))],
      ["hands", 60, (ts) => (this.results.hands = m.hands.recognizeForVideo(video, ts))],
      ["objects", 120, (ts) => (this.results.objects = m.objects.detectForVideo(video, ts).detections ?? [])],
      ["pose", 60, (ts) => (this.results.pose = m.pose.detectForVideo(video, ts))],
      ["segment", 100, (ts) => this.segment(video, ts)],
      ["scene", 500, () => (this.results.scene = m.classifier.classify(video).classifications?.[0]?.categories ?? [])],
      ["refine", 700, () => this.refine(video)],
    ];
    const first = this.turn++ % tasks.length;
    let ran = 0;
    for (let i = 0; i < tasks.length; i++) {
      const [id, every, run] = tasks[(first + i) % tasks.length];
      const now = performance.now();
      if (ran && now - start > 35) break;
      if (!enabled[id] || now - (this[`at_${id}`] ?? 0) < Math.max(every, (this.ms[id] ?? 0) * 4)) continue;
      this[`at_${id}`] = now;
      const ts = Math.max(now, this.lastTs + 1); // VIDEO-mode models need increasing timestamps
      this.lastTs = ts;
      this.timed(id, () => run(ts));
      ran += 1;
    }
  }

  segment(video, ts) {
    const r = this.m.segment.segmentForVideo(video, ts);
    const mask = r.confidenceMasks?.[0];
    if (mask) {
      const conf = mask.getAsFloat32Array();
      let person = 0;
      for (const c of conf) if (c > 0.5) person += 1;
      this.results.segment = { width: mask.width, height: mask.height, conf: conf.slice(), share: person / conf.length };
    }
    r.close();
  }

  /** Classify a crop of each of the 4 biggest object boxes with the 1,000-name model. */
  refine(video) {
    const dets = (this.results.objects ?? []).filter((d) => d.categories[0]?.categoryName !== "person");
    const big = [...dets].sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height).slice(0, 4);
    const ctx = this.crop.getContext("2d", { willReadFrequently: true });
    const refined = [];
    for (const d of big) {
      const { originX, originY, width, height } = d.boundingBox;
      const pad = 0.12;
      const x = Math.max(0, originX - width * pad),
        y = Math.max(0, originY - height * pad);
      const w = Math.min(video.videoWidth - x, width * (1 + 2 * pad)),
        h = Math.min(video.videoHeight - y, height * (1 + 2 * pad));
      if (w < 24 || h < 24) continue;
      this.crop.width = 224;
      this.crop.height = 224;
      ctx.drawImage(video, x, y, w, h, 0, 0, 224, 224);
      const top = this.m.classifier.classify(this.crop).classifications?.[0]?.categories?.[0];
      if (top && top.score > 0.25) refined.push({ box: d.boundingBox, base: d.categories[0].categoryName, top });
    }
    this.results.refined = refined;
  }

  /** The fine name for a detection: the refined box it overlaps most (same base type, IoU > 0.4). Matched by
   *  position because the detector creates new detection objects on every run. */
  fineName(d) {
    const a = d.boundingBox;
    let best = null,
      bestIou = 0.4;
    for (const r of this.results.refined ?? []) {
      if (r.base !== d.categories[0]?.categoryName) continue;
      const b = r.box;
      const ix = Math.max(0, Math.min(a.originX + a.width, b.originX + b.width) - Math.max(a.originX, b.originX));
      const iy = Math.max(0, Math.min(a.originY + a.height, b.originY + b.height) - Math.max(a.originY, b.originY));
      const inter = ix * iy;
      const iou = inter / (a.width * a.height + b.width * b.height - inter || 1);
      if (iou > bestIou) [best, bestIou] = [r.top, iou];
    }
    return best;
  }

  /** The pose model can find a "body" in animals or furniture: only trust it when a person or face is seen too. */
  seesPerson() {
    const r = this.results;
    return !!r.face?.faceLandmarks?.length || !!r.objects?.some((d) => d.categories[0]?.categoryName === "person");
  }

  /** Overlays for every enabled model. The canvas is mirrored with CSS, so text is flipped back to read normally. */
  draw(canvas, video, enabled) {
    const w = (canvas.width = video.videoWidth),
      h = (canvas.height = video.videoHeight);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const { v } = this.m;
    const du = new v.DrawingUtils(ctx);
    const r = this.results;
    const label = (text, x, y, color) => {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      const fs = Math.max(16, Math.round(w / 48)); // readable at any video size
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width + fs * 0.75;
      const lx = w - x - tw;
      ctx.fillStyle = color;
      ctx.fillRect(lx, y - fs * 1.3, tw, fs * 1.4);
      ctx.fillStyle = "#04121f";
      ctx.fillText(text, lx + fs * 0.375, y - fs * 0.3);
      ctx.restore();
    };

    if (enabled.segment && r.segment) {
      const { width: mw, height: mh, conf } = r.segment;
      this.maskCanvas.width = mw;
      this.maskCanvas.height = mh;
      const mctx = this.maskCanvas.getContext("2d");
      const img = mctx.createImageData(mw, mh);
      for (let i = 0; i < conf.length; i++) {
        img.data[i * 4] = 129;
        img.data[i * 4 + 1] = 140;
        img.data[i * 4 + 2] = 248;
        img.data[i * 4 + 3] = conf[i] * 110;
      }
      mctx.putImageData(img, 0, 0);
      ctx.drawImage(this.maskCanvas, 0, 0, w, h);
    }
    if (enabled.face && r.face?.faceLandmarks) {
      for (const lm of r.face.faceLandmarks) {
        du.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#2dd4bf55", lineWidth: 0.6 });
        du.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "#f472b6", lineWidth: 1.5 });
        du.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "#4ade80", lineWidth: 1.5 });
        du.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "#4ade80", lineWidth: 1.5 });
      }
    }
    if (enabled.pose && r.pose?.landmarks && this.seesPerson()) {
      for (const lm of r.pose.landmarks) {
        du.drawConnectors(lm, v.PoseLandmarker.POSE_CONNECTIONS, { color: "#4ade80", lineWidth: 3 });
        du.drawLandmarks(lm, { color: "#14532d", fillColor: "#4ade80", radius: 3 });
      }
    }
    if (enabled.hands && r.hands?.landmarks) {
      r.hands.landmarks.forEach((lm, i) => {
        du.drawConnectors(lm, v.GestureRecognizer.HAND_CONNECTIONS, { color: "#f472b6", lineWidth: 3 });
        du.drawLandmarks(lm, { color: "#831843", fillColor: "#f9a8d4", radius: 3 });
        const g = r.hands.gestures?.[i]?.[0];
        const name = GESTURES[g?.categoryName];
        if (name) label(`${name[0]} ${name[1]} ${Math.round(g.score * 100)}%`, lm[0].x * w, lm[0].y * h + 30, "#f9a8d4");
      });
    }
    if (enabled.objects && r.objects) {
      for (const d of r.objects) {
        const c = d.categories[0];
        if (!c) continue;
        const { originX, originY, width, height } = d.boundingBox;
        const fine = enabled.refine ? this.fineName(d) : null;
        const color = c.categoryName === "person" ? "#94a3b8" : fine ? "#f59e0b" : "#38bdf8";
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(originX, originY, width, height);
        const name = fine && niceName(fine.categoryName).toLowerCase() !== c.categoryName ? `${niceName(c.categoryName)} → ${niceName(fine.categoryName)}` : niceName(c.categoryName);
        label(`${name} ${Math.round((fine?.score ?? c.score) * 100)}%`, originX, Math.max(22, originY), color);
      }
    }
  }

  /** Everything recognised right now, in words — for the side panel and "Describe what I see". */
  summary(enabled) {
    const r = this.results;
    const objects = {};
    if (enabled.objects) {
      for (const d of r.objects ?? []) {
        const c = d.categories[0];
        if (!c) continue;
        const fine = enabled.refine ? this.fineName(d) : null;
        const key = niceName(fine?.categoryName ?? c.categoryName);
        objects[key] = { name: key, base: niceName(c.categoryName), count: (objects[key]?.count ?? 0) + 1, score: Math.max(objects[key]?.score ?? 0, fine?.score ?? c.score) };
      }
    }
    const hands = enabled.hands
      ? (r.hands?.landmarks ?? []).map((_, i) => {
          const g = r.hands.gestures?.[i]?.[0];
          const side = r.hands.handedness?.[i]?.[0]?.categoryName; // as seen by the camera
          return { side: side === "Left" ? "Right hand" : side === "Right" ? "Left hand" : "Hand", gesture: GESTURES[g?.categoryName] ?? null, score: g?.score ?? 0 };
        })
      : [];
    const faces = enabled.face ? (r.face?.faceBlendshapes ?? []) : [];
    const expressions = faces.map((f) =>
      Object.entries(EXPRESSIONS)
        .map(([k, [label, phrase]]) => ({ label, phrase, score: f.categories.find((c) => c.categoryName === k)?.score ?? 0 }))
        .filter((e) => e.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .filter((e, _, all) => !(e.label === "Frowning" && all.some((x) => x.label === "Smiling" && x.score > 0.5))), // can't be both
    );
    return {
      objects: Object.values(objects).sort((a, b) => b.score - a.score),
      scene: enabled.scene ? (r.scene ?? []).filter((c) => c.score > 0.05).map((c) => ({ name: niceName(c.categoryName), score: c.score })) : [],
      hands,
      faces: faces.length,
      expressions,
      people: enabled.pose && this.seesPerson() ? (r.pose?.landmarks?.length ?? 0) : 0,
      personShare: enabled.segment ? r.segment?.share : null,
      ms: this.ms,
    };
  }
}

/** One natural sentence about the scene (read aloud by the voice coach). */
export function describe(s) {
  const parts = [];
  // people from the object detector and faces (the pose model can mistake animals for a body)
  const people = Math.max(s.faces, s.objects.find((o) => o.name === "Person")?.count ?? 0);
  if (people) parts.push(people === 1 ? "one person" : `${people} people`);
  const things = s.objects.filter((o) => o.name !== "Person").map((o) => (o.count > 1 ? `${o.count} ${o.name.toLowerCase()}s` : `a ${o.name.toLowerCase()}`));
  parts.push(...things.slice(0, 5));
  let text = parts.length ? `I can see ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts.at(-1)}.` : "I can't see anything I recognise yet.";
  const g = s.hands.find((h) => h.gesture);
  if (g) text += ` Your ${g.side.toLowerCase()} shows ${g.gesture[1].toLowerCase()}.`;
  if (s.expressions[0]?.[0]) text += ` You're ${s.expressions[0][0].phrase}.`;
  // the 1,000 names have no "hand" or "person", so only mention the scene when the model is clearly sure
  if (s.scene[0] && s.scene[0].score > 0.5 && !people) text += ` The picture mostly shows a ${s.scene[0].name.toLowerCase()}.`;
  return text;
}
