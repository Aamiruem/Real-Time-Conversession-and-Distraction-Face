"""Recommendation engine: what to practise next, ranked by how much it should help *you*.

Content-based and data-driven — it learns from your own history, so it works from your first sessions
(collaborative filtering would need many users before it beats this). Each recommendation says why it was made:

  * best focus time      -> the part of the day your focus % is highest
  * best session length  -> the session length after which your focus drops
  * drowsiness           -> rest advice when drowsy time is high
  * skill gaps           -> your weakest speaking skill, mapped to a concrete exercise
  * confidence trend     -> improving or slipping over your last recordings
  * interview practice   -> questions to re-practise (spaced: low score, not attempted today) and core
                            questions you have not tried yet
  * variety              -> conversation types you have not practised

Input is plain dicts (see `load_history` in app/routers/coach_routes.py), output is a ranked list of dicts.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean

CORE_QUESTIONS = ["g-about", "g-why-hire", "g-strengths", "g-weakness", "g-challenge", "g-conflict"]
SKILLS = {
    "fluency": ("Fluency", "/app/conversation", "60-second filler-free drill: talk about your day and pause silently "
                "instead of saying “um”."),
    "pace": ("Pace", "/app/speech", "Read-aloud mode: aim for 120–160 words per minute with a pause at every full stop."),
    "clarity": ("Pronunciation clarity", "/app/speech", "Read-aloud mode with a tongue-twister passage, slowly first."),
    "voice": ("Voice modulation", "/app/conversation", "Storytelling practice: speed up in the action, slow down and "
              "drop your voice before the turning point."),
    "assertiveness": ("Word confidence", "/app/conversation", "Re-record an answer using the “Say it like this” "
                      "version — no “I think”, “maybe” or “just”."),
    "eye_contact": ("Eye contact", "/app/focus", "Put a sticky note next to the lens and hold it for a full sentence."),
}
DAYPARTS = [("night", 0, 5), ("morning", 5, 12), ("afternoon", 12, 17), ("evening", 17, 22), ("night", 22, 24)]
LENGTHS = [("under 15 min", 0, 15), ("15–30 min", 15, 30), ("30–50 min", 30, 50), ("over 50 min", 50, 10_000)]
CONVERSATION_TYPES = {"interview": "Job interview", "presentation": "Presentation", "meeting": "Team meeting",
                      "sales": "Sales pitch", "debate": "Debate / negotiation", "phone": "Phone / video call"}


@dataclass
class Recommendation:
    id: str
    kind: str          # focus | speaking | interview | wellbeing | variety
    icon: str
    title: str
    reason: str        # the data behind it — shown to the user
    action: str        # what to do
    href: str          # where in the app
    priority: float    # 0-100, higher = more expected benefit


def _daypart(hour: int) -> str:
    return next(name for name, lo, hi in DAYPARTS if lo <= hour < hi)


def _bucket_means(rows, key, value, min_n=2):
    groups: dict[str, list[float]] = {}
    for r in rows:
        groups.setdefault(key(r), []).append(value(r))
    return {k: (mean(v), len(v)) for k, v in groups.items() if len(v) >= min_n}


def focus_recs(focus: list[dict]) -> list[Recommendation]:
    recs = []
    if len(focus) < 4:
        return recs
    overall = mean(s["focus_pct"] for s in focus)
    parts = _bucket_means(focus, lambda s: _daypart(s["started_at"].hour), lambda s: s["focus_pct"])
    if len(parts) >= 2:
        best, (best_avg, n) = max(parts.items(), key=lambda kv: kv[1][0])
        if best_avg - overall >= 3:
            recs.append(Recommendation(
                "focus-time", "focus", "⏰", f"Schedule deep work in the {best}",
                f"Your focus averages {best_avg:.0f}% in the {best} ({n} sessions) vs {overall:.0f}% overall.",
                f"Block your hardest task for the {best} tomorrow.", "/app/focus", min(90.0, 40 + (best_avg - overall) * 3)))
    lengths = _bucket_means(focus, lambda s: next(n for n, lo, hi in LENGTHS if lo <= s["duration_sec"] / 60 < hi),
                            lambda s: s["focus_pct"])
    if len(lengths) >= 2:
        order = [name for name, _, _ in LENGTHS if name in lengths]
        best = max(order, key=lambda k: lengths[k][0])
        worst = min(order, key=lambda k: lengths[k][0])
        drop = lengths[best][0] - lengths[worst][0]
        if drop >= 5 and order.index(worst) > order.index(best):
            recs.append(Recommendation(
                "session-length", "focus", "⏱️", f"Keep focus blocks to {best}",
                f"Sessions of {best} average {lengths[best][0]:.0f}% focus; {worst} sessions drop to "
                f"{lengths[worst][0]:.0f}%.", "Work in shorter blocks with a 5-minute break between them.",
                "/app/focus", min(85.0, 35 + drop * 2)))
    return recs


def wellbeing_recs(focus: list[dict]) -> list[Recommendation]:
    recent = focus[-5:]
    if len(recent) < 2:
        return []
    drowsy = mean(s["drowsy_pct"] for s in recent)
    if drowsy < 8:
        return []
    return [Recommendation(
        "drowsiness", "wellbeing", "😴", "You've been drowsy in recent sessions",
        f"Drowsy {drowsy:.0f}% of the time across your last {len(recent)} sessions.",
        "Sleep 7–9 hours, take a 10-minute walk before deep work, keep the room bright.", "/app/focus",
        min(95.0, 50 + drowsy * 2))]


def speaking_recs(speech: list[dict]) -> list[Recommendation]:
    recs = []
    recent = speech[-5:]
    if recent:
        avgs = {k: mean(vals) for k in SKILLS if (vals := [s[k] for s in recent if s.get(k) is not None])}
        if avgs:
            weak = min(avgs, key=avgs.get)
            label, href, drill = SKILLS[weak]
            if avgs[weak] < 85:
                recs.append(Recommendation(
                    f"skill-{weak}", "speaking", "🎯", f"Work on {label.lower()}",
                    f"{label} is your weakest skill: {avgs[weak]:.0f}% across your last {len(recent)} recordings.",
                    drill, href, 100 - avgs[weak]))
    if len(speech) >= 6:
        before, after = mean(s["confidence"] for s in speech[-6:-3]), mean(s["confidence"] for s in speech[-3:])
        if after - before >= 5:
            recs.append(Recommendation("trend-up", "speaking", "📈", "Your confidence is rising",
                                       f"Up from {before:.0f}% to {after:.0f}% over your last six recordings.",
                                       "Keep the streak: one short recording a day.", "/app/speech", 30))
        elif before - after >= 5:
            recs.append(Recommendation("trend-down", "speaking", "📉", "Your confidence slipped",
                                       f"Down from {before:.0f}% to {after:.0f}% over your last six recordings.",
                                       "Re-do a topic you know well to rebuild momentum.", "/app/speech", 60))
    return recs


def interview_recs(interviews: list[dict], now: datetime) -> list[Recommendation]:
    """interviews: [{question_id, question, readiness, at}] — spaced repetition over questions."""
    recs = []
    by_q: dict[str, dict] = {}
    for iv in interviews:
        q = by_q.setdefault(iv["question_id"], {"question": iv["question"], "best": 0.0, "last": iv["at"]})
        q["best"], q["last"] = max(q["best"], iv["readiness"]), max(q["last"], iv["at"])
    due = [(qid, q) for qid, q in by_q.items() if q["best"] < 75 and now - q["last"] >= timedelta(hours=20)]
    for qid, q in sorted(due, key=lambda kv: kv[1]["best"])[:2]:
        recs.append(Recommendation(
            f"iv-repeat-{qid}", "interview", "🔁", f"Re-practise: “{q['question']}”",
            f"Your best readiness on this question is {q['best']:.0f}% — practising it again a day later "
            "makes the improvement stick.", "Answer it again using the STAR / PREP structure from the hints.",
            f"/app/interview?q={qid}", 80 - q["best"] / 2))
    untried = [q for q in CORE_QUESTIONS if q not in by_q]
    if untried:
        recs.append(Recommendation(
            "iv-next", "interview", "💼", "Practise a core interview question",
            f"You have practised {len(CORE_QUESTIONS) - len(untried)} of the {len(CORE_QUESTIONS)} questions asked "
            "in almost every interview.", "Start with “Tell me about yourself” if you haven't — it sets the tone.",
            f"/app/interview?q={untried[0]}", 55 if by_q else 65))
    return recs


def variety_recs(conversation_types: set[str]) -> list[Recommendation]:
    missing = [k for k in CONVERSATION_TYPES if k not in conversation_types]
    if not conversation_types or not missing:
        return []
    k = missing[0]
    return [Recommendation(
        f"variety-{k}", "variety", "🗨️", f"Try a {CONVERSATION_TYPES[k].lower()} conversation",
        f"You have practised {len(conversation_types)} conversation type(s); real situations vary.",
        "Each type scores fluency, confidence, interaction and voice differently.", "/app/conversation", 25)]


def recommend(focus: list[dict], speech: list[dict], interviews: list[dict], conversation_types: set[str],
              now: datetime | None = None, limit: int = 6) -> list[dict]:
    """All recommendations, highest expected benefit first."""
    now = now or datetime.now(timezone.utc)
    recs = (focus_recs(focus) + wellbeing_recs(focus) + speaking_recs(speech)
            + interview_recs(interviews, now) + variety_recs(conversation_types))
    if not focus:
        recs.append(Recommendation("start-focus", "focus", "🎥", "Do your first focus session",
                                   "No focus sessions yet — the recommendations get personal after a few.",
                                   "Start a 25-minute session with the camera on.", "/app/focus", 70))
    if not speech:
        recs.append(Recommendation("start-speech", "speaking", "🗣️", "Record your first speech",
                                   "No recordings yet.", "Talk for 60 seconds about a project you are proud of.",
                                   "/app/speech", 60))
    recs.sort(key=lambda r: -r.priority)
    return [{**asdict(r), "priority": round(r.priority, 1)} for r in recs[:limit]]
