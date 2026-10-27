"""Pydantic request/response models."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


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
