"""NLP engine: sentiment, toxicity, keywords, wording confidence and extractive summaries.

Pure Python + VADER, no server dependencies — the backend wraps it (and can swap sentiment
for Amazon Comprehend), and the AI Lab page calls it through the API.
"""
import re
from collections import Counter

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_vader = SentimentIntensityAnalyzer()

STOPWORDS = set(
    """a an the and or but if then else when at by for with about against between into through during before
    after above below to from up down in out on off over under again further once here there all any both each
    few more most other some such no nor not only own same so than too very can will just don should now i me my
    we our you your he him his she her it its they them their what which who whom this that these those am is are
    was were be been being have has had having do does did doing would could ok okay yes yeah hi hello hey lol
    also get got like im its dont thats really going go know think let us maybe sort kind
    probably perhaps guess sorry""".split()
)

TOXIC_WORDS = {
    "idiot", "stupid", "dumb", "hate", "shut", "loser", "moron", "fool", "ugly", "trash",
    "useless", "kill", "damn", "crap", "nonsense", "pathetic",
}


HEDGES = [
    "i think", "i guess", "i feel like", "maybe", "probably", "perhaps", "sort of", "kind of", "not sure",
    "hopefully", "i suppose", "just", "sorry", "um", "uh",
]
ASSERTIVE = ["i will", "i'll", "i recommend", "we should", "definitely", "certainly", "i'm confident", "clearly",
             "let's", "i decided", "i know"]


def text_confidence(texts: list[str]) -> float:
    """0-100: how assertive the wording is (hedges pull it down, decisive phrases push it up)."""
    text = " " + " ".join(texts).lower() + " "
    words = max(len(text.split()), 1)
    hedges = sum(len(re.findall(rf"\b{re.escape(h)}\b", text)) for h in HEDGES)
    strong = sum(len(re.findall(rf"\b{re.escape(a)}(?!\w)", text)) for a in ASSERTIVE)
    return round(max(0.0, min(100.0, 75 + 450 * (strong - hedges) / words)), 1)


def analyze_sentiment(text: str) -> tuple[str, float]:
    """VADER sentiment: (positive|neutral|negative, compound score -1..1)."""
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


def analyze_message(text: str, sentiment=None) -> dict:
    label, score = (sentiment or analyze_sentiment)(text)
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


def analyze_text(text: str) -> dict:
    """Everything this module knows about one piece of text (used by the AI Lab)."""
    label, score = analyze_sentiment(text)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    lower = " " + text.lower() + " "
    return {
        "sentiment_label": label,
        "sentiment_score": round(score, 3),
        "sentiment_detail": _vader.polarity_scores(text),
        "is_toxic": is_toxic(text),
        "toxic_words": sorted(set(re.findall(r"[a-z']+", text.lower())) & TOXIC_WORDS),
        "keywords": extract_keywords(text, 8),
        "confidence": text_confidence([text]),
        "hedges": [h for h in HEDGES if re.search(rf"\b{re.escape(h)}\b", lower)],
        "assertive": [a for a in ASSERTIVE if re.search(rf"\b{re.escape(a)}(?!\w)", lower)],
        "summary": summarize_conversation(sentences, max_sentences=2) if len(sentences) > 2 else text,
        "words": len(text.split()),
        "sentences": len(sentences),
    }


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
        "confidence_by_user": {u: text_confidence([r["content"] for r in rows if r["username"] == u])
                               for u in {r["username"] for r in rows}},
    }
