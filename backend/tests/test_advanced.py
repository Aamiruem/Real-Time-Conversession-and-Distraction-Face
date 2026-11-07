"""The optional advanced layer. Each test is skipped when its package isn't installed, as on the production servers."""
import pickle

import numpy as np
import pytest

from app import db_cli, status
from coach import assistant, semantic


def test_retrieve_uses_meaning_and_admits_when_nothing_matches(monkeypatch):
    monkeypatch.setattr(semantic, "search", lambda q, docs: [(7, 0.61), (2, 0.40), (5, 0.20)])
    assert assistant.retrieve("anything", k=3) == [assistant._DOCS[7], assistant._DOCS[2]]  # 0.20 is below the cutoff
    monkeypatch.setattr(semantic, "search", lambda q, docs: [(7, 0.15), (2, 0.10)])
    assert assistant.retrieve("best pizza in Delhi") == []


def test_retrieve_falls_back_to_keywords_without_embeddings(monkeypatch):
    monkeypatch.setattr(semantic, "search", lambda q, docs: None)
    assert any("filler" in p.lower() or "silent" in p.lower() for p in assistant.retrieve("How do I stop saying um?"))


def test_search_does_not_wait_for_a_model_still_loading(monkeypatch):
    monkeypatch.setattr(semantic, "enabled", lambda: True)
    monkeypatch.setattr(semantic, "_vectors", None)
    with semantic._lock:  # as during warm_up
        assert semantic.search("anything", ["a passage"]) is None


def test_a_model_that_wont_load_turns_itself_off(monkeypatch):
    pytest.importorskip("sentence_transformers")
    monkeypatch.setenv("SEMANTIC_SEARCH", "on")
    monkeypatch.setattr(semantic, "_vectors", None)
    monkeypatch.setattr(semantic, "_failed", False)
    monkeypatch.setattr("sentence_transformers.SentenceTransformer", lambda *a, **k: 1 / 0)
    assert semantic.search("anything", ["a passage"]) is None
    assert semantic._failed is True and semantic.enabled() is False


def test_pytorch_network_learns_and_survives_saving():
    pytest.importorskip("torch")
    from ml.advanced import TorchMLP

    rng = np.random.default_rng(1)
    X = rng.normal(size=(300, 3))
    y = (X[:, 0] + X[:, 1] > 0).astype(int)
    model = TorchMLP(hidden=16, epochs=15).fit(X, y, sample_weight=np.ones(300))
    assert (model.predict(X) == y).mean() > 0.9
    restored = pickle.loads(pickle.dumps(model))
    assert np.allclose(restored.predict_proba(X), model.predict_proba(X))


def test_advanced_candidates_only_list_whats_installed():
    from importlib.util import find_spec

    from ml.advanced import candidates

    extra = candidates()
    assert ("xgboost" in extra) == bool(find_spec("xgboost")) and ("pytorch_mlp" in extra) == bool(find_spec("torch"))


def test_lake_export_writes_parquet_without_secrets(client, make_user, tmp_path, capsys):
    pd = pytest.importorskip("pandas")
    pytest.importorskip("pyarrow")
    make_user()
    db_cli.main(["lake-export", "--out", str(tmp_path)])
    users = pd.read_parquet(tmp_path / "users" / "part-00000.parquet")
    assert len(users) and "username" in users.columns and "password_hash" not in users.columns
    assert not (tmp_path / "otp_codes").exists()


def test_status_never_contains_secrets(client, monkeypatch):
    monkeypatch.setattr(status.settings, "ONLINE_MONGODB_URI", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret-value")
    report = status.report()
    assert report["services"]["SQL database"]["state"] == "connected"
    assert report["services"]["Claude (LLM)"]["state"] == "configured"
    assert "sk-secret-value" not in str(report)
    assert set(report["advanced"]) == set(status.ADVANCED.values())
