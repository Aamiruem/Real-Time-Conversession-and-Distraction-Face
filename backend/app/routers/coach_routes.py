"""Personal recommendations and the AI coach (answers questions + an automated daily insight)."""
import json
from datetime import datetime, timedelta, timezone
from statistics import mean

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AttentionSession, SpeechSession, User
from coach import assistant
from coach.recommend import SKILLS, recommend

router = APIRouter(tags=["coach"])


class ChatTurn(BaseModel):
    role: str
    content: str = Field(max_length=4000)


class CoachQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def load_history(db: Session, user: User) -> dict:
    """The user's sessions as plain dicts for the recommendation engine and the coach."""
    focus = [{"started_at": _aware(s.started_at), "duration_sec": s.duration_sec, "focus_pct": s.focus_pct,
              "drowsy_pct": s.drowsy_pct}
             for s in db.scalars(select(AttentionSession).where(AttentionSession.user_id == user.id)
                                 .order_by(AttentionSession.started_at))]
    speech, interviews, conv_types = [], [], set()
    for s in db.scalars(select(SpeechSession).where(SpeechSession.user_id == user.id)
                        .order_by(SpeechSession.created_at)):
        speech.append({"confidence": s.confidence, "mode": s.mode, **{k: getattr(s, k) for k in SKILLS}})
        if s.mode not in ("interview", "conversation"):
            continue
        try:
            rep = json.loads(s.report or "{}")
        except ValueError:
            continue
        if conv := rep.get("conversation"):
            conv_types.add(conv.get("type"))
        if iv := rep.get("interview"):
            interviews.append({"question_id": iv["question"].get("id", iv["question"]["q"]),
                               "question": iv["question"]["q"], "readiness": iv["readiness"],
                               "at": _aware(s.created_at)})
    return {"focus": focus, "speech": speech, "interviews": interviews, "conversation_types": conv_types}


def _streak(focus: list[dict]) -> int:
    days = {s["started_at"].date() for s in focus}
    day = datetime.now(timezone.utc).date()
    if day not in days:
        day -= timedelta(days=1)
    n = 0
    while day in days:
        n, day = n + 1, day - timedelta(days=1)
    return n


def build_context(db: Session, user: User) -> dict:
    h = load_history(db, user)
    focus, speech = h["focus"], h["speech"]
    recent = speech[-5:]
    skill_avgs = {k: mean(v) for k in SKILLS if (v := [s[k] for s in recent if s.get(k) is not None])}
    weakest = min(skill_avgs, key=skill_avgs.get) if skill_avgs else None
    stats = {
        "focus_sessions": len(focus),
        "avg_focus_pct": round(mean(s["focus_pct"] for s in focus), 1) if focus else 0,
        "streak_days": _streak(focus),
        "practice_sessions": len(speech),
        "avg_confidence": round(mean(s["confidence"] for s in speech), 1) if speech else 0,
        "weakest_skill": f"{SKILLS[weakest][0].lower()} ({skill_avgs[weakest]:.0f}%)" if weakest else None,
        "latest_readiness": h["interviews"][-1]["readiness"] if h["interviews"] else None,
    }
    recs = recommend(h["focus"], h["speech"], h["interviews"], h["conversation_types"])
    return {"name": (user.full_name or user.username).split()[0], "stats": stats, "recommendations": recs}


@router.get("/recommendations")
def recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What to practise next, ranked by expected benefit, each with the data behind it."""
    return build_context(db, user)["recommendations"]


@router.post("/coach/ask")
def ask(data: CoachQuestion, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ask the AI coach anything about your progress, interviews, speaking or focus."""
    return assistant.answer(data.question, build_context(db, user), [t.model_dump() for t in data.history])


@router.get("/coach/insight")
def daily_insight(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Automated coaching note for today (shown on the dashboard)."""
    return assistant.insight(build_context(db, user))
