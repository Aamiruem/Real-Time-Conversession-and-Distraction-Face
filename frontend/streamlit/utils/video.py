"""streamlit-webrtc video processor that runs the CV attention engine on each frame."""
import io
import os
import sys
import threading
import wave

import av
import numpy as np
from streamlit_webrtc import AudioProcessorBase, VideoProcessorBase

# backend/ holds the cv and speech engines this UI runs in-process
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cv.attention_detector import AttentionDetector  # noqa: E402
from speech.analyzer import SAMPLE_RATE  # noqa: E402

RTC_CONFIGURATION = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
MEDIA_CONSTRAINTS = {"video": {"width": 640, "height": 480, "frameRate": 20}, "audio": False}
MEDIA_CONSTRAINTS_WITH_MIC = {
    "video": MEDIA_CONSTRAINTS["video"],
    "audio": {"echoCancellation": True, "noiseSuppression": True, "autoGainControl": False},
}


class AttentionProcessor(VideoProcessorBase):
    def __init__(self):
        self.detector = AttentionDetector()

    def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        img = np.ascontiguousarray(img[:, ::-1])  # mirror like a selfie camera
        img = self.detector.process(img)
        return av.VideoFrame.from_ndarray(img, format="bgr24")


class AudioCollector(AudioProcessorBase):
    """Records the microphone as 16 kHz mono float32 for the speech coach (nothing is played back)."""

    MAX_SECONDS = 300

    def __init__(self):
        self._resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        self._chunks: list[np.ndarray] = []
        self._samples = 0
        self._lock = threading.Lock()
        self.level_db = -90.0

    def _collect(self, frame: av.AudioFrame):
        for out in self._resampler.resample(frame):
            pcm = out.to_ndarray().reshape(-1).astype(np.float32) / 32768.0
            self.level_db = float(20 * np.log10(np.sqrt(np.mean(pcm ** 2)) + 1e-9))
            with self._lock:
                if self._samples < self.MAX_SECONDS * SAMPLE_RATE:
                    self._chunks.append(pcm)
                    self._samples += len(pcm)

    @staticmethod
    def _silent(frame: av.AudioFrame) -> av.AudioFrame:
        # The track must be sent back or streamlit-webrtc never pulls (processes) it — send silence, no echo.
        out = av.AudioFrame.from_ndarray(np.zeros_like(frame.to_ndarray()), format=frame.format.name,
                                         layout=frame.layout.name)
        out.sample_rate, out.pts, out.time_base = frame.sample_rate, frame.pts, frame.time_base
        return out

    def recv(self, frame: av.AudioFrame) -> av.AudioFrame:
        self._collect(frame)
        return self._silent(frame)

    async def recv_queued(self, frames: list[av.AudioFrame]) -> list[av.AudioFrame]:
        for f in frames:  # keep every frame: the default implementation drops all but the last
            self._collect(f)
        return [self._silent(f) for f in frames]

    @property
    def seconds(self) -> float:
        return self._samples / SAMPLE_RATE

    def audio(self) -> np.ndarray:
        with self._lock:
            return np.concatenate(self._chunks) if self._chunks else np.zeros(0, np.float32)


def to_wav(audio: np.ndarray, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


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
    tone = np.sin(2 * np.pi * freq * t) * (t * 8 % 1 < 0.5) * 0.6
    return to_wav(tone, rate)
