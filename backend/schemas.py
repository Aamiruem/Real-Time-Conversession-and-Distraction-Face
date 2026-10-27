"""Pydantic request/response models."""
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PHONE_RE = r"^\+[1-9]\d{7,14}$"  # E.164, e.g. +919876543210


def password_problem(v: str) -> str | None:
    if len(v) < 8:
        return "Password must be at least 8 characters"
    if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
        return "Password must contain letters and numbers"
    return None


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str = Field(default="", max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, pattern=PHONE_RE,
                              description="Mobile number in international format, e.g. +919876543210")
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if problem := password_problem(v):
            raise ValueError(problem)
        return v


class UserLogin(BaseModel):
    identifier: str = Field(min_length=3, description="Username, email or mobile number")
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str = ""
    email: str
    phone: str | None = None
    email_verified: bool = False
    phone_verified: bool = False


class RegisterOut(BaseModel):
    user_id: int
    email: str
    phone: str | None
    message: str
    verification_required: bool = True
    dev_codes: dict[str, str] | None = None  # only when OTP_DEV_MODE is on and delivery is not configured
    token: "Token | None" = None             # issued straight away when verification is switched off


class VerifyIn(BaseModel):
    user_id: int
    channel: Literal["email", "sms"]
    code: str = Field(min_length=4, max_length=8)


class VerifyOut(BaseModel):
    email_verified: bool
    phone_verified: bool
    token: "Token | None" = None


class ResendIn(BaseModel):
    user_id: int
    channel: Literal["email", "sms"]


class OtpRequestIn(BaseModel):
    identifier: str = Field(min_length=3, description="Email or mobile number")
    purpose: Literal["login", "reset"] = "login"


class OtpLoginIn(BaseModel):
    identifier: str
    code: str = Field(min_length=4, max_length=8)


class PasswordResetIn(BaseModel):
    identifier: str
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8, max_length=128)


class OtpSentOut(BaseModel):
    message: str
    channel: str | None = None
    dev_code: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


VerifyOut.model_rebuild()
RegisterOut.model_rebuild()


class FocusUpdate(BaseModel):
    state: str
    focus_pct: float
    distracted_pct: float
    ear: float = 0
    yaw: float = 0
    pitch: float = 0
    gaze: str = "center"


class SessionCreate(BaseModel):
    started_at: datetime
    duration_sec: float
    focus_pct: float
    distracted_pct: float
    drowsy_pct: float
    no_face_pct: float = 0
    total_blinks: int = 0
    total_yawns: int = 0
    avg_ear: float = 0
    timeline: list[dict] = []


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    started_at: datetime
    ended_at: datetime
    duration_sec: float
    focus_pct: float
    distracted_pct: float
    drowsy_pct: float
    no_face_pct: float
    total_blinks: int
    total_yawns: int
    avg_ear: float
    report_url: str | None
    self_fatigue: int | None = None


class FatigueFeedback(BaseModel):
    self_fatigue: int = Field(ge=0, le=2, description="0 fresh, 1 a bit tired, 2 exhausted")


class FatigueFeatures(BaseModel):
    duration_min: float = Field(ge=0, le=600)
    hour: int = Field(ge=0, le=23)
    focus_pct: float = Field(ge=0, le=100)
    distracted_pct: float = Field(ge=0, le=100)
    drowsy_pct: float = Field(ge=0, le=100)
    no_face_pct: float = Field(ge=0, le=100)
    blinks_per_min: float = Field(ge=0, le=120)
    yawns_per_10min: float = Field(ge=0, le=60)
    avg_ear: float = Field(ge=0, le=1)


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class SpeechSessionCreate(BaseModel):
    mode: str = "free"
    prompt: str = ""
    report: dict  # output of speech.analyzer.analyze()


class SpeechSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    mode: str
    prompt: str
    duration_sec: float
    confidence: float
    fluency: float
    pace: float
    clarity: float
    voice: float
    assertiveness: float
    eye_contact: float | None
    wpm: float
    fillers: int
    transcript: str
    report: dict | None = None


class RoomCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = ""


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    created_at: datetime


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: int
    room_id: int
    username: str
    content: str
    sentiment_label: str
    sentiment_score: float
    is_toxic: bool
    keywords: list[str]
    sender_focus: float | None
    created_at: datetime
