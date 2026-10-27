from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import AttentionSession, FocusSnapshot, User
from backend.schemas import FatigueFeedback, FocusUpdate, SessionCreate, SessionOut
from backend.services import aws_service
from backend.websocket_manager import manager

router = APIRouter(prefix="/attention", tags=["attention"])


@router.post("/update")
async def live_update(data: FocusUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called every few seconds by the frontend with the latest computer-vision metrics."""
    db.add(FocusSnapshot(user_id=user.id, **data.model_dump()))
    db.commit()
    await manager.push_focus(user.id, user.username, {"state": data.state, "focus_pct": data.focus_pct})
    return {"ok": True}


@router.post("/sessions", response_model=SessionOut)
def save_session(data: SessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = data.model_dump(exclude={"timeline"})
    session = AttentionSession(user_id=user.id, **payload)
    db.add(session)
    db.commit()
    db.refresh(session)

    report = {"user": user.username, "session_id": session.id, **payload, "timeline": data.timeline}
    url = aws_service.upload_session_report(user.id, session.id, report)
    if url:
        session.report_url = url
        db.commit()
        db.refresh(session)
    return session


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AttentionSession).where(AttentionSession.user_id == user.id).order_by(AttentionSession.started_at)
    )
    return list(rows)


@router.patch("/sessions/{session_id}/feedback", response_model=SessionOut)
def session_feedback(session_id: int, data: FatigueFeedback, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """User's own fatigue rating — becomes a training label for the ML model (python -m ml.train --with-db)."""
    session = db.get(AttentionSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Session not found")
    session.self_fatigue = data.self_fatigue
    db.commit()
    db.refresh(session)
    return session


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.get(AttentionSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Session not found")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/snapshots")
def recent_snapshots(limit: int = 300, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(FocusSnapshot)
        .where(FocusSnapshot.user_id == user.id)
        .order_by(FocusSnapshot.timestamp.desc())
        .limit(limit)
    )
    return [
        {"timestamp": r.timestamp, "state": r.state, "focus_pct": r.focus_pct, "distracted_pct": r.distracted_pct}
        for r in reversed(list(rows))
    ]
