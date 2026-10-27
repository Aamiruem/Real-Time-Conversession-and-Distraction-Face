"""Database tables."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    sessions = relationship("AttentionSession", back_populates="user", cascade="all, delete-orphan")


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
