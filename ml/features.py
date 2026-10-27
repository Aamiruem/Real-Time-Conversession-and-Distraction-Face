"""Feature definitions shared by training, the API and the AI Lab.

One row = one finished focus session (backend table `attention_sessions`).
Target = fatigue risk after the session: 0 low, 1 medium, 2 high.
"""
from datetime import datetime

FEATURES = [
    "duration_min",      # session length
    "hour",              # local hour the session started (late nights tire people out)
    "focus_pct",         # % of time looking at the screen, eyes open
    "distracted_pct",    # % looking away
    "drowsy_pct",        # % eyes closed too long / yawning
    "no_face_pct",       # % away from the camera
    "blinks_per_min",    # blink rate rises with eye strain
    "yawns_per_10min",
    "avg_ear",           # eye aspect ratio — lower means heavier eyelids
]
LABELS = ["low", "medium", "high"]
DESCRIPTIONS = {
    "duration_min": "Session length (min)",
    "hour": "Start hour (0-23)",
    "focus_pct": "Focused %",
    "distracted_pct": "Distracted %",
    "drowsy_pct": "Drowsy %",
    "no_face_pct": "Away %",
    "blinks_per_min": "Blinks / min",
    "yawns_per_10min": "Yawns / 10 min",
    "avg_ear": "Avg eye openness (EAR)",
}


def from_session(s: dict) -> dict:
    """Turn a saved AttentionSession (API/DB dict) into model features."""
    minutes = max(float(s.get("duration_sec", 0)) / 60, 0.1)
    started = s.get("started_at")
    if isinstance(started, str):
        started = datetime.fromisoformat(started.replace("Z", "+00:00"))
    return {
        "duration_min": round(minutes, 2),
        "hour": started.hour if started else 12,
        "focus_pct": float(s.get("focus_pct", 0)),
        "distracted_pct": float(s.get("distracted_pct", 0)),
        "drowsy_pct": float(s.get("drowsy_pct", 0)),
        "no_face_pct": float(s.get("no_face_pct", 0)),
        "blinks_per_min": round(float(s.get("total_blinks", 0)) / minutes, 2),
        "yawns_per_10min": round(float(s.get("total_yawns", 0)) / minutes * 10, 2),
        "avg_ear": float(s.get("avg_ear", 0)) or 0.28,
    }
