import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import SpeechSession, User
from app.schemas import SpeechSessionCreate, SpeechSessionOut

router = APIRouter(prefix="/speech", tags=["speech"])
MAX_UPLOAD_MB = 25

SCORE_FIELDS = ("fluency", "pace", "clarity", "voice", "assertiveness", "eye_contact")


def to_out(s: SpeechSession, with_report: bool = False) -> SpeechSessionOut:
    fields = {k: getattr(s, k) for k in SpeechSessionOut.model_fields if k != "report"}
    return SpeechSessionOut(**fields, report=json.loads(s.report) if with_report else None)


@router.post("/analyze")
def analyze_upload(
    audio: UploadFile = File(..., description="Recording: webm/ogg/wav/mp3/m4a"),
    mode: str = Form("free"),
    prompt: str = Form(""),
    eye_contact: float | None = Form(None, ge=0, le=100),
    whisper_model: str = Form("base.en"),
    save: bool = Form(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Transcribe + score a recording with the speech coach engine; saved as a speech session by default."""
    from speech.analyzer import analyze
    from speech.audio import decode_audio

    data = audio.file.read(MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Recording is larger than {MAX_UPLOAD_MB} MB")
    try:
        samples = decode_audio(data)
    except Exception as exc:  # unreadable / unsupported container
        raise HTTPException(400, f"Could not read the audio file: {exc}") from exc
    if len(samples) < 3 * 16000:
        raise HTTPException(400, "Recording too short — speak for at least a few seconds")
    report = analyze(samples, eye_contact=eye_contact, model_size=whisper_model if whisper_model in ("base.en", "small.en")
                     else "base.en", passage=prompt if mode == "read" else None)
    if report.get("error"):
        raise HTTPException(422, report["error"])
    session_id = None
    if save:
        session_id = save_report(SpeechSessionCreate(report=report, mode=mode, prompt=prompt), user, db).id
    return {"session_id": session_id, "report": report}


@router.post("/sessions", response_model=SpeechSessionOut)
def save(data: SpeechSessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return save_report(data, user, db)


def save_report(data: SpeechSessionCreate, user: User, db: Session) -> SpeechSessionOut:
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
