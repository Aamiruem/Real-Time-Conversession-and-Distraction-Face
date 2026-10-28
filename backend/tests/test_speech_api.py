import io
import wave

import numpy as np


def _wav(seconds: float) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.random.default_rng(0).normal(0, 50, int(16000 * seconds))).astype(np.int16).tobytes())
    return buf.getvalue()


def test_speech_upload_validation(client, verified_user):
    headers, _ = verified_user
    bad = client.post("/speech/analyze", headers=headers, files={"audio": ("x.webm", b"not audio", "audio/webm")})
    assert bad.status_code == 400
    short = client.post("/speech/analyze", headers=headers, files={"audio": ("x.wav", _wav(1), "audio/wav")})
    assert short.status_code == 400 and "too short" in short.json()["detail"]
    silent = client.post("/speech/analyze", headers=headers, data={"save": "false"},
                         files={"audio": ("x.wav", _wav(5), "audio/wav")})
    assert silent.status_code == 422  # no speech detected
