"""Presence AI as an MCP (Model Context Protocol) server.

Lets AI assistants (Claude Desktop, Claude Code, any MCP client) use Presence AI's engines and read
platform data as tools:

    NLP        analyze_text, analyze_conversation
    Speech     coach_speech_file, confident_rewrite
    ML         predict_fatigue, fatigue_model_card
    Data       platform_stats, user_overview, list_focus_sessions, speech_history, list_rooms, room_messages,
               room_insights, leaderboard
    Coaching   recommendations, ask_coach, interview_questions, interview_guide

Two ways to run it:
    stdio (local):  python -m app.mcp_server            <- add to Claude Desktop / Claude Code
    HTTP (remote):  mounted by the FastAPI app at /mcp when MCP_API_KEY is set
                    (clients send  Authorization: Bearer <MCP_API_KEY>)
"""
import json
import os
from datetime import datetime, timezone

import app.native_preload  # noqa: F401,I001  (must come before anything that loads scikit-learn)
import anyio
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import func, select

from app.database import SessionLocal, init_db
from app.models import AttentionSession, Message, Room, SpeechSession, User
from app.services import nlp_service

INSTRUCTIONS = """Presence AI analyses attention, speech confidence, conversations and fatigue.
Use analyze_text / analyze_conversation for wording, sentiment and confidence; coach_speech_file for a
recording on the server's disk; predict_fatigue for a focus session's fatigue risk; the data tools to look
up users, focus sessions and chat rooms; recommendations / ask_coach for personal coaching and
interview_questions / interview_guide for interview preparation. Scores are 0-100 unless stated otherwise."""

