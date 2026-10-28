// Copies the MediaPipe WASM runtime into public/ and downloads the face-landmarker model once,
// so the browser loads everything from our own origin (no third-party CDN at runtime).
import { cp, mkdir, stat, writeFile } from "node:fs/promises";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

await mkdir("public/mediapipe/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });

const model = "public/mediapipe/face_landmarker.task";
const exists = await stat(model).then(() => true, () => false);
if (!exists) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  await writeFile(model, Buffer.from(await res.arrayBuffer()));
}
console.log("mediapipe assets ready");
