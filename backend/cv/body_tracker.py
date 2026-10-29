"""Whole-body analysis for the interview coach (Python twin of the browser's frontend/src/lib/body.js).

  * MediaPipe Pose            -> posture (slouching, shoulder tilt), hands (visible, gesture activity,
                                 face touching, crossed arms)
  * MediaPipe Object Detector -> things in the frame: phone, other people, cups, books… (EfficientDet-Lite2;
                                 the model is downloaded once to cv/models/, skipped if that is not possible)
Pose runs on every 3rd frame and objects once a second so the video stays smooth.
summary() returns the same keys as the browser, which the interview coach scores.
"""
import math
import threading
import time
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/"
             "efficientdet_lite2.tflite")
MODEL_PATH = Path(__file__).parent / "models" / "efficientdet_lite2.tflite"
NOTABLE = {"cell phone", "person", "cup", "bottle", "book", "laptop", "tv", "remote", "keyboard", "mouse", "dog", "cat"}
NOSE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR = 0, 11, 12, 13, 14, 15, 16
SKELETON = [(L_SH, R_SH), (L_SH, L_EL), (L_EL, L_WR), (R_SH, R_EL), (R_EL, R_WR)]


def _object_detector():
    try:
        if not MODEL_PATH.exists():
            MODEL_PATH.parent.mkdir(exist_ok=True)
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        options = mp.tasks.vision.ObjectDetectorOptions(
            # pass the bytes: once mp.solutions has run, MediaPipe prefixes file paths with its package folder
            base_options=mp.tasks.BaseOptions(model_asset_buffer=MODEL_PATH.read_bytes()),
            running_mode=mp.tasks.vision.RunningMode.IMAGE, score_threshold=0.4, max_results=10)
        return mp.tasks.vision.ObjectDetector.create_from_options(options)
    except Exception:  # offline / blocked download: posture still works, objects are skipped
        return None


def _vis(p) -> bool:
    return p.visibility > 0.5 and 0 < p.x < 1 and 0 < p.y < 1.05


