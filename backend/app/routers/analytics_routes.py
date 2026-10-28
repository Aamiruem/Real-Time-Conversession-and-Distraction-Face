from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AttentionSession, Message, SpeechSession, User

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/me")
def my_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.execute(
        select(
            func.count(AttentionSession.id),
            func.coalesce(func.sum(AttentionSession.duration_sec), 0),
            func.coalesce(func.avg(AttentionSession.focus_pct), 0),
            func.coalesce(func.avg(AttentionSession.distracted_pct), 0),
            func.coalesce(func.avg(AttentionSession.drowsy_pct), 0),
            func.coalesce(func.sum(AttentionSession.total_yawns), 0),
        ).where(AttentionSession.user_id == user.id)
    ).one()
    msgs = db.scalar(select(func.count(Message.id)).where(Message.user_id == user.id))
    speech_n, speech_conf = db.execute(
        select(func.count(SpeechSession.id), func.coalesce(func.avg(SpeechSession.confidence), 0))
        .where(SpeechSession.user_id == user.id)
    ).one()
    return {
        "sessions": s[0],
        "total_minutes": round(s[1] / 60, 1),
        "avg_focus_pct": round(s[2], 1),
        "avg_distracted_pct": round(s[3], 1),
        "avg_drowsy_pct": round(s[4], 1),
        "total_yawns": s[5],
        "messages_sent": msgs,
        "speech_sessions": speech_n,
        "avg_speech_confidence": round(speech_conf, 1),
    }


@router.get("/leaderboard")
def leaderboard(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(User.username, func.avg(AttentionSession.focus_pct), func.sum(AttentionSession.duration_sec))
        .join(AttentionSession, AttentionSession.user_id == User.id)
        .group_by(User.id)
        .order_by(func.avg(AttentionSession.focus_pct).desc())
        .limit(10)
    ).all()
    return [{"username": u, "avg_focus_pct": round(f, 1), "minutes": round(d / 60, 1)} for u, f, d in rows]
