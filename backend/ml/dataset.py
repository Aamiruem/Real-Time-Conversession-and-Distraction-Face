"""Training data: a synthetic bootstrap set + real sessions that users labelled.

Cold start: there are no labelled sessions on day one, so we simulate sessions from a latent
"fatigue" variable using known effects (longer + later sessions, more blinking/yawning, lower
eye openness, more drowsy/distracted time all go with fatigue). As users answer
"How tired do you feel?" after a session, those real rows are added (and up-weighted) so the
model gradually learns from actual behaviour.
"""
import numpy as np
import pandas as pd

from ml.features import FEATURES, from_session


def synthetic(n: int = 3000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    hour = rng.integers(6, 24, n) % 24
    late = np.clip((hour - 18) / 6, 0, 1) + (hour < 6)
    duration = rng.gamma(2.2, 18, n).clip(2, 240)
    fatigue = np.clip(0.35 * rng.beta(2, 3, n) + 0.30 * late + 0.25 * np.clip(duration / 150, 0, 1)
                      + rng.normal(0, 0.08, n), 0, 1)

    drowsy = np.clip(30 * fatigue ** 2 + rng.normal(0, 3, n), 0, 60)
    distracted = np.clip(8 + 22 * fatigue + rng.normal(0, 6, n), 0, 70)
    no_face = np.clip(rng.exponential(4, n) + 6 * fatigue, 0, 40)
    focus = np.clip(100 - drowsy - distracted - no_face, 0, 100)
    total = drowsy + distracted + no_face + focus
    df = pd.DataFrame({
        "duration_min": duration.round(2),
        "hour": hour,
        "focus_pct": (100 * focus / total).round(1),
        "distracted_pct": (100 * distracted / total).round(1),
        "drowsy_pct": (100 * drowsy / total).round(1),
        "no_face_pct": (100 * no_face / total).round(1),
        "blinks_per_min": np.clip(14 + 14 * fatigue + rng.normal(0, 4, n), 3, 50).round(2),
        "yawns_per_10min": np.clip(rng.poisson(0.3 + 3.5 * fatigue ** 1.5), 0, 15).astype(float),
        "avg_ear": np.clip(0.31 - 0.08 * fatigue + rng.normal(0, 0.015, n), 0.15, 0.40).round(3),
    })
    noisy = fatigue + rng.normal(0, 0.04, n)
    df["label"] = np.digitize(noisy, np.quantile(noisy, [0.5, 0.8]))  # ~50% low, 30% medium, 20% high
    df["source"] = "synthetic"
    return df


def from_database(engine) -> pd.DataFrame:
    """Sessions where the user reported how tired they felt (self_fatigue 0/1/2)."""
    from sqlalchemy import text

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT started_at, duration_sec, focus_pct, distracted_pct, drowsy_pct, no_face_pct, total_blinks, "
            "total_yawns, avg_ear, self_fatigue FROM attention_sessions WHERE self_fatigue IS NOT NULL"
        )).mappings().all()
    if not rows:
        return pd.DataFrame(columns=FEATURES + ["label", "source"])
    df = pd.DataFrame([{**from_session(dict(r)), "label": int(r["self_fatigue"])} for r in rows])
    df["source"] = "user"
    return df
