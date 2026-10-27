"""Decode any audio/video file (wav, mp3, m4a, ogg, webm…) to float32 mono 16 kHz for the analyzer."""
import io

import av
import numpy as np

from speech.analyzer import SAMPLE_RATE


def decode_audio(data: bytes) -> np.ndarray:
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    chunks = []
    with av.open(io.BytesIO(data)) as container:
        for frame in container.decode(audio=0):
            chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
    chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    return (np.concatenate(chunks).astype(np.float32) / 32768.0) if chunks else np.zeros(0, np.float32)
