from datetime import datetime, timezone


def _speech_report(confidence: float, interview: dict | None = None) -> dict:
    rep = {"confidence": confidence, "scores": {"fluency": 80, "pace": 90, "clarity": 70, "voice": 60,
                                                "assertiveness": 85}, "metrics": {"duration_sec": 60, "wpm": 140,
                                                                                  "fillers": 2}}
    if interview:
        rep["interview"] = interview
    return rep


def test_empty_dashboard(client, verified_user):
    headers, _ = verified_user
    d = client.get("/analytics/dashboard", headers=headers).json()
    assert d["kpis"]["focus_sessions"] == 0 and d["kpis"]["streak_days"] == 0
    assert len(d["activity"]) == 14 and d["skills"] == [] and d["recent"] == []
    assert {s["href"] for s in d["next_steps"]} >= {"/app/focus", "/app/speech", "/app/interview"}


def test_dashboard_aggregates_everything(client, verified_user):
    headers, _ = verified_user
    now = datetime.now(timezone.utc).isoformat()
    client.post("/attention/sessions", headers=headers, json={
        "started_at": now, "duration_sec": 1200, "focus_pct": 80, "distracted_pct": 15, "drowsy_pct": 5})
    client.post("/speech/sessions", headers=headers, json={"mode": "free", "report": _speech_report(70)})
    iv = {"readiness": 72.5, "question": {"q": "Tell me about yourself."},
          "sections": [{"key": "content", "score": 80}, {"key": "delivery", "score": 70}]}
    client.post("/speech/sessions", headers=headers, json={"mode": "interview", "report": _speech_report(75, iv)})

    d = client.get("/analytics/dashboard", headers=headers).json()
    k = d["kpis"]
    assert k["focus_sessions"] == 1 and k["focus_minutes"] == 20 and k["avg_focus_pct"] == 80
    assert k["practice_sessions"] == 2 and k["avg_confidence"] == 72.5
    assert k["interview_answers"] == 1 and k["latest_readiness"] == 72.5 and k["streak_days"] == 1
    assert k["rank"] >= 1
    assert d["today"]["focus_minutes"] == 20 and d["today"]["practice"] == 2
    assert d["activity"][-1]["focus_minutes"] == 20
    assert d["interview_trend"][0]["content"] == 80
    assert {s["key"] for s in d["skills"]} == {"fluency", "pace", "clarity", "voice", "assertiveness"}
    assert [r["kind"] for r in d["recent"]].count("interview") == 1 and len(d["recent"]) == 3
    # weakest skill (voice 60) and the sub-80 interview readiness become next steps
    texts = " ".join(s["text"] for s in d["next_steps"])
    assert "voice" in texts and "72%" in texts


def test_health_reports_api_version(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["api_version"] >= 3 and "dashboard" in h["features"]
