import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.routers.speech_routes import MAX_UPLOAD_MB, save_report
from app.schemas import SpeechSessionCreate
from interview.knowledge import FIELDS, FRAMEWORKS, GUIDE, POWER_VERBS, WORD_SWAPS, all_questions, find_question

router = APIRouter(prefix="/interview", tags=["interview"])


@router.get("/fields")
def fields():
    """Job fields with dress code, key skills and power words."""
    return [{"key": k, "label": f["label"], "icon": f["icon"], "dress": f["dress"], "skills": f["skills"],
             "power_words": f["power_words"]} for k, f in FIELDS.items()]


@router.get("/questions")
def questions(field: str = "general"):
    """General interview questions plus role-specific ones for `field`."""
    if field not in FIELDS:
        raise HTTPException(404, "Unknown field")
    return all_questions(field)


@router.get("/guide")
def guide():
    """Preparation guide: getting the interview, first impression, dressing, body language, voice, vocabulary…"""
    return {"sections": GUIDE, "frameworks": FRAMEWORKS, "word_swaps": WORD_SWAPS, "power_verbs": POWER_VERBS}


@router.post("/answer")
def answer(
    audio: UploadFile = File(..., description="Recorded answer: webm/ogg/wav/mp3/m4a"),
    question_id: str = Form(...),
    field: str = Form("general"),
    presence: str = Form("", description="JSON from the face tracker: smile_pct, brightness, sharpness…"),
    eye_contact: float | None = Form(None, ge=0, le=100),
    whisper_model: str = Form("base.en"),
    save: bool = Form(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mock-interview answer → speech analysis + interview feedback (content, delivery, presence)."""
    from interview.coach import answer_feedback
    from speech.analyzer import analyze
    from speech.audio import decode_audio
    from speech.conversation import conversation_feedback

    question = find_question(question_id, field)
    if question is None:
        raise HTTPException(404, "Unknown question for this field")
    try:
        pres = json.loads(presence) if presence else {}
        if not isinstance(pres, dict):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(422, "presence must be a JSON object") from exc
    data = audio.file.read(MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Recording is larger than {MAX_UPLOAD_MB} MB")
    try:
        samples = decode_audio(data)
    except Exception as exc:  # unreadable / unsupported container
        raise HTTPException(400, f"Could not read the audio file: {exc}") from exc
    if len(samples) < 3 * 16000:
        raise HTTPException(400, "Recording too short — answer for at least a few seconds")
    if eye_contact is not None:
        pres.setdefault("eye_contact", eye_contact)
    report = analyze(samples, eye_contact=pres.get("eye_contact"),
                     model_size=whisper_model if whisper_model in ("base.en", "small.en") else "base.en")
    if report.get("error"):
        raise HTTPException(422, report["error"])
    report["conversation"] = conversation_feedback(report, "interview")
    report["interview"] = answer_feedback(report, question, field, pres)
    session_id = None
    if save:
        prompt = f"[Interview · {FIELDS.get(field, FIELDS['general'])['label']}] {question['q']}"
        session_id = save_report(SpeechSessionCreate(report=report, mode="interview", prompt=prompt), user, db).id
    return {"session_id": session_id, "report": report}
