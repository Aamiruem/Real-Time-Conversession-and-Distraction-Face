import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AttentionSession, Message, SpeechSession, User

router = APIRouter(prefix="/analytics", tags=["analytics"])

GOAL_FOCUS_MINUTES = 30  # daily goals shown on the dashboard
GOAL_PRACTICE = 2
SKILLS = {"fluency": "Fluency", "pace": "Pace", "clarity": "Clarity", "voice": "Voice", "assertiveness": "Confidence",
          "eye_contact": "Eye contact"}
SKILL_PAGE = {"fluency": "/app/speech", "pace": "/app/speech", "clarity": "/app/speech", "voice": "/app/conversation",
              "assertiveness": "/app/conversation", "eye_contact": "/app/focus"}


@router.get("/me")
def my_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.execute(
        select(
            func.count(AttentionSession.id),
            func.coalesce(func.sum(AttentionSession.duration_sec), 0),
            func.coalesce(func.avg(AttentionSession.focus_pct), 0),
            func.coalesce(func.avg(AttentionSession.distracted_pct), 0),
            func.coalesce(func.avg(AttentionSession.drowsy_pct), 0),
            func.coalesce(func.sum(AttentionSession.total_yawns), 0),
        ).where(AttentionSession.user_id == user.id)
    ).one()
    msgs = db.scalar(select(func.count(Message.id)).where(Message.user_id == user.id))
    speech_n, speech_conf = db.execute(
        select(func.count(SpeechSession.id), func.coalesce(func.avg(SpeechSession.confidence), 0))
        .where(SpeechSession.user_id == user.id)
    ).one()
    return {
        "sessions": s[0],
        "total_minutes": round(s[1] / 60, 1),
        "avg_focus_pct": round(s[2], 1),
        "avg_distracted_pct": round(s[3], 1),
        "avg_drowsy_pct": round(s[4], 1),
        "total_yawns": s[5],
        "messages_sent": msgs,
        "speech_sessions": speech_n,
        "avg_speech_confidence": round(speech_conf, 1),
    }


@router.get("/leaderboard")
def leaderboard(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(User.username, func.avg(AttentionSession.focus_pct), func.sum(AttentionSession.duration_sec))
        .join(AttentionSession, AttentionSession.user_id == User.id)
        .group_by(User.id)
        .order_by(func.avg(AttentionSession.focus_pct).desc())
        .limit(10)
    ).all()
    return [{"username": u, "avg_focus_pct": round(f, 1), "minutes": round(d / 60, 1)} for u, f, d in rows]


def _utc(dt: datetime) -> datetime:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def _day(dt: datetime) -> date:
    return _utc(dt).date()


def _label(dt: datetime) -> str:
    return _day(dt).strftime("%b %d")


