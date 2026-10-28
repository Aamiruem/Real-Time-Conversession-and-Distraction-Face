"""Computer-vision attention engine (MediaPipe Face Mesh + OpenCV).

Per frame it computes:
  * EAR  (eye aspect ratio)   -> blinks, drowsiness (eyes closed too long)
  * MAR  (mouth aspect ratio) -> yawns
  * Head pose (yaw/pitch/roll via solvePnP) -> looking away
  * Gaze (iris position inside the eye)     -> looking sideways
and classifies the user as Focused / Distracted / Drowsy / Yawning / No Face.
Time spent in each state gives the live Focus % and Distraction %.
"""
import threading
import time
from collections import deque
from dataclasses import dataclass, field

import cv2
import mediapipe as mp
import numpy as np

# Face-mesh landmark indices
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
LEFT_IRIS, RIGHT_IRIS = 473, 468
MOUTH_TOP, MOUTH_BOTTOM, MOUTH_LEFT, MOUTH_RIGHT = 13, 14, 78, 308
POSE_POINTS = [1, 152, 33, 263, 61, 291]  # nose, chin, eye corners, mouth corners
MODEL_3D = np.array(
    [
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0),
    ],
    dtype=np.float64,
)

STATE_COLORS = {
    "Focused": (80, 200, 120),
    "Distracted": (0, 165, 255),
    "Drowsy": (60, 60, 255),
    "Yawning": (0, 215, 255),
    "No Face": (160, 160, 160),
}


@dataclass
class Thresholds:
    ear_closed: float = 0.21       # below this the eye counts as closed
    drowsy_seconds: float = 1.2    # eyes closed this long -> drowsy
    mar_yawn: float = 0.60         # mouth opening ratio for a yawn
    yawn_seconds: float = 0.8
    yaw_limit: float = 25.0        # degrees left/right
    pitch_limit: float = 20.0      # degrees up/down
    gaze_low: float = 0.38         # iris ratio inside eye (0..1)
    gaze_high: float = 0.62
    distract_seconds: float = 1.5  # must look away this long to count as distracted


@dataclass
class Metrics:
    state: str = "No Face"
    ear: float = 0.0
    mar: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    gaze: str = "center"
    blinks_total: int = 0
    blinks_per_min: int = 0
    yawns_total: int = 0
    fps: float = 0.0
    focus_pct: float = 0.0
    distracted_pct: float = 0.0
    drowsy_pct: float = 0.0
    no_face_pct: float = 0.0
    elapsed_sec: float = 0.0
    avg_ear: float = 0.0
    alarm: bool = False
    timeline: list = field(default_factory=list)


def _dist(a, b) -> float:
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def eye_aspect_ratio(pts) -> float:
    p1, p2, p3, p4, p5, p6 = pts
    return (_dist(p2, p6) + _dist(p3, p5)) / (2.0 * _dist(p1, p4) + 1e-6)


