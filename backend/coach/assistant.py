"""AI coach: answers your questions about your progress and about interviews, speaking and focus.

Two engines, same interface:
  * Claude (when ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set): Claude Opus 5.5 at low effort, grounded in your
    stats, your recommendations and the most relevant passages of the built-in guide. For questions it works as an
    agent: it can call tools to search the guide, read your sessions and forecast fatigue before it answers.
    Server-side fallbacks are on (`fallbacks="default"`), so a declined request is retried on another Claude model
    inside the same call.
  * Built-in (always available — no key, API error, or a refusal from every model): retrieves the best-matching
    guide passages with TF-IDF and combines them with your own numbers and top recommendation.
"""
import json
import logging
import os
import re
from collections.abc import Callable

from coach import graph, semantic
from interview.knowledge import FRAMEWORKS, GENERAL_QUESTIONS, GUIDE, WORD_SWAPS

log = logging.getLogger(__name__)

CLAUDE_MODEL = os.getenv("COACH_MODEL", "claude-opus-5-5")
SYSTEM_PROMPT = (
    "You are the personal coach inside Presence AI, an app for focus, confident speaking and interview practice. "
    "Answer the user's question in under 160 words: warm, direct and practical, with at most 3 concrete steps. "
    "Use only the user's data, the guide passages and your tools; never invent numbers. When the summary isn't enough, "
    "look it up with a tool instead of guessing. If the data still isn't enough to answer, say what to do in the app "
    "to get it. Fatigue forecasts are estimates, not medical advice: say so. Plain text, no headings."
)
MAX_TOOL_ROUNDS = 5  # requests in one answer: enough for a few look-ups, and a hard stop on cost and waiting
TOOLS = [
    {"name": "search_guide", "strict": True,
     "description": "Search the built-in coaching guide on interviews, speaking, filler words, body language and focus. "
                    "Use it for advice on a topic the passages you were given don't cover.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["query"],
                      "properties": {"query": {"type": "string", "description": "What to look up, in plain words"}}}},
    {"name": "recent_sessions", "strict": True,
     "description": "Read this user's own recent sessions, newest first, with dates and scores. Use it for questions "
                    "about specific sessions or trends the summary doesn't show.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["kind", "limit"],
                      "properties": {"kind": {"type": "string", "enum": ["focus", "speech", "interview"]},
                                     "limit": {"type": "integer", "description": "How many sessions, 1 to 10"}}}},
    {"name": "fatigue_forecast", "strict": True,
     "description": "Estimate this user's fatigue risk from their latest focus session, with the factors behind it. "
                    "Use it when they ask if they are tired or should take a break.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": [], "properties": {}}},
]
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
RRF_K = 60  # the standard reciprocal rank fusion constant
MIN_SIMILARITY = 0.45  # below this, a question isn't about anything in the guide (see coach/eval_search.py)


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


def _keyword_scores(question: str):
    """TF-IDF cosine similarity of the question to every passage (the index is built once)."""
    global _INDEX
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel

    if _INDEX is None:
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        _INDEX = (vec, vec.fit_transform(_DOCS))
    vec, matrix = _INDEX
    return linear_kernel(vec.transform([_expand(question)]), matrix).ravel()


def ranked_keywords(question: str) -> list[str]:
    sims = _keyword_scores(question)
    return [_DOCS[i] for i in sims.argsort()[::-1] if sims[i] > 0]


def ranked_hybrid(question: str) -> list[str]:
    """Keyword and meaning rankings merged by reciprocal rank fusion: a passage near the top of either list rises."""
    sims = _keyword_scores(question)
    fused: dict[int, float] = {}
    for rank, i in enumerate(sims.argsort()[::-1]):
        if sims[i] > 0:
            fused[int(i)] = 1 / (RRF_K + rank)
    for rank, (i, _) in enumerate(semantic.search(question, _DOCS) or []):
        fused[i] = fused.get(i, 0) + 1 / (RRF_K + rank)
    return [_DOCS[i] for i in sorted(fused, key=fused.get, reverse=True)]


def retrieve(question: str, k: int = 3) -> list[str]:
    """Top-k guide passages for a question: keywords and meaning together when the embeddings are available.

    An off-topic question gets nothing, so the coach says it has no guide entry rather than quoting something unrelated.
    """
    sims = _keyword_scores(question)
    matches = semantic.search(question, _DOCS)
    if matches and matches[0][1] >= MIN_SIMILARITY:
        return ranked_hybrid(question)[:k]
    order = sims.argsort()[::-1][:k]
    best = sims[order[0]] if len(order) else 0
    # passages scoring well below the best match are dropped, so a weak keyword overlap doesn't make it in
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
                         f"{k['practice_sessions']} recording{'' if k['practice_sessions'] == 1 else 's'} at {k['avg_confidence']}% average confidence"
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