def _report(row: SpeechSession) -> dict:
    try:
        return json.loads(row.report or "{}")
    except ValueError:
        return {}


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything the home dashboard shows, in one call: KPIs, goals, trends, skills, activity and next steps."""
    from app.routers.ai_routes import my_fatigue

    focus = db.scalars(select(AttentionSession).where(AttentionSession.user_id == user.id)
                       .order_by(AttentionSession.started_at)).all()
    speech = db.scalars(select(SpeechSession).where(SpeechSession.user_id == user.id)
                        .order_by(SpeechSession.created_at)).all()
    msg_times = db.scalars(select(Message.created_at).where(Message.user_id == user.id)).all()
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]

    # ---- activity per day (last 14 days) and the current streak of active days
    per_day = {d: {"focus_minutes": 0.0, "practice": 0, "messages": 0} for d in days}
    active = set()
    for s in focus:
        d = _day(s.started_at)
        active.add(d)
        if d in per_day:
            per_day[d]["focus_minutes"] += s.duration_sec / 60
    for s in speech:
        d = _day(s.created_at)
        active.add(d)
        if d in per_day:
            per_day[d]["practice"] += 1
    for t in msg_times:
        d = _day(t)
        active.add(d)
        if d in per_day:
            per_day[d]["messages"] += 1
    streak, d = 0, today if today in active else today - timedelta(days=1)
    while d in active:
        streak, d = streak + 1, d - timedelta(days=1)
    week = sum(v["focus_minutes"] for k, v in per_day.items() if k > today - timedelta(days=7))
    last_week = sum(v["focus_minutes"] for k, v in per_day.items() if k <= today - timedelta(days=7))

    # ---- focus
    n = len(focus)

    def avg(attr: str) -> float:
        return round(sum(getattr(s, attr) for s in focus) / n, 1) if n else 0.0

    focus_trend = [{"label": _label(s.started_at), "focus": round(s.focus_pct, 1),
                    "distracted": round(s.distracted_pct, 1), "drowsy": round(s.drowsy_pct, 1),
                    "minutes": round(s.duration_sec / 60, 1)} for s in focus[-12:]]

    # ---- speaking: confidence trend, skill averages, interview readiness, latest conversation
    speech_trend = [{"label": _label(s.created_at), "confidence": round(s.confidence, 1), "mode": s.mode}
                    for s in speech[-12:]]
    skills = {}
    for k in SKILLS:
        vals = [getattr(s, k) for s in speech if getattr(s, k) is not None]
        if vals:
            skills[k] = round(sum(vals) / len(vals), 1)
    interviews, latest_conv = [], None
    for s in speech:
        rep = _report(s) if s.mode in ("interview", "conversation") else {}
        iv = rep.get("interview")
        if iv:
            sec = {x["key"]: x["score"] for x in iv["sections"]}
            interviews.append({"label": _label(s.created_at), "readiness": iv["readiness"],
                               "content": sec.get("content"), "delivery": sec.get("delivery"),
                               "presence": sec.get("presence"), "question": iv["question"]["q"]})
        if rep.get("conversation"):
            c = rep["conversation"]
            latest_conv = {"type_label": c["type_label"], "overall": c["overall"],
                           "areas": [{"label": a["label"], "score": a["score"]} for a in c["areas"]]}

    # ---- recent activity feed
    recent = [{"kind": "focus", "icon": "🎥", "title": f"Focus session · {s.duration_sec / 60:.0f} min",
               "score": round(s.focus_pct), "score_label": "focus", "when": s.started_at.isoformat(),
               "href": "/app/focus"} for s in focus[-8:]]
    kinds = {"interview": ("💼", "Mock interview", "/app/interview"),
             "conversation": ("🗨️", "Conversation practice", "/app/conversation")}
    for s in speech[-8:]:
        icon, title, href = kinds.get(s.mode, ("🗣️", "Speech practice", "/app/speech"))
        iv = _report(s).get("interview") if s.mode == "interview" else None
        recent.append({"kind": s.mode, "icon": icon, "title": title, "detail": s.prompt[:80],
                       "score": round(iv["readiness"] if iv else s.confidence),
                       "score_label": "readiness" if iv else "confidence", "when": s.created_at.isoformat(),
                       "href": href})
    recent.sort(key=lambda r: r["when"], reverse=True)

    # ---- leaderboard rank (by average focus)
    ranking = db.scalars(select(AttentionSession.user_id).group_by(AttentionSession.user_id)
                         .order_by(func.avg(AttentionSession.focus_pct).desc())).all()
    rank = ranking.index(user.id) + 1 if user.id in ranking else None

    try:
        fatigue = my_fatigue(user, db)
    except Exception:  # model artifact missing — the dashboard still works without it
        fatigue = None

    # ---- personalised next steps
    t = per_day[today]
    steps = []
    if fatigue and fatigue.get("risk") == "high":
        steps.append({"icon": "😴", "text": "High fatigue risk — take a 10-minute break first", "href": "/app/focus"})
    if t["focus_minutes"] < GOAL_FOCUS_MINUTES:
        steps.append({"icon": "🎥", "text": f"Do a focus session — {GOAL_FOCUS_MINUTES - t['focus_minutes']:.0f} "
                                           "min left for today's goal", "href": "/app/focus"})
    if skills:
        weak = min(skills, key=skills.get)
        steps.append({"icon": "🎯", "text": f"Your weakest speaking skill is {SKILLS[weak].lower()} "
                                           f"({skills[weak]:.0f}%) — practise it", "href": SKILL_PAGE[weak]})
    else:
        steps.append({"icon": "🗣️", "text": "Record your first speech to get a confidence score",
                      "href": "/app/speech"})
    if not interviews:
        steps.append({"icon": "💼", "text": "Try a mock interview for your job field", "href": "/app/interview"})
    elif interviews[-1]["readiness"] < 80:
        steps.append({"icon": "💼", "text": f"Interview readiness is {interviews[-1]['readiness']:.0f}% — "
                                           "practise another answer", "href": "/app/interview"})

    conf = [s.confidence for s in speech]
    return {
        "kpis": {
            "focus_sessions": n, "focus_minutes": round(sum(s.duration_sec for s in focus) / 60, 1),
            "avg_focus_pct": avg("focus_pct"), "avg_distracted_pct": avg("distracted_pct"),
            "practice_sessions": len(speech), "avg_confidence": round(sum(conf) / len(conf), 1) if conf else 0.0,
            "interview_answers": len(interviews),
            "latest_readiness": interviews[-1]["readiness"] if interviews else None,
            "best_readiness": max((i["readiness"] for i in interviews), default=None),
            "messages_sent": len(msg_times), "streak_days": streak,
            "week_minutes": round(week, 1), "last_week_minutes": round(last_week, 1),
            "rank": rank, "ranked_users": len(ranking),
        },
        "today": {"focus_minutes": round(t["focus_minutes"], 1), "practice": t["practice"],
                  "goal_focus_minutes": GOAL_FOCUS_MINUTES, "goal_practice": GOAL_PRACTICE},
        "activity": [{"date": d.isoformat(), "label": d.strftime("%a %d"),
                      "focus_minutes": round(per_day[d]["focus_minutes"], 1), "practice": per_day[d]["practice"],
                      "messages": per_day[d]["messages"]} for d in days],
        "state_split": {"Focused": avg("focus_pct"), "Distracted": avg("distracted_pct"),
                        "Drowsy": avg("drowsy_pct"), "No Face": avg("no_face_pct")},
        "focus_trend": focus_trend,
        # when each focus session started (UTC) — the browser groups them by the viewer's local time of day
        "focus_times": [{"at": _utc(s.started_at).isoformat(), "minutes": round(s.duration_sec / 60, 1),
                         "focus": round(s.focus_pct, 1)} for s in focus[-200:]],
        "practice_mix": {"focus": n, "conversation": sum(s.mode == "conversation" for s in speech),
                         "interview": sum(s.mode == "interview" for s in speech),
                         "speech": sum(s.mode not in ("conversation", "interview") for s in speech)},
        "speech_trend": speech_trend,
        "skills": [{"key": k, "label": SKILLS[k], "score": v} for k, v in skills.items()],
        "interview_trend": interviews[-10:],
        "latest_conversation": latest_conv,
        "recent": recent[:8],
        "fatigue": fatigue,
        "next_steps": steps[:4],
    }
