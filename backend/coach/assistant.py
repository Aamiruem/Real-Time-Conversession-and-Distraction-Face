"""AI coach: answers your questions about your progress and about interviews, speaking and focus.

Two engines, same interface:
  * Claude (when ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set): Claude Opus 5.5 at low effort, grounded in your
    stats, your recommendations and the most relevant passages of the built-in guide. Server-side fallbacks are on
    (`fallbacks="default"`), so a declined request is retried on another Claude model inside the same call.
  * Built-in (always available — no key, API error, or a refusal from every model): retrieves the best-matching
    guide passages with TF-IDF and combines them with your own numbers and top recommendation.
"""
import logging
import os
import re

from interview.knowledge import FRAMEWORKS, GENERAL_QUESTIONS, GUIDE, WORD_SWAPS

log = logging.getLogger(__name__)

CLAUDE_MODEL = os.getenv("COACH_MODEL", "claude-opus-5-5")
SYSTEM_PROMPT = (
    "You are the personal coach inside Presence AI, an app for focus, confident speaking and interview practice. "
    "Answer the user's question in under 160 words: warm, direct and practical, with at most 3 concrete steps. "
    "Use only the user's data and the guide passages provided; never invent numbers. If the data is not enough to "
    "answer, say what to do in the app to get it. Plain text, no headings."
)
FOLLOW_UPS = ["How am I doing this week?", "What should I practise next?", "How do I answer “Tell me about yourself”?",
              "How do I stop saying “um”?", "How do I look confident on camera?"]
PROGRESS_WORDS = re.compile(r"\b(how am i|my progress|doing|this week|stats?|score|improv|summary|overview|insight)",
                            re.I)


def _knowledge() -> list[str]:
    """The guide, answer frameworks, question outlines and word swaps as short retrievable passages."""
    docs = [f"{s['title']}: {tip}" for s in GUIDE for tip in s["tips"]]
    docs += [f"{f['label']} answer structure: " + " → ".join(f["steps"]) for f in FRAMEWORKS.values()]
    docs += [f"Interview question “{q['q']}”: they look for {q['looks_for']} Outline: {'; '.join(q['outline'])}. "
             f"Avoid: {'; '.join(q['pitfalls'])}." for q in GENERAL_QUESTIONS]
    docs += [f"Instead of “{w['weak']}” say {w['strong']} — {w['why']}" for w in WORD_SWAPS]
    return docs


_DOCS = _knowledge()
_INDEX = None


# everyday words -> the guide's vocabulary, so "how do I stop saying um" finds the filler-word advice
SYNONYMS = {
    r"\b(um+|uh+|erm|like)\b": "filler words fillers pause silent breath",
    r"\bnervous|anxious|scared|panic": "nerves breathing confidence box breathing",
    r"\b(eyes?|look(ing)? at)\b": "eye contact camera lens",
    r"\b(wear|clothes|outfit|dress)": "dressing dress code",
    r"\b(sit|sitting|slouch|hands?)\b": "posture body language gestures",
    r"\b(voice|tone|monotone|boring)\b": "voice pitch modulation tone",
    r"\b(fast|slow|speed)\b": "pace words per minute",
    r"\b(salary|pay|money)\b": "salary expectations range",
    r"\b(job|apply|resume|cv|linkedin)\b": "get the interview cv linkedin referrals",
}


def _expand(question: str) -> str:
    q = question.lower()
    return " ".join([q] + [extra for pattern, extra in SYNONYMS.items() if re.search(pattern, q)])


def retrieve(question: str, k: int = 3) -> list[str]:
    """Top-k guide passages for a question (TF-IDF cosine similarity; the index is built once).

    Passages scoring well below the best match are dropped, so a weak keyword overlap doesn't make it in.
    """
    global _INDEX
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel

    if _INDEX is None:
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        _INDEX = (vec, vec.fit_transform(_DOCS))
    vec, matrix = _INDEX
    sims = linear_kernel(vec.transform([_expand(question)]), matrix).ravel()
    order = sims.argsort()[::-1][:k]
    best = sims[order[0]] if len(order) else 0
    return [_DOCS[i] for i in order if sims[i] > 0.05 and sims[i] >= 0.6 * best]


