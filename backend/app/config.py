"""Central configuration loaded from environment / .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent  # backend/ — holds .env and the local SQLite db

load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


LOCAL_DATABASE_URL = f"sqlite:///{(BACKEND_DIR / 'focuslink.db').as_posix()}"


def aws_database_url() -> str:
    """PostgreSQL URL for the online database, built from DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT.

    Built with URL.create, so passwords containing @ : / # % etc. need no escaping in .env.
    """
    from sqlalchemy.engine import URL

    host = os.getenv("DB_HOST", "").strip()
    if not host:
        raise RuntimeError("DATABASE=aws needs DB_HOST (your RDS endpoint) plus DB_USER and DB_PASSWORD in backend/.env")
    return URL.create("postgresql+psycopg2", username=os.getenv("DB_USER", "focuslink"),
                      password=os.getenv("DB_PASSWORD", ""), host=host, port=int(os.getenv("DB_PORT", "5432")),
                      database=os.getenv("DB_NAME", "focuslink")).render_as_string(hide_password=False)


def database_url() -> str:
    """Where data is stored. DATABASE_URL (docker compose, custom setups) wins; otherwise DATABASE=local|aws."""
    url = os.getenv("DATABASE_URL", "").strip()
    if url.startswith("postgres://"):  # Heroku / older Render style; SQLAlchemy needs postgresql://
        url = "postgresql://" + url[len("postgres://"):]
    if url:
        prefix = "sqlite:///./"  # relative SQLite paths are anchored to backend/, not the cwd
        return f"sqlite:///{(BACKEND_DIR / url[len(prefix):]).as_posix()}" if url.startswith(prefix) else url
    return aws_database_url() if os.getenv("DATABASE", "local").strip().lower() == "aws" else LOCAL_DATABASE_URL


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Presence AI")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

    DATABASE_URL: str = database_url()
    # SSL to PostgreSQL: "require" (encrypted) by default for AWS RDS; "verify-full" + DB_SSLROOTCERT also checks
    # the server certificate (download global-bundle.pem from AWS). Empty = driver default.
    DB_SSLMODE: str = os.getenv("DB_SSLMODE", "require" if ".rds.amazonaws.com" in DATABASE_URL else "")
    DB_SSLROOTCERT: str = os.getenv("DB_SSLROOTCERT", "")

    # "Continue as guest": try the app without an account (a fresh guest user per visit)
    ALLOW_GUESTS: bool = _bool("ALLOW_GUESTS", "true")

    # Video meetings: browsers connect directly (WebRTC); STUN finds the public address. Behind strict
    # firewalls / mobile networks a TURN relay is needed too - set TURN_URL(S) + credentials (e.g. Twilio,
    # Metered, Cloudflare or your own coturn).
    STUN_URLS: str = os.getenv("STUN_URLS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    TURN_URLS: str = os.getenv("TURN_URLS", "")
    TURN_USERNAME: str = os.getenv("TURN_USERNAME", "")
    TURN_CREDENTIAL: str = os.getenv("TURN_CREDENTIAL", "")
    MEET_MAX_PEOPLE: int = int(os.getenv("MEET_MAX_PEOPLE", "8"))

    # MongoDB mirror: every saved record is also kept in MongoDB (one collection per table). Empty = off.
    MONGODB_URI: str = os.getenv("MONGODB_URI", "").strip()
    MONGODB_DB: str = os.getenv("MONGODB_DB", "presence_ai").strip()

    AWS_ENABLED: bool = _bool("AWS_ENABLED")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "focuslink-ai-reports")
    USE_COMPREHEND: bool = _bool("USE_COMPREHEND")

    # Camera recordings: video files go to S3_BUCKET when AWS is on, otherwise to this folder
    RECORDINGS_DIR: Path = Path(os.getenv("RECORDINGS_DIR", "").strip() or BACKEND_DIR / "recordings")
    RECORDING_MAX_MB: int = int(os.getenv("RECORDING_MAX_MB", "500"))

    # One-time passwords: email via Amazon SES, SMS via Amazon SNS
    SES_SENDER: str = os.getenv("SES_SENDER", "")            # verified SES identity, e.g. no-reply@yourdomain.com
    SNS_SENDER_ID: str = os.getenv("SNS_SENDER_ID", "FOCUSAI")  # alphanumeric sender id (where supported)
    OTP_TTL_MINUTES: int = int(os.getenv("OTP_TTL_MINUTES", "10"))
    OTP_MAX_ATTEMPTS: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    OTP_RESEND_SECONDS: int = int(os.getenv("OTP_RESEND_SECONDS", "60"))
    # Dev mode returns the code in the API response instead of failing when AWS can't deliver it.
    # Defaults to on only while AWS is disabled — never enable it in production.
    OTP_DEV_MODE: bool = _bool("OTP_DEV_MODE", "false" if _bool("AWS_ENABLED") else "true")

    # Easy sign-up: when false, accounts work immediately (no email/SMS codes, mobile optional).
    # Defaults to on only when AWS can actually deliver codes.
    REQUIRE_VERIFICATION: bool = _bool("REQUIRE_VERIFICATION", "true" if _bool("AWS_ENABLED") else "false")


settings = Settings()
