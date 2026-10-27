"""AI endpoints: the ML fatigue model and the NLP engine, exposed for the app and the AI Lab."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import AttentionSession, User
from backend.schemas import FatigueFeatures, SessionOut, TextIn
from backend.services import nlp_service
from ml import predict as fatigue_model
from ml.features import from_session

router = APIRouter(tags=["ai"])


@router.get("/ml/model")
def model_card(_: User = Depends(get_current_user)):
    """Model card: algorithm, test metrics, confusion matrix, feature importance, training data."""
    return fatigue_model.load()[1]


@router.post("/ml/predict")
def predict(data: FatigueFeatures, _: User = Depends(get_current_user)):
    return fatigue_model.predict(data.model_dump())


@router.get("/ml/fatigue/me")
def my_fatigue(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fatigue risk for the user's most recent saved focus session."""
    last = db.scalar(select(AttentionSession).where(AttentionSession.user_id == user.id)
                     .order_by(AttentionSession.id.desc()).limit(1))
    if not last:
        return None
    features = from_session(SessionOut.model_validate(last).model_dump())
    return {"session_id": last.id, "features": features, **fatigue_model.predict(features)}


@router.post("/nlp/analyze")
def analyze_text(data: TextIn, _: User = Depends(get_current_user)):
    result = nlp_service.analyze_text(data.text)
    result["sentiment_label"], result["sentiment_score"] = nlp_service.analyze_sentiment(data.text)
    return result
