// Copies the MediaPipe WASM runtime into public/ and downloads the models once, so the browser loads
// everything from our own origin (no third-party CDN at runtime):
//   face landmarker (attention, smile) · pose landmarker (posture, gestures) · object detector (phone, people…)
import { cp, mkdir, stat, writeFile } from "node:fs/promises";

const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "efficientdet_lite0.tflite":
    "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
};

await mkdir("public/mediapipe/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });

for (const [file, url] of Object.entries(MODELS)) {
  const path = `public/mediapipe/${file}`;
  const exists = await stat(path).then(() => true, () => false);
  if (exists) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file} download failed: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${file}`);
}
console.log("mediapipe assets ready");
