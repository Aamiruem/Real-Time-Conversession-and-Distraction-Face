"""Central configuration loaded from environment / .env file."""
import os

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "FocusLink AI")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./focuslink.db")

    AWS_ENABLED: bool = _bool("AWS_ENABLED")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "focuslink-ai-reports")
    USE_COMPREHEND: bool = _bool("USE_COMPREHEND")


settings = Settings()