class AttentionDetector:
    """Thread-safe: `process()` runs on the video thread, `metrics()` is read by the UI."""

    def __init__(self, thresholds: Thresholds | None = None):
        self.t = thresholds or Thresholds()
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5
        )
        self._lock = threading.Lock()
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self):
        with getattr(self, "_lock", threading.Lock()):
            self.start_time = time.time()
            self.last_frame_time = None
            self.state_time = {s: 0.0 for s in STATE_COLORS}
            self.eye_closed_since = None
            self.yawn_since = None
            self.away_since = None
            self.eye_was_closed = False
            self.yawn_counted = False
            self.blink_times: deque = deque()
            self.ear_sum, self.ear_n = 0.0, 0
            self.fps_times: deque = deque(maxlen=30)
            self.timeline: list = []
            self.last_timeline_ts = 0.0
            self._m = Metrics()
            # presence (interview prep): smile, framing, posture and picture quality
            self.smile_ratios: deque = deque(maxlen=3000)
            self.frames = 0
            self.face_frames = 0
            self.face_size_sum = self.center_off_sum = self.roll_sum = 0.0
            self.quality = {"n": 0, "brightness": 0.0, "contrast": 0.0, "sharpness": 0.0}
            self.resolution = (0, 0)

    def metrics(self) -> Metrics:
        with self._lock:
            m = Metrics(**{k: getattr(self._m, k) for k in Metrics.__dataclass_fields__ if k != "timeline"})
            m.timeline = list(self.timeline)
            return m

    # --------------------------------------------------------------- per frame
    def process(self, frame_bgr: np.ndarray) -> np.ndarray:
        now = time.time()
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)

        with self._lock:
            m = self._m
            dt = 0.0 if self.last_frame_time is None else min(now - self.last_frame_time, 1.0)
            self.last_frame_time = now
            self.fps_times.append(now)
            if len(self.fps_times) > 1:
                m.fps = (len(self.fps_times) - 1) / (self.fps_times[-1] - self.fps_times[0] + 1e-6)

            if not result.multi_face_landmarks:
                state = "No Face"
                self.eye_closed_since = self.yawn_since = self.away_since = None
                box = None
            else:
                lm = result.multi_face_landmarks[0].landmark
                pts = np.array([(p.x * w, p.y * h) for p in lm])
                state = self._analyze(pts, w, h, now, m)
                x0, y0 = pts.min(axis=0).astype(int)
                x1, y1 = pts.max(axis=0).astype(int)
                box = (x0, y0, x1, y1)
                self._track_face(pts, box, w, h, m)
                self._draw_eyes(frame_bgr, pts)

            self.frames += 1
            self.resolution = (w, h)
            if self.frames % 5 == 1:  # picture quality on a small grayscale copy every 5th frame
                self._track_quality(frame_bgr)
            m.state = state
            self.state_time[state] += dt
            self._update_percentages(m, now)
            self._draw_overlay(frame_bgr, m, box)
        return frame_bgr

    def _analyze(self, pts, w, h, now, m: Metrics) -> str:
        t = self.t
        # --- Eyes / blinks / drowsiness
        ear = (eye_aspect_ratio(pts[LEFT_EYE]) + eye_aspect_ratio(pts[RIGHT_EYE])) / 2.0
        m.ear = round(ear, 3)
        self.ear_sum += ear
        self.ear_n += 1
        closed = ear < t.ear_closed
        if closed and self.eye_closed_since is None:
            self.eye_closed_since = now
        if not closed:
            if self.eye_was_closed and self.eye_closed_since and now - self.eye_closed_since < t.drowsy_seconds:
                m.blinks_total += 1
                self.blink_times.append(now)
            self.eye_closed_since = None
        self.eye_was_closed = closed
        while self.blink_times and now - self.blink_times[0] > 60:
            self.blink_times.popleft()
        m.blinks_per_min = len(self.blink_times)
        drowsy = self.eye_closed_since is not None and now - self.eye_closed_since >= t.drowsy_seconds

        # --- Mouth / yawns
        mar = _dist(pts[MOUTH_TOP], pts[MOUTH_BOTTOM]) / (_dist(pts[MOUTH_LEFT], pts[MOUTH_RIGHT]) + 1e-6)
        m.mar = round(mar, 3)
        if mar > t.mar_yawn:
            self.yawn_since = self.yawn_since or now
            if now - self.yawn_since >= t.yawn_seconds and not self.yawn_counted:
                m.yawns_total += 1
                self.yawn_counted = True
        else:
            self.yawn_since = None
            self.yawn_counted = False
        yawning = self.yawn_since is not None and now - self.yawn_since >= t.yawn_seconds

        # --- Head pose
        m.yaw, m.pitch, m.roll = self._head_pose(pts, w, h)

        # --- Gaze (iris ratio between eye corners; image is mirrored for the user)
        r_ratio = (pts[RIGHT_IRIS][0] - pts[33][0]) / (pts[133][0] - pts[33][0] + 1e-6)
        l_ratio = (pts[LEFT_IRIS][0] - pts[362][0]) / (pts[263][0] - pts[362][0] + 1e-6)
        ratio = (r_ratio + l_ratio) / 2
        m.gaze = "left" if ratio < t.gaze_low else "right" if ratio > t.gaze_high else "center"

        looking_away = abs(m.yaw) > t.yaw_limit or abs(m.pitch) > t.pitch_limit or m.gaze != "center"
        if looking_away:
            self.away_since = self.away_since or now
        else:
            self.away_since = None
        distracted = self.away_since is not None and now - self.away_since >= t.distract_seconds

        if drowsy:
            return "Drowsy"
        if yawning:
            return "Yawning"
        if distracted:
            return "Distracted"
        return "Focused"

    @staticmethod
    def _head_pose(pts, w, h):
        image_pts = np.array([pts[i] for i in POSE_POINTS], dtype=np.float64)
        cam = np.array([[w, 0, w / 2], [0, w, h / 2], [0, 0, 1]], dtype=np.float64)
        ok, rvec, _ = cv2.solvePnP(MODEL_3D, image_pts, cam, np.zeros((4, 1)), flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok:
            return 0.0, 0.0, 0.0
        rmat, _ = cv2.Rodrigues(rvec)
        angles, *_ = cv2.RQDecomp3x3(rmat)
        pitch, yaw, roll = angles

        def wrap(a):
            return a - 180 if a > 90 else a + 180 if a < -90 else a

        return round(wrap(yaw), 1), round(wrap(pitch), 1), round(wrap(roll), 1)

    def _update_percentages(self, m: Metrics, now: float):
        total = sum(self.state_time.values()) or 1e-6
        st = self.state_time
        m.focus_pct = round(100 * st["Focused"] / total, 1)
        m.distracted_pct = round(100 * st["Distracted"] / total, 1)
        m.drowsy_pct = round(100 * (st["Drowsy"] + st["Yawning"]) / total, 1)
        m.no_face_pct = round(100 * st["No Face"] / total, 1)
        m.elapsed_sec = round(now - self.start_time, 1)
        m.avg_ear = round(self.ear_sum / self.ear_n, 3) if self.ear_n else 0.0
        m.alarm = m.state == "Drowsy"
        if now - self.last_timeline_ts >= 2:  # one timeline point every 2 s
            self.last_timeline_ts = now
            self.timeline.append(
                {"t": m.elapsed_sec, "state": m.state, "focus_pct": m.focus_pct, "ear": m.ear}
            )

    # --------------------------------------------------------------- presence
    def _track_face(self, pts, box, w, h, m: Metrics):
        x0, y0, x1, y1 = box
        self.face_frames += 1
        self.face_size_sum += (x1 - x0) / w
        self.center_off_sum += abs((x0 + x1) / 2 / w - 0.5) + abs((y0 + y1) / 2 / h - 0.45)
        self.roll_sum += abs(m.roll)
        # mouth width relative to the outer eye corners grows when you smile
        self.smile_ratios.append(_dist(pts[61], pts[291]) / (_dist(pts[33], pts[263]) + 1e-6))

    def _track_quality(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        small = cv2.cvtColor(cv2.resize(frame_bgr, (160, max(1, int(160 * h / w)))), cv2.COLOR_BGR2GRAY)
        q = self.quality
        q["n"] += 1
        q["brightness"] += float(small.mean())
        q["contrast"] += float(small.std())
        q["sharpness"] += float(cv2.Laplacian(small, cv2.CV_64F).var())

    def presence(self) -> dict:
        """Averages for the interview coach (same keys as the browser's lib/presence.js)."""
        with self._lock:
            n, q = max(self.face_frames, 1), self.quality
            ratios = np.array(self.smile_ratios)
            smile_pct = None
            if len(ratios) > 20:  # smiling = mouth clearly wider than your own neutral face
                neutral = float(np.percentile(ratios, 25))
                smile_pct = round(100 * float((ratios > neutral * 1.12).mean()), 1)
            qn = max(q["n"], 1)
            return {
                "smile_pct": smile_pct,
                "expressiveness": round(float(np.std(ratios) / (np.mean(ratios) + 1e-6) * 100), 1) if len(ratios) > 20 else None,
                "face_visible_pct": round(100 * self.face_frames / max(self.frames, 1), 1),
                "face_size": round(self.face_size_sum / n, 3),
                "center_offset": round(self.center_off_sum / n, 3),
                "head_tilt": round(self.roll_sum / n, 1),
                "brightness": round(q["brightness"] / qn, 1),
                "contrast": round(q["contrast"] / qn, 1),
                "sharpness": round(q["sharpness"] / qn, 1),
                "width": self.resolution[0],
                "height": self.resolution[1],
                "eye_contact": self._m.focus_pct,
            }

    # ---------------------------------------------------------------- drawing
    @staticmethod
    def _draw_eyes(frame, pts):
        for idx in LEFT_EYE + RIGHT_EYE:
            cv2.circle(frame, tuple(pts[idx].astype(int)), 1, (0, 255, 0), -1)
        for idx in (LEFT_IRIS, RIGHT_IRIS):
            cv2.circle(frame, tuple(pts[idx].astype(int)), 3, (255, 255, 0), -1)

    @staticmethod
    def _panel(frame, x, y, pw, ph):
        """Darken one rectangle in place (only that region is blended, so the face stays untouched)."""
        roi = frame[y:y + ph, x:x + pw]
        roi[:] = (roi * 0.45 + np.array([18, 14, 10]) * 0.55).astype(np.uint8)

    @classmethod
    def _draw_overlay(cls, frame, m: Metrics, box):
        h, w = frame.shape[:2]
        s = w / 640  # scale text with the video size (640 → 1280 px)
        color = STATE_COLORS[m.state]
        thick = max(1, round(s))
        if box:
            x0, y0, x1, y1 = box
            cv2.rectangle(frame, (x0 - 10, y0 - 10), (x1 + 10, y1 + 10), color, 2 * thick)
            cv2.putText(frame, f"{m.state}", (x0 - 10, max(int(22 * s), y0 - 18)), cv2.FONT_HERSHEY_SIMPLEX,
                        0.7 * s, color, 2 * thick)

        lines = [
            f"FPS {m.fps:.0f}  EAR {m.ear:.2f}",
            f"Blinks {m.blinks_per_min}/min",
            f"Gaze {m.gaze}",
            f"Yaw {m.yaw:.0f}  Pitch {m.pitch:.0f}",
            f"Focus {m.focus_pct:.0f}%",
        ]
        fs, lh, pad = 0.42 * s, int(18 * s), int(8 * s)
        pw = int(150 * s)
        ph = pad * 2 + lh * len(lines)
        # put the panel on the side away from the face; if the face fills the frame use a strip at the bottom
        panel_left = box is None or (box[0] + box[2]) / 2 > w / 2
        px = pad if panel_left else w - pw - pad
        if box is None or px + pw < box[0] - 10 or px > box[2] + 10:
            cls._panel(frame, px, pad, pw, ph)
            for i, text in enumerate(lines):
                cv2.putText(frame, text, (px + pad, pad * 2 + int(lh * (i + 0.6))), cv2.FONT_HERSHEY_SIMPLEX, fs,
                            (235, 235, 235), thick, cv2.LINE_AA)
        else:
            sh = int(26 * s)
            cls._panel(frame, 0, h - sh, w, sh)
            cv2.putText(frame, "   ".join(lines), (pad, h - int(8 * s)), cv2.FONT_HERSHEY_SIMPLEX, fs,
                        (235, 235, 235), thick, cv2.LINE_AA)
        if m.alarm:
            cv2.rectangle(frame, (0, 0), (w - 1, h - 1), (0, 0, 255), 8)
            cv2.putText(frame, "WAKE UP!", (w // 2 - int(90 * s), h - int(50 * s)), cv2.FONT_HERSHEY_DUPLEX,
                        1.2 * s, (0, 0, 255), 3)
