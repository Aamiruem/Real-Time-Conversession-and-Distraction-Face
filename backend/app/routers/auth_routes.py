"""Sign-up with email + mobile OTP verification, password / OTP login and password reset."""
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import (FocusSnapshot, MeetingAttendance, MeetingRoom, Message, OtpCode, Recording, Room,
                        RoutineCheck, RoutinePlan, SpeechSession, User)
from app.routers.recording_routes import remove_files
from app.schemas import (AccountDelete, GuestIn, OtpLoginIn, OtpRequestIn, OtpSentOut, PasswordResetIn, RegisterOut, ResendIn, Token,
                             PasswordChange, ProfileUpdate, UserCreate, UserLogin, UserOut, VerifyIn, VerifyOut,
                         password_problem)
from app.services import otp_service

router = APIRouter(prefix="/auth", tags=["auth"])
GUEST_PREFIX = "guest-"  # reserved: only POST /auth/guest creates these usernames


def normalize_phone(value: str) -> str:
    return re.sub(r"[\s()-]", "", value)


def find_user(db: Session, identifier: str) -> tuple[User | None, str]:
    """Look a user up by email, mobile number or username. Returns (user, otp channel)."""
    ident = identifier.strip()
    if "@" in ident:
        return db.scalar(select(User).where(User.email == ident.lower())), "email"
    if re.fullmatch(r"\+?[\d\s()-]{8,20}", ident):
        return db.scalar(select(User).where(User.phone == normalize_phone(ident))), "sms"
    return db.scalar(select(User).where(User.username == ident)), "email"


