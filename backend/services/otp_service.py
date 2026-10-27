"""Issue and check one-time codes (6 digits, hashed at rest, expiring, attempt-limited, resend cooldown)."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import OtpCode, User
from backend.services import notify_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


def _hash(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def target_of(user: User, channel: str) -> str:
    return user.email if channel == "email" else user.phone


def issue(db: Session, user: User, channel: str, purpose: str) -> dict:
    """Create a fresh code (invalidating older ones) and send it. Returns {"sent", "dev_code"}."""
    target = target_of(user, channel)
    if not target:
        raise HTTPException(400, f"No {'email' if channel == 'email' else 'mobile number'} on this account")
    last = db.scalar(
        select(OtpCode).where(OtpCode.user_id == user.id, OtpCode.channel == channel, OtpCode.purpose == purpose)
        .order_by(OtpCode.id.desc()).limit(1)
    )
    if last and (_now() - _aware(last.created_at)).total_seconds() < settings.OTP_RESEND_SECONDS:
        wait = settings.OTP_RESEND_SECONDS - int((_now() - _aware(last.created_at)).total_seconds())
        raise HTTPException(429, f"Please wait {wait}s before requesting another code")

    db.execute(update(OtpCode).where(OtpCode.user_id == user.id, OtpCode.channel == channel,
                                     OtpCode.purpose == purpose, OtpCode.used.is_(False)).values(used=True))
    code = f"{secrets.randbelow(10 ** 6):06d}"
    db.add(OtpCode(user_id=user.id, channel=channel, purpose=purpose, code_hash=_hash(code),
                   expires_at=_now() + timedelta(minutes=settings.OTP_TTL_MINUTES)))
    db.commit()

    sent = notify_service.deliver(channel, target, code, purpose)
    if not sent and not settings.OTP_DEV_MODE:
        raise HTTPException(503, f"Could not send the {'email' if channel == 'email' else 'SMS'} — try again later")
    return {"sent": sent, "dev_code": None if sent else code}


def check(db: Session, user: User, channel: str, purpose: str, code: str) -> None:
    """Raise 400 unless `code` is the latest valid code; marks it used on success."""
    otp = db.scalar(
        select(OtpCode).where(OtpCode.user_id == user.id, OtpCode.channel == channel, OtpCode.purpose == purpose,
                              OtpCode.used.is_(False)).order_by(OtpCode.id.desc()).limit(1)
    )
    if not otp or _aware(otp.expires_at) < _now():
        raise HTTPException(400, "Code expired — request a new one")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many wrong attempts — request a new code")
    if not hmac.compare_digest(otp.code_hash, _hash(code.strip())):
        otp.attempts += 1
        db.commit()
        left = settings.OTP_MAX_ATTEMPTS - otp.attempts
        raise HTTPException(400, f"Wrong code — {left} attempt{'s' if left != 1 else ''} left")
    otp.used = True
    db.commit()
