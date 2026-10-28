"""Train the fatigue-risk classifier.

    python -m ml.train                 # synthetic bootstrap data only
    python -m ml.train --with-db       # + sessions users labelled (uses DATABASE_URL from .env)

Compares two scikit-learn pipelines with 5-fold cross-validation, keeps the best, evaluates it
on a held-out test split and writes ml/artifacts/{fatigue_model.joblib, model_card.json}.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.dataset import from_database, synthetic
from ml.features import FEATURES, LABELS

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = ARTIFACTS / "fatigue_model.joblib"
CARD_PATH = ARTIFACTS / "model_card.json"
USER_WEIGHT = 5.0  # a real labelled session counts as much as 5 simulated ones

CANDIDATES = {
    "logistic_regression": lambda: Pipeline([("scale", StandardScaler()),
                                             ("clf", LogisticRegression(max_iter=2000, C=1.0))]),
    "random_forest": lambda: Pipeline([("clf", RandomForestClassifier(n_estimators=150, min_samples_leaf=3,
                                                                      random_state=7))]),
    "gradient_boosting": lambda: Pipeline([("clf", GradientBoostingClassifier(random_state=7))]),
}


def load_data(with_db: bool) -> pd.DataFrame:
    frames = [synthetic()]
    if with_db:
        from sqlalchemy import create_engine
        from dotenv import load_dotenv

        load_dotenv()
        url = os.getenv("DATABASE_URL", "sqlite:///./focuslink.db")
        frames.append(from_database(create_engine(url)))
    return pd.concat(frames, ignore_index=True)


def train(with_db: bool = False, quiet: bool = False) -> dict:
    df = load_data(with_db)
    X, y = df[FEATURES].astype(float), df["label"].astype(int)
    w = np.where(df["source"] == "user", USER_WEIGHT, 1.0)
    X_tr, X_te, y_tr, y_te, w_tr, _ = train_test_split(X, y, w, test_size=0.2, stratify=y, random_state=7)

    cv = StratifiedKFold(5, shuffle=True, random_state=7)
    scores = {name: float(cross_val_score(make(), X_tr, y_tr, cv=cv, scoring="f1_macro").mean())
              for name, make in CANDIDATES.items()}
    best = max(scores, key=scores.get)
    model = CANDIDATES[best]()
    model.fit(X_tr, y_tr, clf__sample_weight=w_tr)

    pred = model.predict(X_te)
    imp = permutation_importance(model, X_te, y_te, n_repeats=5, random_state=7, scoring="f1_macro")
    card = {
        "name": "FocusLink fatigue-risk classifier",
        "task": "Predict fatigue risk (low / medium / high) from a finished focus session",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "algorithm": best,
        "cv_f1_macro": {k: round(v, 4) for k, v in scores.items()},
        "test": {
            "accuracy": round(accuracy_score(y_te, pred), 4),
            "f1_macro": round(f1_score(y_te, pred, average="macro"), 4),
            "confusion_matrix": confusion_matrix(y_te, pred).tolist(),
            "report": classification_report(y_te, pred, target_names=LABELS, output_dict=True),
        },
        "feature_importance": dict(sorted(
            {f: round(float(v), 4) for f, v in zip(FEATURES, imp.importances_mean)}.items(),
            key=lambda kv: -kv[1])),
        "features": FEATURES,
        "labels": LABELS,
        "data": {"rows": len(df), "synthetic": int((df["source"] == "synthetic").sum()),
                 "user_labelled": int((df["source"] == "user").sum())},
        "limitations": "Bootstrapped on simulated sessions; predictions become personal only as users "
                       "label real sessions. Not a medical assessment.",
    }
    ARTIFACTS.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    CARD_PATH.write_text(json.dumps(card, indent=2))
    if not quiet:
        print(f"best={best}  cv_f1={scores}  test_acc={card['test']['accuracy']}  "
              f"test_f1={card['test']['f1_macro']}  rows={card['data']}")
    return card


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--with-db", action="store_true", help="include user-labelled sessions from the database")
    train(parser.parse_args().with_db)