def context_text(ctx: dict) -> str:
    """The user's situation in a few lines (shared by both engines)."""
    k = ctx["stats"]
    lines = [f"Name: {ctx['name']}",
             f"Focus: {k['focus_sessions']} sessions, average focus {k['avg_focus_pct']}%, streak {k['streak_days']} days",
             f"Speaking: {k['practice_sessions']} recordings, average confidence {k['avg_confidence']}%"]
    if k.get("weakest_skill"):
        lines.append(f"Weakest speaking skill: {k['weakest_skill']}")
    if k.get("latest_readiness") is not None:
        lines.append(f"Latest interview readiness: {k['latest_readiness']}%")
    lines += [f"Recommendation: {r['title']} — {r['reason']} {r['action']}" for r in ctx["recommendations"][:3]]
    return "\n".join(lines)


def _builtin(question: str, ctx: dict) -> str:
    k, recs = ctx["stats"], ctx["recommendations"]
    parts = []
    if PROGRESS_WORDS.search(question):
        if k["focus_sessions"] or k["practice_sessions"]:
            parts.append(f"So far: {k['focus_sessions']} focus sessions at {k['avg_focus_pct']}% average focus and "
                         f"{k['practice_sessions']} recordings at {k['avg_confidence']}% average confidence"
                         + (f", with a {k['streak_days']}-day streak." if k["streak_days"] else "."))
            if k.get("weakest_skill"):
                parts.append(f"Your weakest speaking skill right now is {k['weakest_skill']}.")
        else:
            parts.append("You haven't recorded anything yet — do one focus session and one 60-second recording, and "
                         "I'll be able to tell you exactly where you stand.")
    else:
        tips = retrieve(question)
        if tips:
            parts.append("Here's what works:")
            parts += [f"• {t}" for t in tips]
        else:
            parts.append("I don't have a guide entry for that yet — try asking about interviews, speaking, filler "
                         "words, eye contact, posture or focus.")
    if recs:
        parts.append(f"Next for you: {recs[0]['title']} — {recs[0]['action']}")
    return "\n".join(parts)


def _claude(question: str, ctx: dict, history: list[dict]) -> str | None:
    """Claude's answer, or None to use the built-in engine (no key, API error, or refused by every model)."""
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return None
    try:
        import anthropic
    except ImportError:
        return None
    guide = "\n".join(f"- {t}" for t in retrieve(question, k=4)) or "- (no matching passage)"
    # only user/assistant turns from the browser, starting with a user turn (as the API requires)
    messages = [{"role": m["role"], "content": str(m["content"])[:2000]} for m in history[-6:]
                if m.get("role") in ("user", "assistant") and m.get("content")]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    messages.append({"role": "user", "content": f"My data:\n{context_text(ctx)}\n\nRelevant guide passages:\n{guide}"
                                                f"\n\nMy question: {question}"})
    try:
        response = anthropic.Anthropic(max_retries=1, timeout=30.0).beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            output_config={"effort": "low"},  # short coaching answers: fast and cheap
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM_PROMPT,
            messages=messages,
        )
    except anthropic.APIStatusError as e:
        log.warning("coach: Claude API error %s — using the built-in coach", e.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("coach: Claude unreachable — using the built-in coach")
        return None
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None


def answer(question: str, ctx: dict, history: list[dict] | None = None) -> dict:
    """{answer, engine, follow_ups} for one question."""
    text = _claude(question, ctx, history or [])
    engine = "claude" if text else "built-in"
    if not text:
        text = _builtin(question, ctx)
    follow = [q for q in FOLLOW_UPS if q.lower() != question.strip().lower()][:3]
    return {"answer": text, "engine": engine, "follow_ups": follow}


def insight(ctx: dict) -> dict:
    """Today's automated coaching note for the dashboard."""
    return answer("Give me a short summary of how I'm doing and the single most useful thing to do today.", ctx)
