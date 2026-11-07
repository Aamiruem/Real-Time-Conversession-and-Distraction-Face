"""The optional advanced layer for training (requirements-advanced.txt): XGBoost, a PyTorch network, MLflow tracking.

Used by `python -m ml.train --advanced --mlflow`. Nothing here is imported by the API unless a saved model needs it,
so servers without these packages keep working.
"""
import os
from importlib.util import find_spec
from pathlib import Path

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

MLRUNS = Path(__file__).resolve().parent.parent / "mlruns"


class TorchMLP(ClassifierMixin, BaseEstimator):
    """A small PyTorch neural network with the scikit-learn interface, so it competes like any other candidate."""

    def __init__(self, hidden: int = 64, epochs: int = 40, lr: float = 0.003, weight_decay: float = 0.001, seed: int = 7):
        self.hidden, self.epochs, self.lr, self.weight_decay, self.seed = hidden, epochs, lr, weight_decay, seed

    def _network(self, inputs: int, outputs: int):
        from torch import nn

        return nn.Sequential(nn.Linear(inputs, self.hidden), nn.ReLU(), nn.Dropout(0.15),
                             nn.Linear(self.hidden, self.hidden), nn.ReLU(), nn.Linear(self.hidden, outputs))

    def fit(self, X, y, sample_weight=None):
        import torch

        torch.manual_seed(self.seed)
        self.classes_ = np.unique(y)
        features = torch.as_tensor(np.asarray(X), dtype=torch.float32)
        labels = torch.as_tensor(np.searchsorted(self.classes_, np.asarray(y)), dtype=torch.long)
        weights = torch.as_tensor(np.ones(len(labels)) if sample_weight is None else np.asarray(sample_weight), dtype=torch.float32)
        net = self._network(features.shape[1], len(self.classes_))
        optimiser = torch.optim.Adam(net.parameters(), lr=self.lr, weight_decay=self.weight_decay)
        loss_of = torch.nn.CrossEntropyLoss(reduction="none")
        net.train()
        for _ in range(self.epochs):
            for batch in torch.randperm(len(labels)).split(64):
                optimiser.zero_grad()
                loss = (loss_of(net(features[batch]), labels[batch]) * weights[batch]).sum() / weights[batch].sum()
                loss.backward()
                optimiser.step()
        self.n_features_in_ = features.shape[1]
        self.weights_ = {k: v.numpy().copy() for k, v in net.state_dict().items()}  # plain arrays: pickles cleanly
        return self

    def predict_proba(self, X):
        import torch

        net = self._network(self.n_features_in_, len(self.classes_))
        net.load_state_dict({k: torch.as_tensor(v) for k, v in self.weights_.items()})
        net.eval()
        with torch.no_grad():
            return torch.softmax(net(torch.as_tensor(np.asarray(X), dtype=torch.float32)), dim=1).numpy()

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]


def candidates() -> dict:
    """Extra models for the training contest, for whichever packages are installed."""
    extra = {}
    if find_spec("xgboost"):
        from xgboost import XGBClassifier

        extra["xgboost"] = lambda: Pipeline([("clf", XGBClassifier(
            n_estimators=500, learning_rate=0.02, max_depth=3, min_child_weight=5, reg_lambda=5, subsample=0.8,
            colsample_bytree=0.8, eval_metric="mlogloss", random_state=7))])
    if find_spec("torch"):
        extra["pytorch_mlp"] = lambda: Pipeline([("scale", StandardScaler()), ("clf", TorchMLP())])
    return extra


def log_run(card: dict) -> str | None:
    """Record a training run in MLflow (backend/mlruns; view with `mlflow ui --backend-store-uri mlruns`).
    Returns the run id, or None when MLflow isn't installed."""
    if not find_spec("mlflow"):
        return None
    # MLflow 3 wants a database for tracking, which needs alembic; plain files are enough for one person's training runs
    os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")
    import mlflow

    mlflow.set_tracking_uri(MLRUNS.as_uri())
    mlflow.set_experiment("fatigue-risk")
    with mlflow.start_run() as run:
        mlflow.log_params({"algorithm": card["algorithm"], **card["data"]})
        mlflow.log_metrics({"test_accuracy": card["test"]["accuracy"], "test_f1_macro": card["test"]["f1_macro"],
                            "baseline_accuracy": card["test"]["baseline_accuracy"],
                            **{f"cv_f1_{k}": v for k, v in card["cv_f1_macro"].items()}})
        mlflow.log_dict(card, "model_card.json")
        return run.info.run_id
