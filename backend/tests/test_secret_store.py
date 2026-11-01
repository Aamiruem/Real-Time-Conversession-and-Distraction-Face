"""Hosted without SECRET_KEY: the server makes a private key once, stores it, and every instance uses it."""
from sqlalchemy import create_engine

from app import secret_store
from app.config import settings


def test_makes_one_private_key_and_reuses_it(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'k.db').as_posix()}")
    monkeypatch.setattr(settings, "SECRET_KEY", secret_store.DEFAULT_KEY)
    monkeypatch.setattr(secret_store, "_loaded", False)
    assert secret_store.ensure_secret_key(engine)
    first = settings.SECRET_KEY
    assert first != secret_store.DEFAULT_KEY and len(first) >= 64

    # a second server instance (fresh process state) reads the same stored key
    monkeypatch.setattr(settings, "SECRET_KEY", secret_store.DEFAULT_KEY)
    monkeypatch.setattr(secret_store, "_loaded", False)
    secret_store.ensure_secret_key(engine)
    assert settings.SECRET_KEY == first


def test_a_configured_key_wins(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'k.db').as_posix()}")
    monkeypatch.setattr(settings, "SECRET_KEY", "x" * 40)
    monkeypatch.setattr(secret_store, "_loaded", False)
    secret_store.ensure_secret_key(engine)
    assert settings.SECRET_KEY == "x" * 40