mcp = FastMCP(
    "Presence AI",
    instructions=INSTRUCTIONS,
    stateless_http=True,
    json_response=True,
    # Authentication is done with MCP_API_KEY (see http_app); the public Host header behind Nginx is a
    # real domain, so the localhost-only DNS-rebinding check is turned off.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)

# Reading audio files from the server's disk only makes sense for a local (stdio) client.
ALLOW_FILES = os.getenv("MCP_ALLOW_FILES", "true").lower() in {"1", "true", "yes"}


def _iso(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=dt.tzinfo or timezone.utc).isoformat(timespec="seconds") if dt else None


def _user(db, username: str) -> User:
    user = db.scalar(select(User).where((User.username == username) | (User.email == username.lower())))
    if not user:
        raise ValueError(f"No user named {username!r}")
    return user


def _room(db, room: str) -> Room:
    found = db.scalar(select(Room).where(Room.name == room))
    if not found and room.isdigit():
        found = db.get(Room, int(room))
    if not found:
        raise ValueError(f"No room named {room!r}")
    return found


# ===================================================================== NLP
@mcp.tool()
def analyze_text(text: str) -> dict:
    """Sentiment, toxicity, keywords, hedging vs. assertive phrasing, a 0-100 wording-confidence score
    and a short summary for any English text."""
    result = nlp_service.analyze_text(text)
    result["sentiment_label"], result["sentiment_score"] = nlp_service.analyze_sentiment(text)
    return result


@mcp.tool()
def analyze_conversation(messages: list[str], speakers: list[str] | None = None) -> dict:
    """Analyse a whole conversation: sentiment mix, toxic messages, top keywords, an extractive summary and
    per-speaker wording confidence. `speakers[i]` is who wrote `messages[i]` (optional)."""
    speakers = speakers or ["speaker"] * len(messages)
    if len(speakers) != len(messages):
        raise ValueError("speakers must have the same length as messages")
    rows = []
    for who, text in zip(speakers, messages):
        nlp = nlp_service.analyze_message(text)
        rows.append({"username": who, "content": text, "sentiment_label": nlp["sentiment_label"],
                     "is_toxic": nlp["is_toxic"], "sender_focus": None})
    return nlp_service.conversation_insights(rows)


# ===================================================================== speech
@mcp.tool()
async def coach_speech_file(path: str, passage: str | None = None, eye_contact: float | None = None) -> dict:
    """Speech-coach a recording (wav/mp3/m4a/ogg/webm) stored on the server: transcript, words per minute,
    filler words, pauses, pronunciation clarity, pitch variety, a 0-100 confidence score, prioritised tips and
    a more confident rewrite. Give `passage` if the speaker was reading a known text (pronunciation check)."""
    if not ALLOW_FILES:
        raise ValueError("File access is disabled on this server (MCP_ALLOW_FILES=false)")
    from speech.analyzer import analyze
    from speech.audio import decode_audio

    with open(path, "rb") as fh:
        audio = decode_audio(fh.read())
    report = await anyio.to_thread.run_sync(lambda: analyze(audio, eye_contact=eye_contact, passage=passage))
    if report.get("error"):
        raise ValueError(report["error"])
    report.pop("words", None)  # per-word timings are bulky; the transcript is included
    return report


@mcp.tool()
def confident_rewrite(text: str) -> dict:
    """Rewrite text without filler words and hedges ("um", "I think", "maybe", "sort of"...) so it sounds
    confident, and report what was removed."""
    from speech.analyzer import confident_rewrite as rewrite

    analysis = nlp_service.analyze_text(text)
    return {"rewrite": rewrite(text), "hedges_removed": analysis["hedges"], "confidence_before": analysis["confidence"],
            "confidence_after": nlp_service.analyze_text(rewrite(text) or ".")["confidence"]}


# ===================================================================== machine learning
@mcp.tool()
def predict_fatigue(duration_min: float, hour: int, focus_pct: float, distracted_pct: float, drowsy_pct: float,
                    no_face_pct: float = 5, blinks_per_min: float = 17, yawns_per_10min: float = 0.5,
                    avg_ear: float = 0.29) -> dict:
    """Predict fatigue risk (low / medium / high) for a focus session with the trained scikit-learn model.
    Returns class probabilities, a 0-100 risk score, the factors that drove it and advice."""
    from ml import predict as fatigue_model

    return fatigue_model.predict(dict(
        duration_min=duration_min, hour=hour, focus_pct=focus_pct, distracted_pct=distracted_pct,
        drowsy_pct=drowsy_pct, no_face_pct=no_face_pct, blinks_per_min=blinks_per_min,
        yawns_per_10min=yawns_per_10min, avg_ear=avg_ear))


@mcp.tool()
def fatigue_model_card() -> dict:
    """The fatigue model's card: algorithm chosen by cross-validation, test accuracy / F1, confusion matrix,
    feature importance, training data size and limitations."""
    from ml import predict as fatigue_model

    return fatigue_model.load()[1]


@mcp.resource("presence://model-card")
def model_card_resource() -> str:
    """Fatigue model card (JSON)."""
    return json.dumps(fatigue_model_card(), indent=2)


# ===================================================================== platform data (read-only)
@mcp.tool()
def platform_stats() -> dict:
    """Totals across Presence AI: users, focus sessions, minutes tracked, average focus, speech sessions,
    rooms and chat messages."""
    with SessionLocal() as db:
        n_sessions, seconds, avg_focus = db.execute(select(
            func.count(AttentionSession.id), func.coalesce(func.sum(AttentionSession.duration_sec), 0),
            func.coalesce(func.avg(AttentionSession.focus_pct), 0))).one()
        n_speech, avg_conf = db.execute(select(func.count(SpeechSession.id),
                                               func.coalesce(func.avg(SpeechSession.confidence), 0))).one()
        return {
            "users": db.scalar(select(func.count(User.id))),
            "focus_sessions": n_sessions,
            "minutes_tracked": round(seconds / 60, 1),
            "avg_focus_pct": round(avg_focus, 1),
            "speech_sessions": n_speech,
            "avg_speech_confidence": round(avg_conf, 1),
            "rooms": db.scalar(select(func.count(Room.id))),
            "messages": db.scalar(select(func.count(Message.id))),
        }


@mcp.tool()
def user_overview(username: str) -> dict:
    """Profile and progress for one user (username or email): focus averages, latest fatigue risk,
    speaking-confidence trend and chat activity."""
    from ml import predict as fatigue_model
    from ml.features import from_session

    with SessionLocal() as db:
        u = _user(db, username)
        sessions = list(db.scalars(select(AttentionSession).where(AttentionSession.user_id == u.id)
                                   .order_by(AttentionSession.started_at)))
        speech = list(db.scalars(select(SpeechSession).where(SpeechSession.user_id == u.id)
                                 .order_by(SpeechSession.created_at)))
        messages = db.scalar(select(func.count(Message.id)).where(Message.user_id == u.id))
        avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None  # noqa: E731
        latest_fatigue = None
        if sessions:
            s = sessions[-1]
            feats = from_session({c: getattr(s, c) for c in ("duration_sec", "focus_pct", "distracted_pct",
                                  "drowsy_pct", "no_face_pct", "total_blinks", "total_yawns", "avg_ear")}
                                 | {"started_at": s.started_at})
            p = fatigue_model.predict(feats)
            latest_fatigue = {"risk": p["risk"], "risk_score": p["risk_score"], "advice": p["advice"]}
        return {
            "username": u.username, "full_name": u.full_name, "member_since": _iso(u.created_at),
            "verified": {"email": u.email_verified, "phone": u.phone_verified},
            "focus": {"sessions": len(sessions), "minutes": round(sum(s.duration_sec for s in sessions) / 60, 1),
                      "avg_focus_pct": avg([s.focus_pct for s in sessions]),
                      "avg_distracted_pct": avg([s.distracted_pct for s in sessions]),
                      "avg_drowsy_pct": avg([s.drowsy_pct for s in sessions]),
                      "latest_fatigue": latest_fatigue},
            "speaking": {"sessions": len(speech), "avg_confidence": avg([s.confidence for s in speech]),
                         "first_confidence": speech[0].confidence if speech else None,
                         "latest_confidence": speech[-1].confidence if speech else None,
                         "latest_wpm": speech[-1].wpm if speech else None},
            "chat_messages": messages,
        }


@mcp.tool()
def list_focus_sessions(username: str, limit: int = 10) -> list[dict]:
    """A user's most recent focus sessions (newest first) with focus / distracted / drowsy percentages,
    blinks, yawns and their own fatigue rating if given."""
    with SessionLocal() as db:
        u = _user(db, username)
        rows = db.scalars(select(AttentionSession).where(AttentionSession.user_id == u.id)
                          .order_by(AttentionSession.started_at.desc()).limit(min(limit, 100)))
        return [{"id": s.id, "started_at": _iso(s.started_at), "minutes": round(s.duration_sec / 60, 1),
                 "focus_pct": s.focus_pct, "distracted_pct": s.distracted_pct, "drowsy_pct": s.drowsy_pct,
                 "blinks": s.total_blinks, "yawns": s.total_yawns,
                 "self_fatigue": {0: "fresh", 1: "a bit tired", 2: "exhausted"}.get(s.self_fatigue)}
                for s in rows]


@mcp.tool()
def list_rooms() -> list[dict]:
    """All chat rooms with their message counts."""
    with SessionLocal() as db:
        rows = db.execute(select(Room.id, Room.name, Room.description, func.count(Message.id))
                          .outerjoin(Message, Message.room_id == Room.id).group_by(Room.id).order_by(Room.id)).all()
        return [{"id": i, "name": n, "description": d, "messages": c} for i, n, d, c in rows]


@mcp.tool()
def room_messages(room: str, limit: int = 30) -> list[dict]:
    """The latest messages in a chat room (by name or id), oldest first, with each message's sentiment,
    toxicity flag and the sender's live focus at the time."""
    with SessionLocal() as db:
        r = _room(db, room)
        rows = list(db.scalars(select(Message).where(Message.room_id == r.id)
                               .order_by(Message.created_at.desc()).limit(min(limit, 200))))
        return [{"user": m.user.username, "text": m.content, "at": _iso(m.created_at), "sentiment": m.sentiment_label,
                 "toxic": m.is_toxic, "sender_focus": m.sender_focus} for m in reversed(rows)]


@mcp.tool()
def room_insights(room: str) -> dict:
    """NLP insights for a whole room: sentiment distribution, toxic message count, keywords, summary, average
    focus while chatting and per-user wording confidence."""
    with SessionLocal() as db:
        r = _room(db, room)
        rows = db.scalars(select(Message).where(Message.room_id == r.id).order_by(Message.created_at))
        return {"room": r.name, **nlp_service.conversation_insights(
            [{"username": m.user.username, "content": m.content, "sentiment_label": m.sentiment_label,
              "is_toxic": m.is_toxic, "sender_focus": m.sender_focus} for m in rows])}


@mcp.tool()
def leaderboard(limit: int = 10) -> list[dict]:
    """Users ranked by average focus % across their saved sessions."""
    with SessionLocal() as db:
        rows = db.execute(
            select(User.username, func.avg(AttentionSession.focus_pct), func.sum(AttentionSession.duration_sec),
                   func.count(AttentionSession.id))
            .join(AttentionSession, AttentionSession.user_id == User.id).group_by(User.id)
            .order_by(func.avg(AttentionSession.focus_pct).desc()).limit(min(limit, 50))).all()
        return [{"rank": i + 1, "username": u, "avg_focus_pct": round(f, 1), "minutes": round(d / 60, 1), "sessions": n}
                for i, (u, f, d, n) in enumerate(rows)]


# ===================================================================== coaching & interview prep
@mcp.tool()
def recommendations(username: str) -> list[dict]:
    """What a user should practise next, ranked by expected benefit — each with the data behind it (best focus
    time, session length, weakest speaking skill, interview questions to re-practise, drowsiness)."""
    from app.routers.coach_routes import build_context

    with SessionLocal() as db:
        return build_context(db, _user(db, username))["recommendations"]


@mcp.tool()
def ask_coach(username: str, question: str) -> dict:
    """Ask the AI coach a question on a user's behalf (their progress, interviews, speaking, focus).
    Answers with Claude when the server has ANTHROPIC_API_KEY, otherwise with the built-in coach."""
    from app.routers.coach_routes import build_context
    from coach import assistant

    with SessionLocal() as db:
        return assistant.answer(question, build_context(db, _user(db, username)))


@mcp.tool()
def speech_history(username: str, limit: int = 10) -> list[dict]:
    """A user's recent recordings (newest first): mode (free / read / conversation / interview), prompt,
    confidence and — for mock interviews — readiness."""
    with SessionLocal() as db:
        u = _user(db, username)
        rows = db.scalars(select(SpeechSession).where(SpeechSession.user_id == u.id)
                          .order_by(SpeechSession.created_at.desc()).limit(min(limit, 100)))
        out = []
        for s in rows:
            try:
                readiness = (json.loads(s.report or "{}").get("interview") or {}).get("readiness")
            except ValueError:
                readiness = None
            out.append({"id": s.id, "at": _iso(s.created_at), "mode": s.mode, "prompt": s.prompt[:200],
                        "confidence": s.confidence, "wpm": s.wpm, "fillers": s.fillers, "readiness": readiness})
        return out


@mcp.tool()
def interview_questions(field: str = "general") -> list[dict]:
    """Interview question bank for a job field (general, software, data, product, design, marketing, sales,
    finance, hr, healthcare, teaching, customer_service, engineering, management, hospitality): each question
    with what interviewers look for, the answer structure, an outline and pitfalls."""
    from interview.knowledge import FIELDS, all_questions

    if field not in FIELDS:
        raise ValueError(f"Unknown field {field!r}; use one of: {', '.join(FIELDS)}")
    return [{k: q[k] for k in ("id", "category", "q", "framework", "looks_for", "outline", "pitfalls")}
            for q in all_questions(field)]


@mcp.tool()
def interview_guide(topic: str = "") -> list[dict]:
    """The interview preparation guide (getting the interview, first impression, dressing, body language,
    eye contact, voice, vocabulary, answering, tough questions, video setup, follow-up). Optional topic filter."""
    from interview.knowledge import GUIDE

    t = topic.lower().strip()
    return [s for s in GUIDE if not t or t in (s["title"] + " " + s["intro"] + " ".join(s["tips"])).lower()]


# ===================================================================== prompts
@mcp.prompt()
def weekly_focus_review(username: str) -> str:
    """Ask the assistant for a coaching review of a user's focus and speaking progress."""
    return (f"Use user_overview and list_focus_sessions for {username!r}. Write a short, encouraging weekly review: "
            "what improved, the main focus or fatigue pattern (time of day, session length), their speaking-"
            "confidence trend, and three concrete actions for next week.")


@mcp.prompt()
def improve_my_message(text: str) -> str:
    """Make a message sound more confident and clear."""
    return (f"Call analyze_text and confident_rewrite on this message, explain in two sentences what made it sound "
            f"unsure, then give an improved version that keeps the meaning:\n\n{text}")


# ===================================================================== HTTP mounting
class _ApiKeyGuard:
    """ASGI middleware: require `Authorization: Bearer <MCP_API_KEY>` for the HTTP MCP endpoint."""

    def __init__(self, app, key: str):
        self.app, self.key = app, f"Bearer {key}".encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and dict(scope["headers"]).get(b"authorization") != self.key:
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json"), (b"www-authenticate", b"Bearer")]})
            await send({"type": "http.response.body", "body": b'{"detail":"Invalid or missing MCP API key"}'})
            return
        await self.app(scope, receive, send)


def http_app():
    """Streamable-HTTP MCP app (serves /mcp) or None when MCP_API_KEY is not configured."""
    key = os.getenv("MCP_API_KEY", "").strip()
    if not key:
        return None
    return _ApiKeyGuard(mcp.streamable_http_app(), key)


if __name__ == "__main__":
    init_db()
    mcp.run()  # stdio
