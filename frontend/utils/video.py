"""streamlit-webrtc video processor that runs the CV attention engine on each frame."""
import io
import os
import sys
import wave

import av
import numpy as np
from streamlit_webrtc import VideoProcessorBase

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cv.attention_detector import AttentionDetector  # noqa: E402

RTC_CONFIGURATION = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
MEDIA_CONSTRAINTS = {"video": {"width": 640, "height": 480, "frameRate": 20}, "audio": False}


class AttentionProcessor(VideoProcessorBase):
    def __init__(self):
        self.detector = AttentionDetector()

    def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        img = np.ascontiguousarray(img[:, ::-1])  # mirror like a selfie camera
        img = self.detector.process(img)
        return av.VideoFrame.from_ndarray(img, format="bgr24")


def metrics_to_payload(m) -> dict:
    """Fields the backend /attention/update endpoint expects."""
    return {
        "state": m.state,
        "focus_pct": m.focus_pct,
        "distracted_pct": m.distracted_pct,
        "ear": m.ear,
        "yaw": m.yaw,
        "pitch": m.pitch,
        "gaze": m.gaze,
    }


def alarm_wav(freq=880, seconds=0.8, rate=22050) -> bytes:
    """Generate a short beep used as the drowsiness alarm."""
    t = np.linspace(0, seconds, int(rate * seconds), endpoint=False)
    tone = (np.sin(2 * np.pi * freq * t) * (t * 8 % 1 < 0.5) * 0.6 * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(tone.tobytes())
    return buf.getvalue()
