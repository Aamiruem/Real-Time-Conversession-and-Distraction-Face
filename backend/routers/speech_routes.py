import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import SpeechSession, User
from backend.schemas import SpeechSessionCreate, SpeechSessionOut

router = APIRouter(prefix="/speech", tags=["speech"])

SCORE_FIELDS = ("fluency", "pace", "clarity", "voice", "assertiveness", "eye_contact")


def to_out(s: SpeechSession, with_report: bool = False) -> SpeechSessionOut:
    fields = {k: getattr(s, k) for k in SpeechSessionOut.model_fields if k != "report"}
    return SpeechSessionOut(**fields, report=json.loads(s.report) if with_report else None)


@router.post("/sessions", response_model=SpeechSessionOut)
def save(data: SpeechSessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = data.report
    if "confidence" not in r or "scores" not in r:
        raise HTTPException(422, "report must be a Speech Coach analysis")
    m, scores = r.get("metrics", {}), r["scores"]
    row = SpeechSession(
        user_id=user.id, mode=data.mode, prompt=data.prompt[:2000],
        duration_sec=m.get("duration_sec", 0), confidence=r["confidence"],
        wpm=m.get("wpm", 0), fillers=m.get("fillers", 0), transcript=r.get("transcript", ""),
        report=json.dumps(r), **{k: scores.get(k, 0 if k != "eye_contact" else None) for k in SCORE_FIELDS},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row, with_report=True)


@router.get("/sessions", response_model=list[SpeechSessionOut])
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SpeechSession).where(SpeechSession.user_id == user.id).order_by(SpeechSession.created_at))
    return [to_out(r) for r in rows]


@router.get("/sessions/latest", response_model=SpeechSessionOut | None)
def latest(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.scalar(
        select(SpeechSession).where(SpeechSession.user_id == user.id).order_by(SpeechSession.id.desc()).limit(1)
    )
    return to_out(row, with_report=True) if row else None


@router.delete("/sessions/{session_id}")
def delete(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(SpeechSession, session_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Speech session not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
