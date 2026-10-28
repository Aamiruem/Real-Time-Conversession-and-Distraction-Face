import { useCallback, useEffect, useRef, useState } from "react";

import { AttentionEngine, LEFT_EYE, LEFT_IRIS, RIGHT_EYE, RIGHT_IRIS, STATE_COLORS } from "./attention";
import { BodyTracker } from "./body";
import { PresenceTracker } from "./presence";

let landmarkerPromise = null;

/** One shared MediaPipe FaceLandmarker (loaded lazily from our own /public folder). */
export function loadFaceLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate) =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: true, // expression scores (smile…) for the interview coach
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  landmarkerPromise.catch(() => (landmarkerPromise = null));
  return landmarkerPromise;
}

/**
 * Camera + face tracking. Attach `videoRef` / `canvasRef`, call start() / stop().
 * `metrics` refreshes ~5×/s for the UI; `engine` holds the full per-frame state.
 * With `presence: true` it also tracks smile, framing and picture quality (`presence` = PresenceTracker);
 * with `body: true` it adds posture, hands and objects in the frame (`body` = BodyTracker).
 */
export function useFaceTracker({ audio = false, presence: withPresence = false, body: withBody = false } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engine = useRef(new AttentionEngine());
  const stream = useRef(null);
  const raf = useRef(0);
  const presence = useRef(null);
  if (withPresence && !presence.current) presence.current = new PresenceTracker();
  const body = useRef(null);
  if (withBody && !body.current) body.current = new BodyTracker();
  const [metrics, setMetrics] = useState(AttentionEngine.empty());
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const loop = useCallback((landmarker) => {
    let lastUi = 0;
    let lastVideoTime = -1;
    const tick = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const res = landmarker.detectForVideo(video, performance.now());
        const lm = res.faceLandmarks?.[0];
        engine.current.update(lm, res.facialTransformationMatrixes?.[0]?.data, video.videoWidth, video.videoHeight);
        draw(canvasRef.current, video, lm, engine.current.metrics().state);
        presence.current?.update(lm, res.faceBlendshapes?.[0]?.categories, video, engine.current.m);
        if (body.current) {
          body.current.update(video, performance.now());
          body.current.draw(canvasRef.current, video);
        }
        const now = performance.now();
        if (now - lastUi > 200) {
          lastUi = now;
          setMetrics(engine.current.metrics());
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError("");
    setStatus("loading");
    try {
      const [landmarker, media] = await Promise.all([
        loadFaceLandmarker(),
        body.current?.load().catch(() => null), // body models are optional — face tracking works without them
        navigator.mediaDevices.getUserMedia({
          // HD widescreen when the camera supports it (wider field of view, sharper picture); falls back gracefully
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 16 / 9 },
            frameRate: { ideal: 30 },
            facingMode: "user",
          },
          audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false } : false,
        }),
      ]).then(([l, , m]) => [l, m]);
      stream.current = media;
      const video = videoRef.current;
      video.srcObject = media;
      await video.play();
      engine.current.reset();
      presence.current?.reset();
      body.current?.reset();
      setStatus("running");
      loop(landmarker);
      return media;
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera/microphone permission was denied. Allow it in the address bar and try again."
          : `Could not start the camera: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }, [audio, loop]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const final = engine.current.metrics();
    setMetrics(final);
    setStatus("idle");
    return final;
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { videoRef, canvasRef, engine, presence, body, metrics, status, error, start, stop, stream };
}

function draw(canvas, video, lm, state) {
  if (!canvas) return;
  const w = (canvas.width = video.videoWidth);
  const h = (canvas.height = video.videoHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const color = STATE_COLORS[state] ?? "#38bdf8";
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
  const bx = x0 * w - 10,
    by = y0 * h - 10,
    bw = (x1 - x0) * w + 20,
    bh = (y1 - y0) * h + 20;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.globalAlpha = 1;
  // corner brackets
  const c = Math.min(bw, bh) * 0.18;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [bx, by, 1, 1],
    [bx + bw, by, -1, 1],
    [bx, by + bh, 1, -1],
    [bx + bw, by + bh, -1, -1],
  ]) {
    ctx.moveTo(x + dx * c, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * c);
  }
  ctx.stroke();
  // state label above the box; the canvas is mirrored with CSS, so flip back to keep the text readable
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.font = "700 18px system-ui, sans-serif";
  const lx = w - (bx + bw),
    tw = ctx.measureText(state).width + 20,
    ly = Math.max(0, by - 32);
  ctx.fillStyle = color;
  ctx.fillRect(lx, ly, tw, 28);
  ctx.fillStyle = "#04121f";
  ctx.fillText(state, lx + 10, ly + 20);
  ctx.restore();
  ctx.fillStyle = "#4ade80";
  for (const i of [...LEFT_EYE, ...RIGHT_EYE]) {
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, 1.6, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "#38bdf8";
  for (const i of [LEFT_IRIS, RIGHT_IRIS]) {
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}