def _dist(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


class BodyTracker:
    """Thread-safe: update() runs on the video thread, summary()/live on the UI thread."""

    def __init__(self, objects: bool = True):
        self.pose = mp.solutions.pose.Pose(model_complexity=1,  # full model: more accurate landmarks
                                            min_detection_confidence=0.5,
                                           min_tracking_confidence=0.5)
        self.detector = _object_detector() if objects else None
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with getattr(self, "_lock", threading.Lock()):
            self.frames = self.pose_samples = self.body_samples = 0
            self.upright: list[float] = []
            self.slouch = self.hand_samples = self.touch = self.crossed = self.motion_n = 0
            self.tilt_sum = self.motion_sum = 0.0
            self.prev_wrists = None
            self.object_checks, self.object_seen, self.people_max = 0, {}, 0
            self.last_objects = 0.0
            self.landmarks = None
            self.detections: list = []
            self.live = {"posture": "—", "tilt": 0.0, "hands": "—", "gesture": "—", "objects": [], "named": [], "people": 0,
                         "touching": False}

    # ------------------------------------------------------------------ per frame
    def update(self, frame_bgr: np.ndarray):
        self.frames += 1
        if self.frames % 3 == 0:
            res = self.pose.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
            with self._lock:
                self._pose(res.pose_landmarks.landmark if res.pose_landmarks else None)
        now = time.time()
        if self.detector and now - self.last_objects > 1.0:
            self.last_objects = now
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
            dets = self.detector.detect(image).detections
            with self._lock:
                self._objects(dets)
        self._draw(frame_bgr)

    def _pose(self, lm):
        self.pose_samples += 1
        self.landmarks = lm
        if lm is None or not (_vis(lm[L_SH]) and _vis(lm[R_SH])):
            self.live["posture"] = "No body"
            return
        self.body_samples += 1
        ls, rs, nose = lm[L_SH], lm[R_SH], lm[NOSE]
        sw = _dist(ls, rs) or 1e-6
        tilt = abs(math.degrees(math.atan2(rs.y - ls.y, rs.x - ls.x))) % 180
        tilt = min(tilt, 180 - tilt)
        self.tilt_sum += tilt
        upright = ((ls.y + rs.y) / 2 - nose.y) / sw  # head height above the shoulders drops when slouching
        self.upright = (self.upright + [upright])[-600:]
        ref = sorted(self.upright)[int(len(self.upright) * 0.9)]
        slouched = len(self.upright) > 15 and upright < ref * 0.78
        self.slouch += slouched

        wrists = [w for w in (lm[L_WR], lm[R_WR]) if _vis(w)]
        touching = False
        if wrists:
            self.hand_samples += 1
            touching = any(_dist(w, nose) < 0.55 * sw for w in wrists)
            self.touch += touching
            if self.prev_wrists:
                moves = [_dist(w, p) / sw for w, p in zip((lm[L_WR], lm[R_WR]), self.prev_wrists)
                         if p is not None and _vis(w)]
                if moves:
                    self.motion_sum += max(moves)
                    self.motion_n += 1
        if all(_vis(lm[i]) for i in (L_WR, R_WR, L_EL, R_EL)):
            lw, rw = lm[L_WR], lm[R_WR]
            self.crossed += ((lw.x - rw.x) * (ls.x - rs.x) < 0 and lw.y < lm[L_EL].y + 0.05
                             and rw.y < lm[R_EL].y + 0.05)
        self.prev_wrists = [w if _vis(w) else None for w in (lm[L_WR], lm[R_WR])]
        act = self.motion_sum / self.motion_n if self.motion_n else 0.0
        self.live.update(posture="Slouching" if slouched else "Tilted" if tilt > 8 else "Upright", tilt=tilt,
                         hands=f"{len(wrists)} visible" if wrists else "hidden", touching=touching,
                         gesture="—" if not wrists else "still" if act < 0.02 else "a lot" if act > 0.12 else "natural")

    def _objects(self, dets):
        self.object_checks += 1
        self.detections = dets
        every = [d.categories[0].category_name for d in dets if d.categories]
        counts: dict[str, int] = {}
        for label in every:
            if label != "person":
                counts[label] = counts.get(label, 0) + 1
        # every object in view, by name ("Laptop", "Cup x2"); NOTABLE ones also count for the interview score
        self.live["named"] = [f"{k.capitalize()} x{n}" if n > 1 else k.capitalize() for k, n in sorted(counts.items())]
        labels = [label for label in every if label in NOTABLE]
        people = labels.count("person")
        self.people_max = max(self.people_max, people)
        for label in set(labels):
            self.object_seen[label] = self.object_seen.get(label, 0) + 1
        self.live.update(objects=sorted({label for label in labels if label != "person"}), people=people)

    def _draw(self, frame):
        h, w = frame.shape[:2]
        lm = self.landmarks
        if lm is not None:
            for a, b in SKELETON:
                if _vis(lm[a]) and _vis(lm[b]):
                    cv2.line(frame, (int(lm[a].x * w), int(lm[a].y * h)), (int(lm[b].x * w), int(lm[b].y * h)),
                             (250, 139, 167), 3, cv2.LINE_AA)
            for i in (L_WR, R_WR):
                if _vis(lm[i]):
                    cv2.circle(frame, (int(lm[i].x * w), int(lm[i].y * h)), 6, (250, 139, 167), -1, cv2.LINE_AA)
        s = w / 640
        for d in self.detections:  # boxes for objects only — never a box over the person
            label = d.categories[0].category_name if d.categories else ""
            if not label or label == "person":
                continue
            b = d.bounding_box
            color = (22, 115, 249) if label == "cell phone" else (248, 189, 56) if label in NOTABLE else (128, 222, 74)
            cv2.rectangle(frame, (b.origin_x, b.origin_y), (b.origin_x + b.width, b.origin_y + b.height), color, 2)
            cv2.putText(frame, f"{label.capitalize()} {d.categories[0].score:.0%}", (b.origin_x + 4, max(int(16 * s), b.origin_y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5 * s, color, max(1, round(s)), cv2.LINE_AA)

    # ------------------------------------------------------------------ results
    def summary(self) -> dict:
        with self._lock:
            def pct(n, d):
                return round(100 * n / d, 1) if d else 0.0

            objects = sorted(({"label": k, "pct": pct(v, self.object_checks)} for k, v in self.object_seen.items()
                              if k != "person"), key=lambda o: -o["pct"])
            return {
                "body_visible_pct": pct(self.body_samples, self.pose_samples),
                "slouch_pct": pct(self.slouch, self.body_samples),
                "shoulder_tilt": round(self.tilt_sum / self.body_samples, 1) if self.body_samples else None,
                "hands_visible_pct": pct(self.hand_samples, self.body_samples),
                "gesture_activity": round(self.motion_sum / self.motion_n, 3) if self.motion_n else None,
                "face_touch_pct": pct(self.touch, self.hand_samples),
                "arms_crossed_pct": pct(self.crossed, self.body_samples),
                "people_max": self.people_max,
                "phone_pct": pct(self.object_seen.get("cell phone", 0), self.object_checks),
                "objects": objects,
            }
