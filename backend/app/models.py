"""Database tables.  `python models.py` (inside backend/app) creates any missing tables and lists them."""
import sys
from datetime import datetime, timezone
from pathlib import Path

if __name__ == "__main__":  # started as a script: hand over to the real `app.models` module
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.database import Base, init_db

    init_db()
    print("Tables ready: " + ", ".join(sorted(Base.metadata.tables)))
    sys.exit()

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)  # noqa: UP017


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)  # E.164
    password_hash: Mapped[str] = mapped_column(String(200))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def is_verified(self) -> bool:
        return self.email_verified and (self.phone_verified or not self.phone)

    sessions = relationship("AttentionSession", back_populates="user", cascade="all, delete-orphan")


class OtpCode(Base):
    """One-time code sent by email (SES) or SMS (SNS). Only a keyed hash of the code is stored."""

    __tablename__ = "otp_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(10))   # email | sms
    purpose: Mapped[str] = mapped_column(String(10))   # verify | login | reset
    code_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AttentionSession(Base):
    """One finished focus-tracking session with its summary."""

    __tablename__ = "attention_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    duration_sec: Mapped[float] = mapped_column(Float, default=0)
    focus_pct: Mapped[float] = mapped_column(Float, default=0)
    distracted_pct: Mapped[float] = mapped_column(Float, default=0)
    drowsy_pct: Mapped[float] = mapped_column(Float, default=0)
    no_face_pct: Mapped[float] = mapped_column(Float, default=0)
    total_blinks: Mapped[int] = mapped_column(Integer, default=0)
    total_yawns: Mapped[int] = mapped_column(Integer, default=0)
    avg_ear: Mapped[float] = mapped_column(Float, default=0)
    report_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    self_fatigue: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user label 0/1/2 for ML training

    user = relationship("User", back_populates="sessions")


class FocusSnapshot(Base):
    """Live metric sample pushed every few seconds while tracking."""

    __tablename__ = "focus_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    state: Mapped[str] = mapped_column(String(20))
    focus_pct: Mapped[float] = mapped_column(Float)
    distracted_pct: Mapped[float] = mapped_column(Float)
    ear: Mapped[float] = mapped_column(Float, default=0)
    yaw: Mapped[float] = mapped_column(Float, default=0)
    pitch: Mapped[float] = mapped_column(Float, default=0)
    gaze: Mapped[str] = mapped_column(String(10), default="center")


class SpeechSession(Base):
    """One analysed speaking exercise from the Speech Coach (full report kept as JSON)."""

    __tablename__ = "speech_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    mode: Mapped[str] = mapped_column(String(20), default="free")
    prompt: Mapped[str] = mapped_column(Text, default="")
    duration_sec: Mapped[float] = mapped_column(Float, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    fluency: Mapped[float] = mapped_column(Float, default=0)
    pace: Mapped[float] = mapped_column(Float, default=0)
    clarity: Mapped[float] = mapped_column(Float, default=0)
    voice: Mapped[float] = mapped_column(Float, default=0)
    assertiveness: Mapped[float] = mapped_column(Float, default=0)
    eye_contact: Mapped[float | None] = mapped_column(Float, nullable=True)
    wpm: Mapped[float] = mapped_column(Float, default=0)
    fillers: Mapped[int] = mapped_column(Integer, default=0)
    transcript: Mapped[str] = mapped_column(Text, default="")
    report: Mapped[str] = mapped_column(Text, default="{}")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    sentiment_label: Mapped[str] = mapped_column(String(10), default="neutral")
    sentiment_score: Mapped[float] = mapped_column(Float, default=0)
    is_toxic: Mapped[bool] = mapped_column(Boolean, default=False)
    keywords: Mapped[str] = mapped_column(String(255), default="")
    sender_focus: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    room = relationship("Room", back_populates="messages")
    user = relationship("User")


class Recording(Base):
    """A saved camera recording: the video file lives in S3 (AWS_ENABLED) or backend/recordings/, the details here."""

    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    room_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # focus room it was made in
    title: Mapped[str] = mapped_column(String(120), default="")
    source: Mapped[str] = mapped_column(String(20), default="rooms")
    mime_type: Mapped[str] = mapped_column(String(40), default="video/webm")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    duration_sec: Mapped[float] = mapped_column(Float, default=0)
    quality: Mapped[str] = mapped_column(String(10), default="medium")  # low | medium | high
    speed: Mapped[str] = mapped_column(String(10), default="realtime")  # AI tracking rate: eco | balanced | realtime
    avg_focus: Mapped[float | None] = mapped_column(Float, nullable=True)
    focused_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    timeline: Mapped[str] = mapped_column(Text, default="[]")  # [{t, focus, state}] one sample a second
    storage: Mapped[str] = mapped_column(String(10), default="local")  # local | s3
    storage_key: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RoutinePlan(Base):
    """Your daily routine (blocks, prayer settings) as JSON — one per user."""

    __tablename__ = "routine_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RoutineCheck(Base):
    """One routine block ticked off on one day (the user's local date, YYYY-MM-DD)."""

    __tablename__ = "routine_checks"
    __table_args__ = (UniqueConstraint("user_id", "day", "block_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[str] = mapped_column(String(10), index=True)
    block_id: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MeetingRoom(Base):
    """A video meeting link (abc-defg-hij): who hosts it, its title / time, and who may join without asking."""

    __tablename__ = "meeting_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # open: anyone with the link joins · trusted: guests ask first · ask: everyone but the hosts asks first
    access: Mapped[str] = mapped_column(String(10), default="open")
    chat_on: Mapped[bool] = mapped_column(Boolean, default=True)
    share_on: Mapped[bool] = mapped_column(Boolean, default=True)  # can non-hosts present their screen
    react_on: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MeetingAttendance(Base):
    """One person's time in a meeting (Meet's attendance report). A rejoin is a new row."""

    __tablename__ = "meeting_attendance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("meeting_rooms.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
