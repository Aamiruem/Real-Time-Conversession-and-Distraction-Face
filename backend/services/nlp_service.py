"""NLP for conversations: sentiment, toxicity, keywords, extractive summary.

Uses VADER locally; switches to Amazon Comprehend when USE_COMPREHEND=true.
"""
import re
from collections import Counter

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from backend.config import settings
from backend.services import aws_service

_vader = SentimentIntensityAnalyzer()

STOPWORDS = set(
    """a an the and or but if then else when at by for with about against between into through during before
    after above below to from up down in out on off over under again further once here there all any both each
    few more most other some such no nor not only own same so than too very can will just don should now i me my
    we our you your he him his she her it its they them their what which who whom this that these those am is are
    was were be been being have has had having do does did doing would could ok okay yes yeah hi hello hey lol
    also get got like im its dont thats really going go know think let us""".split()
)

TOXIC_WORDS = {
    "idiot", "stupid", "dumb", "hate", "shut", "loser", "moron", "fool", "ugly", "trash",
    "useless", "kill", "damn", "crap", "nonsense", "pathetic",
}


def analyze_sentiment(text: str) -> tuple[str, float]:
    if settings.USE_COMPREHEND:
        result = aws_service.comprehend_sentiment(text)
        if result:
            return result
    compound = _vader.polarity_scores(text)["compound"]
    if compound >= 0.05:
        return "positive", compound
    if compound <= -0.05:
        return "negative", compound
    return "neutral", compound


def is_toxic(text: str) -> bool:
    words = set(re.findall(r"[a-z']+", text.lower()))
    return bool(words & TOXIC_WORDS)


def extract_keywords(text: str, top_k: int = 5) -> list[str]:
    words = [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+#-]{2,}", text.lower()) if w not in STOPWORDS]
    return [w for w, _ in Counter(words).most_common(top_k)]


def analyze_message(text: str) -> dict:
    label, score = analyze_sentiment(text)
    return {
        "sentiment_label": label,
        "sentiment_score": round(score, 3),
        "is_toxic": is_toxic(text),
        "keywords": extract_keywords(text, 3),
    }


def summarize_conversation(messages: list[str], max_sentences: int = 3) -> str:
    """Frequency-based extractive summary: pick the most informative messages."""
    if not messages:
        return "No conversation yet."
    freq = Counter(extract_keywords(" ".join(messages), top_k=50))
    scored = []
    for idx, msg in enumerate(messages):
        tokens = re.findall(r"[a-zA-Z]+", msg.lower())
        if not tokens:
            continue
        score = sum(freq.get(t, 0) for t in tokens) / (len(tokens) ** 0.5)
        scored.append((score, idx, msg))
    best = sorted(sorted(scored, reverse=True)[:max_sentences], key=lambda x: x[1])
    return " … ".join(m for _, _, m in best)


def conversation_insights(rows: list[dict]) -> dict:
    """rows: [{'username', 'content', 'sentiment_label', 'is_toxic', 'sender_focus'}]"""
    texts = [r["content"] for r in rows]
    sentiments = Counter(r["sentiment_label"] for r in rows)
    focus_by_user: dict[str, list[float]] = {}
    for r in rows:
        if r.get("sender_focus") is not None:
            focus_by_user.setdefault(r["username"], []).append(r["sender_focus"])
    return {
        "total_messages": len(rows),
        "sentiment_distribution": dict(sentiments),
        "toxic_messages": sum(1 for r in rows if r["is_toxic"]),
        "top_keywords": extract_keywords(" ".join(texts), top_k=10),
        "summary": summarize_conversation(texts),
        "avg_focus_while_chatting": {u: round(sum(v) / len(v), 1) for u, v in focus_by_user.items()},
        "messages_per_user": dict(Counter(r["username"] for r in rows)),
    }
