// Copies the MediaPipe WASM runtime into public/ and downloads the models once, so the browser loads
// everything from our own origin (no third-party CDN at runtime):
//   face landmarker (attention, smile) · pose landmarker FULL (posture, gestures — more accurate than "lite")
//   · object detector EfficientDet-Lite2 (phone, people… — ~34 mAP on COCO vs ~26 for Lite0)
import { cp, mkdir, stat, writeFile } from "node:fs/promises";

const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  "efficientdet_lite2.tflite":
    "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
  // Vision Studio + Meet:
  //   image classifier EfficientNet-Lite2 (1,000 ImageNet names: refines "cup" -> "coffee mug"),
  //   gesture recognizer (21-point hands + 👍 ✌️ ✋ ☝️ ✊ 🤟 👎), selfie segmentation (background blur / replace)
  "efficientnet_lite2.tflite":
    "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite2/float32/1/efficientnet_lite2.tflite",
  "gesture_recognizer.task":
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  "selfie_segmenter_landscape.tflite":
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite",
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
