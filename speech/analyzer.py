"""Speech coach engine: turns a voice recording into confidence + pronunciation feedback.

  * Transcript  -> faster-whisper (local, offline after first model download) with per-word timing
  * Pace        -> words per minute while speaking
  * Fluency     -> filler words (um, uh, you know…) and hesitation pauses
  * Clarity     -> how confidently each word was recognised (a pronunciation proxy); in read-aloud
                   mode the transcript is also aligned to the passage to find missed / misread words
  * Voice       -> loudness and pitch variation (monotone vs. expressive) from the raw signal
  * Assertive   -> hedging language (I think, maybe, sort of…)
  * Eye contact -> focus % from the face attention engine while speaking
All of it is combined into a 0-100 confidence score with concrete coaching tips.
"""
import difflib
import re
from functools import lru_cache

import numpy as np

SAMPLE_RATE = 16000

FILLER_RE = re.compile(r"^(u+h+m*|u+m+|e+r+m*|a+h+|h+m+|m{2,}|eh)$")  # um, uhh, erm, ahh, hmm…
FILLER_PHRASES = ["you know", "i mean", "basically", "literally", "like i said"]
HEDGES = [
    "i think", "i guess", "i feel like", "maybe", "probably", "perhaps", "sort of", "kind of",
    "i'm not sure", "not sure", "hopefully", "i suppose", "just", "sorry", "a little bit",
]
# Whisper drops disfluencies unless the prompt shows them, so prime it with some.
FILLER_PROMPT = "Umm, let me think like, hmm... Okay, uh, here's what I'm, you know, thinking."

WEIGHTS = {"fluency": 0.22, "pace": 0.14, "voice": 0.14, "assertiveness": 0.14, "clarity": 0.18, "eye_contact": 0.18}
LABELS = {
    "fluency": "Fluency", "pace": "Pace", "voice": "Voice energy", "assertiveness": "Assertiveness",
    "clarity": "Pronunciation clarity", "eye_contact": "Eye contact",
}


@lru_cache(maxsize=2)
def load_model(size: str = "base.en"):
    from faster_whisper import WhisperModel

    return WhisperModel(size, device="cpu", compute_type="int8")


def _norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


def _is_filler(word: str) -> bool:
    return bool(FILLER_RE.match(_norm(word)))


def _clamp(v: float) -> float:
    return float(max(0.0, min(100.0, v)))


