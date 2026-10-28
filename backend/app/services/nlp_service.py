"""Backend wrapper around the standalone NLP engine (nlp/text_analyzer.py).

Uses VADER locally; switches sentiment to Amazon Comprehend when USE_COMPREHEND=true.
"""
from app.config import settings
from app.services import aws_service
from nlp.text_analyzer import analyze_text, conversation_insights, text_confidence  # noqa: F401  (re-exported)
from nlp.text_analyzer import analyze_sentiment as _local_sentiment


def analyze_sentiment(text: str) -> tuple[str, float]:
    if settings.USE_COMPREHEND:
        result = aws_service.comprehend_sentiment(text)
        if result:
            return result
    return _local_sentiment(text)


def analyze_message(text: str) -> dict:
    from nlp.text_analyzer import analyze_message as _analyze

    return _analyze(text, sentiment=analyze_sentiment)
