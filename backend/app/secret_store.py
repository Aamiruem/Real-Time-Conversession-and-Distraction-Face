"""A signing key the server makes for itself when SECRET_KEY isn't configured on a hosting platform.

SECRET_KEY signs every login token, so the public default would let anyone forge a login. Instead of refusing to
run, the first start creates 64 random bytes and keeps them in the database (table app_secrets, never mirrored to
MongoDB), so every server instance and every restart signs with the same private key. Setting SECRET_KEY yourself
still takes precedence.
"""
import secrets
import threading

from sqlalchemy import Column, MetaData, String, Table, insert, select
from sqlalchemy.exc import IntegrityError

from app.config import settings

DEFAULT_KEY = "dev-secret-change-me"
_meta = MetaData()  # not the models' metadata: stays out of create_all / mongo full_sync
app_secrets = Table("app_secrets", _meta, Column("name", String(40), primary_key=True), Column("value", String(200)))
_lock = threading.Lock()
_loaded = False


def configured() -> bool:
    return settings.SECRET_KEY != DEFAULT_KEY and len(settings.SECRET_KEY) >= 32


def ensure_secret_key(engine) -> bool:
    """Use (or create once) the stored key when SECRET_KEY isn't configured. True when a usable key is in place."""
    global _loaded
    if _loaded or configured():
        return True
    with _lock:
        if _loaded:
            return True
        _meta.create_all(engine)
        with engine.begin() as conn:
            value = conn.execute(select(app_secrets.c.value).where(app_secrets.c.name == "jwt")).scalar()
        if value is None:
            try:
                with engine.begin() as conn:
                    conn.execute(insert(app_secrets).values(name="jwt", value=secrets.token_urlsafe(64)))
            except IntegrityError:
                pass  # another instance created it at the same moment: use theirs
            with engine.begin() as conn:
                value = conn.execute(select(app_secrets.c.value).where(app_secrets.c.name == "jwt")).scalar()
        settings.SECRET_KEY = value
        _loaded = True
    return True
