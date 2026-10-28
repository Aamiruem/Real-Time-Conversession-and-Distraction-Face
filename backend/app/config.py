"""Central configuration loaded from environment / .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent  # backend/ — holds .env and the local SQLite db

load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def database_url() -> str:
    """DATABASE_URL, with a relative SQLite path (sqlite:///./x.db) anchored to backend/ instead of the cwd."""
    url = os.getenv("DATABASE_URL", "sqlite:///./focuslink.db")
    prefix = "sqlite:///./"
    if url.startswith(prefix):
        url = f"sqlite:///{(BACKEND_DIR / url[len(prefix):]).as_posix()}"
    return url


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Presence AI")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

    DATABASE_URL: str = database_url()

    AWS_ENABLED: bool = _bool("AWS_ENABLED")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "focuslink-ai-reports")
    USE_COMPREHEND: bool = _bool("USE_COMPREHEND")

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
