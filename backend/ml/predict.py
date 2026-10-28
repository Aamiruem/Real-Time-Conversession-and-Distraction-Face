"""Load the trained fatigue model and explain its predictions."""
import json
import threading

import joblib
import pandas as pd

from ml.features import DESCRIPTIONS, FEATURES, LABELS
from ml.train import CARD_PATH, MODEL_PATH, train

_lock = threading.Lock()
_model = None
_card: dict | None = None

ADVICE = {
    "low": "You're fresh — a good time for deep, demanding work.",
    "medium": "Fatigue is building. Take a 5-minute break: stand up, drink water, look 20 ft away for 20 s.",
    "high": "High fatigue risk. Stop for 15-20 minutes (walk, fresh air, or a short power nap) before "
            "continuing — and avoid long sessions late at night.",
}


def load():
    """Return (model, card); trains the bootstrap model on first use if no artifact exists yet."""
    global _model, _card
    with _lock:
        if _model is None:
            if not MODEL_PATH.exists():
                train(quiet=True)
            _model = joblib.load(MODEL_PATH)
            _card = json.loads(CARD_PATH.read_text())
    return _model, _card


def reload():
    global _model
    with _lock:
        _model = None
    return load()


def predict(features: dict) -> dict:
    model, card = load()
    row = pd.DataFrame([{f: float(features[f]) for f in FEATURES}])
    proba = model.predict_proba(row)[0]
    label = LABELS[int(proba.argmax())]

    # local explanation: how much each feature moves P(high) when set to a typical (median-like) value
    baseline = {"duration_min": 40, "hour": 14, "focus_pct": 75, "distracted_pct": 15, "drowsy_pct": 3,
                "no_face_pct": 7, "blinks_per_min": 17, "yawns_per_10min": 0.5, "avg_ear": 0.29}
    p_high = proba[2] + 0.5 * proba[1]
    effects = []
    for f in FEATURES:
        alt = row.copy()
        alt[f] = baseline[f]
        pa = model.predict_proba(alt)[0]
        delta = p_high - (pa[2] + 0.5 * pa[1])
        if abs(delta) >= 0.02:
            effects.append({"feature": f, "label": DESCRIPTIONS[f], "value": features[f], "typical": baseline[f],
                            "effect": round(float(delta), 3)})
    effects.sort(key=lambda e: -abs(e["effect"]))
    return {
        "risk": label,
        "probabilities": {lbl: round(float(p), 3) for lbl, p in zip(LABELS, proba)},
        "risk_score": round(float(100 * p_high), 1),
        "factors": effects[:5],
        "advice": ADVICE[label],
        "model": {"algorithm": card["algorithm"], "trained_at": card["trained_at"],
                  "test_f1_macro": card["test"]["f1_macro"]},
    }
