"""One view of everything Presence AI connects to, for `python -m app.db_cli doctor` and the MCP tool system_status.
Read-only, and it never returns a password, key or connection string."""
import os
from importlib import metadata

from app import mongo
from app.config import settings
from app.database import describe, ping
from app.services.aws_service import s3

ADVANCED = {"xgboost": "XGBoost", "torch": "PyTorch", "sentence-transformers": "Hugging Face embeddings",
            "langgraph": "LangGraph", "mlflow-skinny": "MLflow", "pyarrow": "Parquet data lake"}


def _ok(state: str, detail: str = "") -> dict:
    return {"state": state, "detail": detail}


def _sql() -> dict:
    db = describe()
    ms = ping()
    return _ok("connected", f"{db['engine']} ({db['location']}), {ms} ms") if ms is not None else _ok("error", "can't reach it")


def _mongo() -> dict:
    if not mongo.enabled():
        return _ok("off", "MONGODB_URI is empty")
    ms = mongo.ping()
    if ms is None:
        return _ok("error", "can't reach it")
    return _ok("connected", f"database {settings.MONGODB_DB}, {ms} ms")


def _atlas() -> dict:
    if not settings.ONLINE_MONGODB_URI:
        return _ok("off", "ONLINE_MONGODB_URI is empty")
    from pymongo import MongoClient
    from pymongo.errors import OperationFailure

    try:
        client = MongoClient(settings.ONLINE_MONGODB_URI, serverSelectionTimeoutMS=4000, connectTimeoutMS=4000)
        client.admin.command("ping")
        client.close()
        return _ok("connected", "copy it with: python -m app.db_cli mongo-sync --online")
    except OperationFailure:
        return _ok("error", "login rejected: check the user and password in ONLINE_MONGODB_URI")
    except Exception as e:  # noqa: BLE001
        return _ok("error", e.__class__.__name__)


def _aws() -> dict:
    client = s3()
    if client is None:
        return _ok("off", "AWS_ENABLED=false or no access keys")
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET)
        return _ok("connected", f"S3 bucket {settings.S3_BUCKET}")
    except Exception as e:  # noqa: BLE001
        return _ok("error", e.__class__.__name__)


def _llm() -> dict:
    if os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"):
        return _ok("configured", os.getenv("COACH_MODEL", "claude-opus-5-5"))
    return _ok("off", "ANTHROPIC_API_KEY is empty: the built-in coach answers")


def _advanced() -> dict:
    out = {}
    for package, label in ADVANCED.items():
        try:
            out[label] = _ok("installed", metadata.version(package))
        except metadata.PackageNotFoundError:
            out[label] = _ok("off", "pip install -r requirements-advanced.txt")
    return out


def report() -> dict:
    return {"services": {"SQL database": _sql(), "MongoDB": _mongo(), "MongoDB Atlas": _atlas(), "AWS": _aws(),
                         "Claude (LLM)": _llm()},
            "advanced": _advanced()}