def token_for(user: User) -> Token:
    return Token(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


def unverified_error(user: User) -> HTTPException:
    return HTTPException(403, {"code": "unverified", "user_id": user.id, "email": user.email, "phone": user.phone,
                               "email_verified": user.email_verified, "phone_verified": user.phone_verified,
                               "message": "Please verify your email and mobile number first"})


@router.post("/register", response_model=RegisterOut)
def register(data: UserCreate, db: Session = Depends(get_db)):
    email, phone = data.email.lower(), normalize_phone(data.phone) if data.phone else None
    if settings.REQUIRE_VERIFICATION and not phone:
        raise HTTPException(422, "Mobile number is required")
    if data.username.lower().startswith(GUEST_PREFIX):
        raise HTTPException(400, f"Usernames starting with '{GUEST_PREFIX}' are reserved for guests")
    taken = [User.username == data.username, User.email == email] + ([User.phone == phone] if phone else [])
    clash = db.scalar(select(User).where(or_(*taken)))
    if clash:
        field = ("Username" if clash.username == data.username else "Email" if clash.email == email
                 else "Mobile number")
        raise HTTPException(400, f"{field} is already registered")
    user = User(username=data.username, full_name=data.full_name.strip(), email=email, phone=phone,
                password_hash=hash_password(data.password))
    if not settings.REQUIRE_VERIFICATION:  # easy mode: usable immediately
        user.email_verified = user.phone_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    if not settings.REQUIRE_VERIFICATION:
        return RegisterOut(user_id=user.id, email=email, phone=phone, verification_required=False,
                           token=token_for(user), message="Account created — you're signed in")

    dev = {}
    for channel in ("email", "sms"):
        sent = otp_service.issue(db, user, channel, "verify")
        if sent["dev_code"]:
            dev[channel] = sent["dev_code"]
    return RegisterOut(user_id=user.id, email=email, phone=phone, dev_codes=dev or None,
                       message="We sent a 6-digit code to your email and another to your mobile number")


@router.post("/verify", response_model=VerifyOut)
def verify(data: VerifyIn, db: Session = Depends(get_db)):
    user = db.get(User, data.user_id)
    if not user:
        raise HTTPException(404, "Account not found")
    otp_service.check(db, user, data.channel, "verify", data.code)
    if data.channel == "email":
        user.email_verified = True
    else:
        user.phone_verified = True
    db.commit()
    return VerifyOut(email_verified=user.email_verified, phone_verified=user.phone_verified,
                     token=token_for(user) if user.is_verified else None)


@router.post("/resend", response_model=OtpSentOut)
def resend(data: ResendIn, db: Session = Depends(get_db)):
    user = db.get(User, data.user_id)
    if not user:
        raise HTTPException(404, "Account not found")
    if (user.email_verified if data.channel == "email" else user.phone_verified):
        return OtpSentOut(message="Already verified", channel=data.channel)
    sent = otp_service.issue(db, user, data.channel, "verify")
    return OtpSentOut(message="A new code is on its way", channel=data.channel, dev_code=sent["dev_code"])


@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user, _ = find_user(db, data.identifier)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid username/email/mobile or password")
    if not user.is_verified:
        raise unverified_error(user)
    return token_for(user)


@router.post("/guest", response_model=Token)
def guest(data: GuestIn | None = None, db: Session = Depends(get_db)):
    """Try everything without an account: a fresh, verified guest user (unguessable password).

    The name is optional (people joining a meeting link give one, like Meet's "What's your name?").

    Guests can create a real account any time from Settings; ALLOW_GUESTS=false turns this off.
    """
    if not settings.ALLOW_GUESTS:
        raise HTTPException(403, "Guest access is turned off - please create an account")
    tag = secrets.token_hex(3)
    user = User(username=f"{GUEST_PREFIX}{tag}", full_name=" ".join((data.name if data else "").split())[:60] or f"Guest {tag.upper()}", email=f"{GUEST_PREFIX}{tag}@guest.local",
                password_hash=hash_password(secrets.token_urlsafe(24)), email_verified=True, phone_verified=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return token_for(user)


@router.post("/otp/request", response_model=OtpSentOut)
def request_otp(data: OtpRequestIn, db: Session = Depends(get_db)):
    """Send a login / password-reset code to the email or mobile number given."""
    user, channel = find_user(db, data.identifier)
    generic = OtpSentOut(message="If an account exists for that email or number, a code has been sent",
                         channel=channel)
    if not user:
        return generic  # do not reveal which accounts exist
    if data.purpose == "login" and not user.is_verified:
        raise unverified_error(user)
    sent = otp_service.issue(db, user, channel, data.purpose)
    return generic.model_copy(update={"dev_code": sent["dev_code"]})


@router.post("/otp/login", response_model=Token)
def otp_login(data: OtpLoginIn, db: Session = Depends(get_db)):
    user, channel = find_user(db, data.identifier)
    if not user:
        raise HTTPException(400, "Wrong code")
    otp_service.check(db, user, channel, "login", data.code)
    return token_for(user)


@router.post("/password/reset")
def reset_password(data: PasswordResetIn, db: Session = Depends(get_db)):
    user, channel = find_user(db, data.identifier)
    if not user:
        raise HTTPException(400, "Wrong code")
    if problem := password_problem(data.new_password):
        raise HTTPException(422, problem)
    otp_service.check(db, user, channel, "reset", data.code)
    user.password_hash = hash_password(data.new_password)
    # receiving the code proves ownership of that channel
    if channel == "email":
        user.email_verified = True
    else:
        user.phone_verified = True
    db.commit()
    return {"ok": True, "message": "Password updated — you can sign in now"}


@router.get("/config")
def auth_config():
    """Tells the frontend whether sign-up needs email + mobile codes."""
    return {"require_verification": settings.REQUIRE_VERIFICATION}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update your display name."""
    user.full_name = data.full_name.strip()
    db.commit()
    db.refresh(user)
    return user


@router.post("/password")
def change_password(data: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change your password (needs the current one)."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True, "message": "Password changed"}


@router.delete("/me")
def delete_me(data: AccountDelete, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete your account and everything stored about you (sessions, recordings' results, messages, rooms, routine)."""
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "Password is incorrect")
    own_rooms = select(Room.id).where(Room.created_by == user.id)
    db.execute(delete(Message).where((Message.user_id == user.id) | Message.room_id.in_(own_rooms)))
    db.execute(delete(Room).where(Room.created_by == user.id))
    hosted = select(MeetingRoom.id).where(MeetingRoom.host_id == user.id)
    db.execute(delete(MeetingAttendance).where(MeetingAttendance.room_id.in_(hosted)))
    db.execute(delete(MeetingRoom).where(MeetingRoom.host_id == user.id))
    remove_files(list(db.scalars(select(Recording).where(Recording.user_id == user.id))))
    for model in (SpeechSession, FocusSnapshot, OtpCode, RoutinePlan, RoutineCheck, MeetingAttendance, Recording):
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)  # focus sessions go with it (cascade)
    db.commit()
    return {"ok": True, "message": "Your account and data were deleted"}
