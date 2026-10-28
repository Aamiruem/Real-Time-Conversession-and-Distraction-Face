"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AttentionEngine, LEFT_EYE, LEFT_IRIS, RIGHT_EYE, RIGHT_IRIS, STATE_COLORS } from "./attention";

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
 */
export function useFaceTracker({ audio = false } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engine = useRef(new AttentionEngine());
  const stream = useRef(null);
  const raf = useRef(0);
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
        navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: false } : false,
        }),
      ]);
      stream.current = media;
      const video = videoRef.current;
      video.srcObject = media;
      await video.play();
      engine.current.reset();
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

  return { videoRef, canvasRef, engine, metrics, status, error, start, stop, stream };
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
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 * w - 10, y0 * h - 10, (x1 - x0) * w + 20, (y1 - y0) * h + 20);
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