# ------------------------------------------------------------------ transcript
def transcribe(audio: np.ndarray, model_size: str = "base.en") -> list[dict]:
    segments, _ = load_model(model_size).transcribe(
        audio, language="en", word_timestamps=True, vad_filter=True,
        initial_prompt=FILLER_PROMPT, condition_on_previous_text=False,
    )
    return [
        {"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2), "prob": round(w.probability, 3)}
        for seg in segments for w in seg.words if w.word.strip()
    ]


def _count_phrases(text: str, phrases: list[str]) -> dict[str, int]:
    found = {}
    for p in phrases:
        n = len(re.findall(rf"\b{re.escape(p)}\b", text))
        if n:
            found[p] = n
    return found


# ---------------------------------------------------------------- raw signal
def voice_features(audio: np.ndarray) -> dict:
    """Loudness and pitch statistics of the voiced part of the recording."""
    n, hop = 1024, 320  # 64 ms windows every 20 ms
    if len(audio) < n:
        return {"loudness_db": -90.0, "loudness_std": 0.0, "pitch_hz": 0.0, "pitch_var_st": 0.0, "voiced_sec": 0.0}
    idx = np.arange(n)[None, :] + hop * np.arange((len(audio) - n) // hop + 1)[:, None]
    frames = audio[idx] * np.hanning(n)
    rms_db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    speaking = rms_db > max(-50.0, np.percentile(rms_db, 20) + 8)

    # autocorrelation pitch tracker, 75-400 Hz
    frames = frames - frames.mean(axis=1, keepdims=True)
    ac = np.fft.irfft(np.abs(np.fft.rfft(frames, 2 * n)) ** 2)[:, :n]
    lo, hi = SAMPLE_RATE // 400, SAMPLE_RATE // 75
    lag = np.argmax(ac[:, lo:hi], axis=1) + lo
    strength = ac[np.arange(len(ac)), lag] / (ac[:, 0] + 1e-9)
    voiced = speaking & (strength > 0.45)
    f0 = SAMPLE_RATE / lag[voiced]

    if len(f0) > 5:
        med = float(np.median(f0))
        semis = 12 * np.log2(f0 / med)
        semis = semis[np.abs(semis) < 12]  # drop octave errors
        pitch_var = float(np.std(semis)) if len(semis) else 0.0
    else:
        med, pitch_var = 0.0, 0.0
    loud = rms_db[speaking]
    return {
        "loudness_db": round(float(loud.mean()), 1) if len(loud) else -90.0,
        "loudness_std": round(float(loud.std()), 1) if len(loud) else 0.0,
        "pitch_hz": round(med, 1),
        "pitch_var_st": round(pitch_var, 2),
        "voiced_sec": round(float(speaking.sum()) * hop / SAMPLE_RATE, 1),
    }


# ------------------------------------------------------------ read-aloud check
def compare_to_passage(words: list[dict], passage: str) -> dict:
    said = [_norm(w["word"]) for w in words if _norm(w["word"]) and not _is_filler(w["word"])]
    target = [w for w in (_norm(t) for t in passage.split()) if w]
    sm = difflib.SequenceMatcher(a=target, b=said, autojunk=False)
    missed, misread = [], []
    matched = sum(b.size for b in sm.get_matching_blocks())
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "delete":
            missed += target[a0:a1]
        elif op == "replace":
            if "".join(target[a0:a1]) == "".join(said[b0:b1]):  # "sea shells" vs "seashells"
                matched += a1 - a0
            else:
                misread.append({"expected": " ".join(target[a0:a1]), "heard": " ".join(said[b0:b1])})
    return {"accuracy": round(100 * matched / max(len(target), 1), 1), "missed": missed[:15], "misread": misread[:15]}


# -------------------------------------------------------------------- analysis
def analyze(audio: np.ndarray, *, eye_contact: float | None = None, passage: str | None = None,
            model_size: str = "base.en") -> dict:
    """Full coaching report for one recording (float32 mono, 16 kHz)."""
    audio = np.asarray(audio, dtype=np.float32)
    duration = len(audio) / SAMPLE_RATE
    words = transcribe(audio, model_size)
    if len([w for w in words if not _is_filler(w["word"])]) < 4:
        return {"error": "Not enough speech detected — speak for at least a few sentences, close to the mic."}

    transcript = " ".join(w["word"] for w in words)
    lower = " " + " ".join(_norm(w["word"]) for w in words) + " "
    for w in words:
        w["filler"] = _is_filler(w["word"])
        w["unclear"] = not w["filler"] and w["prob"] < 0.55

    speak_min = max((words[-1]["end"] - words[0]["start"]) / 60, 1 / 60)
    content = [w for w in words if not w["filler"]]
    wpm = len(content) / speak_min

    fillers = _count_phrases(lower, FILLER_PHRASES)
    for w in words:
        if w["filler"]:
            fillers[_norm(w["word"])] = fillers.get(_norm(w["word"]), 0) + 1
    filler_total = sum(fillers.values())
    hedges = _count_phrases(lower, HEDGES)
    hedge_total = sum(hedges.values())

    gaps = [b["start"] - a["end"] for a, b in zip(words, words[1:])]
    pauses = sum(1 for g in gaps if 0.6 <= g < 2.0)
    long_pauses = sum(1 for g in gaps if g >= 2.0)

    clarity = 100 * float(np.mean([w["prob"] for w in content]))
    unclear = sorted({w["word"].strip(".,!?") for w in content if w["unclear"]})[:12]
    voice = voice_features(audio)

    # ---- sub-scores (0-100)
    scores = {
        "pace": _clamp(100 - 1.5 * max(0, 120 - wpm, wpm - 165)),
        "fluency": _clamp(100 - 5 * 100 * filler_total / max(len(content), 1) - 8 * long_pauses),
        "clarity": _clamp((clarity - 50) / 40 * 100),
        "assertiveness": _clamp(100 - 6 * 100 * hedge_total / max(len(content), 1)),  # -6 per hedge / 100 words
    }
    pv = voice["pitch_var_st"]
    expressive = 45 if pv < 1.2 else 70 if pv < 2.0 else 100 if pv <= 6 else 80
    quiet_penalty = _clamp((-38 - voice["loudness_db"]) * 4)
    scores["voice"] = _clamp(expressive - quiet_penalty)

    reading = compare_to_passage(words, passage) if passage else None
    if reading:
        scores["clarity"] = round(0.4 * scores["clarity"] + 0.6 * reading["accuracy"], 1)
    if eye_contact is not None:
        scores["eye_contact"] = _clamp(eye_contact)

    weights = {k: w for k, w in WEIGHTS.items() if k in scores}
    confidence = sum(scores[k] * w for k, w in weights.items()) / sum(weights.values())
    scores = {k: round(v, 1) for k, v in scores.items()}

    metrics = {
        "duration_sec": round(duration, 1), "words": len(content), "wpm": round(wpm),
        "fillers": filler_total, "filler_breakdown": fillers, "hedges": hedge_total, "hedge_breakdown": hedges,
        "pauses": pauses, "long_pauses": long_pauses, "clarity_pct": round(clarity, 1), "unclear_words": unclear,
        **voice, "eye_contact": None if eye_contact is None else round(eye_contact, 1),
    }
    return {
        "confidence": round(confidence, 1),
        "level": level(confidence),
        "scores": scores,
        "metrics": metrics,
        "reading": reading,
        "transcript": transcript,
        "words": words,
        "improved": confident_rewrite(transcript),
        "tips": coaching_tips(scores, metrics, reading),
        "strengths": strengths(scores, metrics),
    }


def level(score: float) -> str:
    if score >= 85:
        return "Commanding — you sound sure of yourself"
    if score >= 70:
        return "Confident — a few habits to polish"
    if score >= 50:
        return "Getting there — noticeable hesitation"
    return "Nervous — let's build your confidence step by step"


def confident_rewrite(text: str) -> str:
    """Same message without fillers and hedges — what it sounds like said with conviction."""
    out = " " + text + " "
    for p in sorted(FILLER_PHRASES + HEDGES, key=len, reverse=True) * 2:  # twice: "I just think" -> "I think" -> ""
        out = re.sub(rf"(?i),?\s*(?<![\w']){re.escape(p)}(?![\w'])\s*,?", " ", out)
    out = " ".join(w for w in out.split() if not _is_filler(w.strip(",.")))
    out = re.sub(r"\s+([,.!?])", r"\1", out).strip(" ,")
    out = re.sub(r"([.!?])\s*,", r"\1", out)
    return re.sub(r"(^|[.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)


def coaching_tips(scores: dict, m: dict, reading: dict | None) -> list[dict]:
    tips = []
    if m["fillers"]:
        top = ", ".join(f"“{k}” ×{v}" for k, v in sorted(m["filler_breakdown"].items(), key=lambda x: -x[1])[:3])
        tips.append({"area": "fluency", "title": "Replace filler words with a silent pause",
                     "detail": f"You used {m['fillers']} fillers ({top}). When you feel an “um” coming, close your "
                               "mouth and pause for a breath instead — a short silence sounds thoughtful, a filler "
                               "sounds unsure."})
    if m["long_pauses"]:
        tips.append({"area": "fluency", "title": "Plan your next point before you stop",
                     "detail": f"{m['long_pauses']} pause(s) were longer than 2 s. Structure answers as "
                               "Point → Reason → Example → Point so you always know what comes next."})
    if m["wpm"] > 165:
        tips.append({"area": "pace", "title": "Slow down",
                     "detail": f"You spoke at {m['wpm']} words/min; aim for 120–160. Pause at every full stop "
                               "and stress the key word of each sentence — fast speech reads as nervous."})
    elif m["wpm"] < 120:
        tips.append({"area": "pace", "title": "Pick up the pace a little",
                     "detail": f"You spoke at {m['wpm']} words/min; aim for 120–160. Know your opening line "
                               "by heart so you start with momentum."})
    if m["hedges"]:
        top = ", ".join(f"“{k}”" for k in list(m["hedge_breakdown"])[:4])
        tips.append({"area": "assertiveness", "title": "Drop the hedging words",
                     "detail": f"Phrases like {top} weaken your message. Say “I recommend…” instead of "
                               "“I think maybe we could…”. See the confident version of your answer below."})
    if m["pitch_var_st"] and m["pitch_var_st"] < 2.0:
        tips.append({"area": "voice", "title": "Add vocal variety",
                     "detail": "Your pitch stayed quite flat (monotone). Lift your voice on important words and "
                               "drop it at the end of statements — ending low sounds certain, ending high sounds "
                               "like a question."})
    if m["loudness_db"] < -38:
        tips.append({"area": "voice", "title": "Project your voice",
                     "detail": "You were quiet. Sit up, breathe from your belly and speak to the back of the room, "
                               "not to the screen."})
    if m["unclear_words"]:
        tips.append({"area": "clarity", "title": "Articulate these words more clearly",
                     "detail": "These were hard to recognise: " + ", ".join(m["unclear_words"][:8]) +
                               ". Say them slowly, open your mouth more and finish the final consonants."})
    if reading and (reading["missed"] or reading["misread"]):
        pairs = ", ".join(f"“{p['expected']}” (heard “{p['heard']}”)" for p in reading["misread"][:4])
        detail = f"Reading accuracy {reading['accuracy']}%. "
        if pairs:
            detail += f"Practise: {pairs}. "
        if reading["missed"]:
            detail += "Skipped: " + ", ".join(reading["missed"][:6]) + "."
        tips.append({"area": "clarity", "title": "Pronunciation practice", "detail": detail})
    if m["eye_contact"] is not None and m["eye_contact"] < 70:
        tips.append({"area": "eye_contact", "title": "Hold eye contact with the camera",
                     "detail": f"You looked at the camera only {m['eye_contact']:.0f}% of the time. Put a sticky "
                               "note next to the lens and talk to it like it's a person."})
    tips.sort(key=lambda t: scores.get(t["area"], 100))
    if not tips:
        tips.append({"area": "general", "title": "Keep going!",
                     "detail": "No major issues. Next level: tell a short story with a clear beginning, a "
                               "challenge and a result."})
    return tips


def strengths(scores: dict, m: dict) -> list[str]:
    out = []
    if scores.get("pace", 0) >= 90:
        out.append(f"Great pace ({m['wpm']} words/min)")
    if scores.get("fluency", 0) >= 85:
        out.append("Smooth delivery with very few fillers")
    if scores.get("assertiveness", 0) >= 85:
        out.append("Direct, assertive wording")
    if scores.get("clarity", 0) >= 85:
        out.append("Clear pronunciation")
    if scores.get("voice", 0) >= 85:
        out.append("Expressive, well-projected voice")
    if scores.get("eye_contact", 0) >= 85:
        out.append("Strong eye contact")
    return out