def _run_tool(block, tools: dict[str, Callable]) -> dict:
    """One tool_use block as its tool_result. A failed tool is reported to Claude, which can then work around it."""
    result = {"type": "tool_result", "tool_use_id": block.id}
    try:
        result["content"] = json.dumps(tools[block.name](**block.input), default=str)
    except Exception as e:  # noqa: BLE001 - a broken look-up must not lose the whole answer
        log.warning("coach: tool %s failed (%s)", block.name, e.__class__.__name__)
        result.update(content=f"That look-up failed ({e.__class__.__name__}).", is_error=True)
    return result


def _loop(ask: Callable, act: Callable, max_rounds: int):
    """The agent's steps without LangGraph: Claude's final response, or None if it's still calling tools at the limit."""
    for _ in range(max_rounds):
        response = ask()
        if response.stop_reason != "tool_use":
            return response
        act(response)
    return None


def _claude(question: str, ctx: dict, history: list[dict], tools: dict[str, Callable] | None) -> tuple[str | None, list[str]]:
    """Claude's answer and the tools it used. The answer is None to use the built-in engine: no key, an API error,
    refused by every model, or still calling tools after MAX_TOOL_ROUNDS.

    `tools` None makes one plain request (the dashboard note, which runs on every page load)."""
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return None, []
    try:
        import anthropic
    except ImportError:
        return None, []
    guide = "\n".join(f"- {t}" for t in retrieve(question, k=4)) or "- (no matching passage)"
    # only user/assistant turns from the browser, starting with a user turn (as the API requires)
    messages = [{"role": m["role"], "content": str(m["content"])[:2000]} for m in history[-6:]
                if m.get("role") in ("user", "assistant") and m.get("content")]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    messages.append({"role": "user", "content": f"My data:\n{context_text(ctx)}\n\nRelevant guide passages:\n{guide}"
                                                f"\n\nMy question: {question}"})
    handlers = None if tools is None else {**tools, "search_guide": lambda query: retrieve(query, k=4)}
    offered = {} if handlers is None else {"tools": [t for t in TOOLS if t["name"] in handlers]}
    client = anthropic.Anthropic(max_retries=1, timeout=30.0)
    used: list[str] = []

    def ask():
        return client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            output_config={"effort": "low"},  # short coaching answers: fast and cheap
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM_PROMPT,
            messages=messages,
            **offered,
        )

    def act(response):
        calls = [b for b in response.content if b.type == "tool_use"]
        used.extend(c.name for c in calls)
        # the whole response goes back (thinking blocks included), and all results in one message
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": [_run_tool(c, handlers or {}) for c in calls]})

    try:
        response = (graph.run if tools and graph.enabled() else _loop)(ask, act, MAX_TOOL_ROUNDS)
    except anthropic.APIStatusError as e:
        log.warning("coach: Claude API error %s — using the built-in coach", e.status_code)
        return None, used
    except anthropic.APIConnectionError:
        log.warning("coach: Claude unreachable — using the built-in coach")
        return None, used
    if response is None:
        log.warning("coach: still calling tools after %s rounds — using the built-in coach", MAX_TOOL_ROUNDS)
        return None, used
    if response.stop_reason == "refusal":
        return None, used
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None, used


def answer(question: str, ctx: dict, history: list[dict] | None = None, tools: dict[str, Callable] | None = None) -> dict:
    """{answer, engine, follow_ups, tools_used} for one question. `tools` are the signed-in user's own look-ups
    (coach_routes.agent_tools); with none, Claude can still search the guide."""
    text, used = _claude(question, ctx, history or [], tools or {})
    engine = "claude" if text else "built-in"
    if not text:
        text = _builtin(question, ctx)
    follow = [q for q in FOLLOW_UPS if q.lower() != question.strip().lower()][:3]
    return {"answer": text, "engine": engine, "follow_ups": follow, "tools_used": used}


def insight(ctx: dict) -> dict:
    """Today's automated coaching note for the dashboard: one plain request, as it runs on every page load."""
    question = "Give me a short summary of how I'm doing and the single most useful thing to do today."
    text, _ = _claude(question, ctx, [], None)
    return {"answer": text or _builtin(question, ctx), "engine": "claude" if text else "built-in",
            "follow_ups": FOLLOW_UPS[:3], "tools_used": []}
