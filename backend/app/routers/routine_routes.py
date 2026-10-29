"""Daily routine: your plan (time blocks + prayer-time settings) and which blocks you ticked off each day."""
import json
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import RoutineCheck, RoutinePlan, User

router = APIRouter(prefix="/routine", tags=["routine"])

DAY = r"^\d{4}-\d{2}-\d{2}$"
Category = Literal["sleep", "faith", "coding", "work", "learning", "speaking", "health", "leisure", "personal"]


class Block(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(min_length=1, max_length=80)
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="HH:MM, 24-hour")
    minutes: int = Field(ge=5, le=720)
    category: Category
    note: str = Field(default="", max_length=300)
    link: str = Field(default="", max_length=80, pattern=r"^(/app[A-Za-z0-9/_?=&-]*)?$", description="an app page, e.g. /app/focus")
    days: list[int] = Field(default_factory=lambda: list(range(7)), description="weekdays it applies to, 0 = Sunday")


class Prayer(BaseModel):
    enabled: bool = True
    method: Literal["karachi", "mwl", "isna", "egypt", "makkah"] = "karachi"
    asr: Literal["hanafi", "shafi"] = "hanafi"
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    place: str = Field(default="", max_length=80)
    minutes: int = Field(default=15, ge=5, le=60)


class Plan(BaseModel):
    template: str = Field(default="custom", max_length=40)
    blocks: list[Block] = Field(max_length=60)
    prayer: Prayer = Field(default_factory=Prayer)
    reminders: bool = False


class CheckIn(BaseModel):
    day: str = Field(pattern=DAY)
    block_id: str = Field(min_length=1, max_length=40)
    done: bool = True


def _history(db: Session, user: User, today: date, days: int = 7) -> list[dict]:
    first = (today - timedelta(days=days - 1)).isoformat()
    rows = db.execute(select(RoutineCheck.day, func.count()).where(RoutineCheck.user_id == user.id, RoutineCheck.day >= first,
                                                                  RoutineCheck.day <= today.isoformat())
                      .group_by(RoutineCheck.day)).all()
    counts = dict(rows)
    return [{"day": (d := today - timedelta(days=i)).isoformat(), "done": counts.get(d.isoformat(), 0)}
            for i in range(days - 1, -1, -1)]


@router.get("")
def get_routine(day: str = Query(pattern=DAY, description="your local date"), user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Your plan (null until you save one), what you ticked off on `day`, and the last 7 days."""
    plan = db.scalar(select(RoutinePlan).where(RoutinePlan.user_id == user.id))
    checks = db.scalars(select(RoutineCheck.block_id).where(RoutineCheck.user_id == user.id, RoutineCheck.day == day)).all()
    today = date.fromisoformat(day)
    history = _history(db, user, today, 30)
    streak = 0
    for h in reversed(history if history[-1]["done"] else history[:-1]):  # today still counts as "in progress"
        if not h["done"]:
            break
        streak += 1
    return {"plan": json.loads(plan.data) if plan else None, "checks": sorted(checks), "history": history[-7:], "streak": streak}


@router.put("")
def save_routine(plan: Plan, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Save your routine."""
    row = db.scalar(select(RoutinePlan).where(RoutinePlan.user_id == user.id)) or RoutinePlan(user_id=user.id)
    row.data = plan.model_dump_json()
    db.add(row)
    db.commit()
    return {"ok": True, "blocks": len(plan.blocks)}


@router.put("/check")
def check(data: CheckIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Tick a block off for a day (or untick it with done=false)."""
    existing = select(RoutineCheck).where(RoutineCheck.user_id == user.id, RoutineCheck.day == data.day,
                                          RoutineCheck.block_id == data.block_id)
    if data.done and not db.scalar(existing):
        db.add(RoutineCheck(user_id=user.id, day=data.day, block_id=data.block_id))
    elif not data.done:
        db.execute(delete(RoutineCheck).where(RoutineCheck.user_id == user.id, RoutineCheck.day == data.day,
                                              RoutineCheck.block_id == data.block_id))
    db.commit()
    done = db.scalars(select(RoutineCheck.block_id).where(RoutineCheck.user_id == user.id, RoutineCheck.day == data.day)).all()
    return {"checks": sorted(done)}
