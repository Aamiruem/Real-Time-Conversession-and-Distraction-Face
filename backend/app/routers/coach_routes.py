"""Personal recommendations and the AI coach (answers questions + an automated daily insight)."""
import json
from datetime import datetime, timedelta, timezone
from statistics import mean

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AttentionSession, SpeechSession, User
from coach import assistant
from coach.recommend import SKILLS, recommend
from ml import predict as fatigue_model
from ml.features import LABELS, from_session

router = APIRouter(tags=["coach"])


class ChatTurn(BaseModel):
    role: str
    content: str = Field(max_length=4000)


class CoachQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    tz: int = Field(0, ge=-840, le=840, description="Minutes east of UTC, for time-of-day advice")


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


# the viewer's time zone, minutes east of UTC (India: 330) — so "focus best in the evening" means *their* evening
TzOffset = Query(0, ge=-840, le=840, description="Minutes east of UTC (JavaScript: -new Date().getTimezoneOffset())")


def build_context(db: Session, user: User, tz: int = 0) -> dict:
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
    local = [{**s, "started_at": s["started_at"] + timedelta(minutes=tz)} for s in h["focus"]]  # time-of-day advice
    recs = recommend(local, h["speech"], h["interviews"], h["conversation_types"])
    return {"name": (user.full_name or user.username).split()[0], "stats": stats, "recommendations": recs}


def agent_tools(db: Session, user: User) -> dict:
    """The coach agent's look-ups. Each one filters by this user, so Claude can only ever read their own rows."""

    def focus_rows(limit: int):
        return db.scalars(select(AttentionSession).where(AttentionSession.user_id == user.id)
                          .order_by(AttentionSession.started_at.desc()).limit(limit)).all()

    def recent_sessions(kind: str, limit: int = 5) -> list[dict]:
        limit = min(max(int(limit), 1), 10)
        if kind == "focus":
            return [{"date": _aware(s.started_at).date().isoformat(), "minutes": round(s.duration_sec / 60, 1),
                     "focus_pct": s.focus_pct, "distracted_pct": s.distracted_pct, "drowsy_pct": s.drowsy_pct,
                     "felt": None if s.self_fatigue is None else LABELS[s.self_fatigue]} for s in focus_rows(limit)]
        query = select(SpeechSession).where(SpeechSession.user_id == user.id)
        query = query.where(SpeechSession.mode == "interview" if kind == "interview" else SpeechSession.mode != "interview")
        rows = db.scalars(query.order_by(SpeechSession.created_at.desc()).limit(limit))
        return [{"date": _aware(s.created_at).date().isoformat(), "mode": s.mode, "prompt": (s.prompt or "")[:120],
                 "confidence": s.confidence, **{k: getattr(s, k) for k in SKILLS}} for s in rows]

    def fatigue_forecast() -> dict:
        rows = focus_rows(1)
        if not rows:
            return {"note": "No focus sessions yet: the user needs to finish one first."}
        s = rows[0]
        session = {c: getattr(s, c) for c in ("started_at", "duration_sec", "focus_pct", "distracted_pct", "drowsy_pct",
                                              "no_face_pct", "total_blinks", "total_yawns", "avg_ear")}
        p = fatigue_model.predict(from_session(session))
        return {"session_date": _aware(s.started_at).date().isoformat(), "risk": p["risk"], "risk_score": p["risk_score"],
                "factors": [f["label"] for f in p["factors"]], "advice": p["advice"],
                "note": "An estimate from a model trained mostly on simulated sessions. Not a medical assessment."}

    return {"recent_sessions": recent_sessions, "fatigue_forecast": fatigue_forecast}


@router.get("/recommendations")
def recommendations(tz: int = TzOffset, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What to practise next, ranked by expected benefit, each with the data behind it."""
    return build_context(db, user, tz)["recommendations"]


@router.post("/coach/ask")
def ask(data: CoachQuestion, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ask the AI coach anything about your progress, interviews, speaking or focus."""
    return assistant.answer(data.question, build_context(db, user, data.tz), [t.model_dump() for t in data.history],
                            agent_tools(db, user))


@router.get("/coach/insight")
def daily_insight(tz: int = TzOffset, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Automated coaching note for today (shown on the dashboard)."""
    return assistant.insight(build_context(db, user, tz))
