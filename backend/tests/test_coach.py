from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import anthropic
import pytest

from coach import assistant
from coach.recommend import recommend

NOW = datetime(2026, 10, 28, 15, tzinfo=timezone.utc)


def _focus(hour, minutes, focus, drowsy=2, days_ago=0):
    return {"started_at": (NOW - timedelta(days=days_ago)).replace(hour=hour), "duration_sec": minutes * 60,
            "focus_pct": focus, "drowsy_pct": drowsy}


def _speech(**scores):
    base = {"confidence": 70, "mode": "free", "fluency": 85, "pace": 90, "clarity": 88, "voice": 86,
            "assertiveness": 87, "eye_contact": None}
    return {**base, **scores}


def test_focus_time_and_session_length():
    focus = [_focus(9, 25, 85), _focus(10, 20, 82), _focus(20, 25, 60), _focus(21, 60, 50), _focus(22, 55, 48),
             _focus(9, 55, 62)]
    by_id = {r["id"]: r for r in recommend(focus, [], [], set(), NOW, limit=10)}
    assert "morning" in by_id["focus-time"]["title"]
    assert by_id["session-length"]["title"].startswith("Keep focus blocks to")


def test_skill_gap_drowsiness_and_ranking():
    focus = [_focus(9, 25, 70, drowsy=15, days_ago=d) for d in range(3)]
    recs = recommend(focus, [_speech(voice=40), _speech(voice=50)], [], set(), NOW, limit=10)
    ids = [r["id"] for r in recs]
    assert "skill-voice" in ids and "drowsiness" in ids
    assert [r["priority"] for r in recs] == sorted((r["priority"] for r in recs), reverse=True)
    assert "45%" in next(r for r in recs if r["id"] == "skill-voice")["reason"]


def test_interview_spaced_repetition():
    iv = lambda qid, score, hours: {"question_id": qid, "question": qid, "readiness": score,  # noqa: E731
                                    "at": NOW - timedelta(hours=hours)}
    ids = {r["id"] for r in recommend([], [], [iv("g-about", 60, 30), iv("g-weakness", 60, 2),
                                              iv("g-why-hire", 90, 30)], set(), NOW, limit=10)}
    assert "iv-repeat-g-about" in ids          # low score, a day later -> practise again
    assert "iv-repeat-g-weakness" not in ids   # practised 2 h ago -> not yet
    assert "iv-repeat-g-why-hire" not in ids   # already strong
    assert "iv-next" in ids                    # core questions still untried


CTX = {"name": "Asha", "stats": {"focus_sessions": 4, "avg_focus_pct": 78.0, "streak_days": 3, "practice_sessions": 2,
                                 "avg_confidence": 71.0, "weakest_skill": "voice modulation (52%)",
                                 "latest_readiness": 74.0},
       "recommendations": [{"title": "Work on voice modulation", "reason": "52%", "action": "Storytelling practice."}]}


def test_builtin_coach(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    progress = assistant.answer("How am I doing this week?", CTX)
    assert progress["engine"] == "built-in" and "78.0%" in progress["answer"] and "voice modulation" in progress["answer"]
    how = assistant.answer("How do I stop saying um and filler words?", CTX)
    assert "silent" in how["answer"].lower() or "filler" in how["answer"].lower()
    assert how["follow_ups"] and "Next for you" in how["answer"]


class _FakeMessages:
    def __init__(self, result):
        self.result, self.kwargs = result, None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.mark.parametrize("outcome, engine", [("ok", "claude"), ("refusal", "built-in"), ("error", "built-in")])
def test_claude_coach_and_fallback(monkeypatch, outcome, engine):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    if outcome == "error":
        result = anthropic.APIConnectionError(request=SimpleNamespace(method="POST", url="https://x"))
    else:
        result = SimpleNamespace(stop_reason="refusal" if outcome == "refusal" else "end_turn",
                                 content=[SimpleNamespace(type="text", text="Practise one STAR story today.")])
    fake = _FakeMessages(result)
    monkeypatch.setattr(anthropic, "Anthropic", lambda **_: SimpleNamespace(beta=SimpleNamespace(messages=fake)))
    out = assistant.answer("What should I practise?", CTX, [{"role": "assistant", "content": "hi"},
                                                             {"role": "user", "content": "hello"}])
    assert out["engine"] == engine
    if outcome == "ok":
        assert out["answer"] == "Practise one STAR story today."
        sent = fake.kwargs
        assert sent["model"] == "claude-opus-5-5" and sent["fallbacks"] == "default"
        assert sent["messages"][0]["role"] == "user"  # leading assistant turn dropped
        assert "Asha" in sent["messages"][-1]["content"]


def test_coach_api(client, verified_user, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    headers, _ = verified_user
    recs = client.get("/recommendations", headers=headers).json()
    assert {r["id"] for r in recs} >= {"start-focus", "start-speech"}
    ans = client.post("/coach/ask", headers=headers, json={"question": "How do I answer tell me about yourself?"}).json()
    assert ans["engine"] == "built-in" and ans["answer"]
    assert client.get("/coach/insight", headers=headers).json()["answer"]
    assert client.post("/coach/ask", headers=headers, json={"question": ""}).status_code == 422


def test_time_of_day_advice_uses_the_viewers_time_zone(client, verified_user):
    """14:00 UTC is 19:30 in India: with tz=330 the best focus time is the evening, not the afternoon."""
    headers, _ = verified_user
    day = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0) - timedelta(days=1)
    for i in range(3):  # strong sessions at 14:00 UTC, weak ones at 03:00 UTC
        for hour, focus in ((14, 92), (3, 55)):
            client.post("/attention/sessions", headers=headers, json={
                "started_at": (day.replace(hour=hour) - timedelta(days=i)).isoformat(), "duration_sec": 1500,
                "focus_pct": focus, "distracted_pct": 100 - focus, "drowsy_pct": 0})
    titles = lambda tz: [r["title"] for r in client.get(f"/recommendations?tz={tz}", headers=headers).json()]  # noqa: E731
    assert "Schedule deep work in the afternoon" in titles(0)
    assert "Schedule deep work in the evening" in titles(330)
    assert client.get("/recommendations?tz=9999", headers=headers).status_code == 422
    r = client.post("/coach/ask", headers=headers, json={"question": "When do I focus best?", "tz": 330})
    assert r.status_code == 200


# ---------- the coach as an agent: Claude can call tools, and every failure lands on the built-in coach ----------

def _tool_call(name, tool_input, block_id="tu_1"):
    return SimpleNamespace(stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", id=block_id, name=name, input=tool_input)])


def _final(text):
    return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


class _ScriptedMessages:
    """Answers each create() with the next scripted response, and remembers what was sent (copied: the list grows)."""

    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def create(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return self.responses.pop(0)


def _use(monkeypatch, fake):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(anthropic, "Anthropic", lambda **_: SimpleNamespace(beta=SimpleNamespace(messages=fake)))


def test_agent_searches_the_guide_then_answers(monkeypatch):
    fake = _ScriptedMessages(_tool_call("search_guide", {"query": "filler words"}), _final("Pause instead of saying um."))
    _use(monkeypatch, fake)
    out = assistant.answer("How do I stop saying um?", CTX)
    assert out["engine"] == "claude" and out["answer"] == "Pause instead of saying um."
    assert out["tools_used"] == ["search_guide"]

    assert [t["name"] for t in fake.calls[0]["tools"]] == ["search_guide"]  # no user data tools without a signed-in user
    assistant_turn, result_turn = fake.calls[1]["messages"][-2:]
    assert assistant_turn["role"] == "assistant"
    assert assistant_turn["content"][0].type == "tool_use"  # the whole response goes back, not just its text
    assert result_turn["role"] == "user"
    result = result_turn["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "tu_1" and "is_error" not in result
    assert "filler" in result["content"].lower() or "silent" in result["content"].lower()


def test_parallel_tool_calls_answer_in_one_message(monkeypatch):
    both = SimpleNamespace(stop_reason="tool_use", content=[
        SimpleNamespace(type="tool_use", id="a", name="search_guide", input={"query": "eye contact"}),
        SimpleNamespace(type="tool_use", id="b", name="search_guide", input={"query": "posture"}),
    ])
    fake = _ScriptedMessages(both, _final("Done."))
    _use(monkeypatch, fake)
    assistant.answer("Tips?", CTX)
    results = fake.calls[1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["a", "b"]


@pytest.mark.parametrize("name, tools", [("no_such_tool", None), ("recent_sessions", {"recent_sessions": lambda **_: 1 / 0})])
def test_a_failing_tool_is_reported_to_claude_not_raised(monkeypatch, name, tools):
    fake = _ScriptedMessages(_tool_call(name, {}), _final("Sorry, I couldn't look that up."))
    _use(monkeypatch, fake)
    out = assistant.answer("Show my sessions", CTX, tools=tools)
    assert out["engine"] == "claude"
    assert fake.calls[1]["messages"][-1]["content"][0]["is_error"] is True


def test_an_endless_tool_loop_falls_back_to_the_built_in_coach(monkeypatch):
    fake = _ScriptedMessages(*[_tool_call("search_guide", {"query": "x"}) for _ in range(assistant.MAX_TOOL_ROUNDS)])
    _use(monkeypatch, fake)
    out = assistant.answer("How do I stop saying um?", CTX)
    assert out["engine"] == "built-in" and out["answer"]
    assert len(fake.calls) == assistant.MAX_TOOL_ROUNDS


def test_a_refusal_after_a_tool_call_falls_back_to_the_built_in_coach(monkeypatch):
    refused = SimpleNamespace(stop_reason="refusal", content=[])
    fake = _ScriptedMessages(_tool_call("search_guide", {"query": "x"}), refused)
    _use(monkeypatch, fake)
    assert assistant.answer("How do I stop saying um?", CTX)["engine"] == "built-in"


def test_dashboard_insight_makes_a_single_call_with_no_tools(monkeypatch):
    fake = _ScriptedMessages(_final("Keep going."))
    _use(monkeypatch, fake)
    assert assistant.insight(CTX)["answer"] == "Keep going."
    assert "tools" not in fake.calls[0]  # it runs on every dashboard load, so it stays one cheap request


def _focus_session(client, headers, started="2026-01-01T09:00:00Z", focus=81):
    return client.post("/attention/sessions", headers=headers, json={
        "started_at": started, "duration_sec": 1200, "focus_pct": focus, "distracted_pct": 15, "drowsy_pct": 4}).json()


def test_agent_tools_only_ever_read_the_signed_in_users_data(client, make_user, monkeypatch):
    mine, _ = make_user()
    other, _ = make_user()
    _focus_session(client, mine, focus=81)
    _focus_session(client, other, focus=33)
    fake = _ScriptedMessages(_tool_call("recent_sessions", {"kind": "focus", "limit": 10}), _final("You focused at 81%."))
    _use(monkeypatch, fake)
    res = client.post("/coach/ask", headers=mine, json={"question": "Show my last sessions"}).json()
    assert res["engine"] == "claude" and res["tools_used"] == ["recent_sessions"]
    assert {t["name"] for t in fake.calls[0]["tools"]} == {"search_guide", "recent_sessions", "fatigue_forecast"}
    sent = fake.calls[1]["messages"][-1]["content"][0]["content"]
    assert '"focus_pct": 81' in sent and "33" not in sent


def test_agent_forecasts_fatigue_from_the_latest_session(client, make_user, monkeypatch):
    headers, _ = make_user()
    _focus_session(client, headers)
    fake = _ScriptedMessages(_tool_call("fatigue_forecast", {}), _final("Your risk looks low."))
    _use(monkeypatch, fake)
    client.post("/coach/ask", headers=headers, json={"question": "Am I tired?"})
    sent = fake.calls[1]["messages"][-1]["content"][0]
    assert "is_error" not in sent and '"risk"' in sent["content"] and "simulated" in sent["content"]


def test_fatigue_forecast_with_no_sessions_says_so(client, make_user, monkeypatch):
    headers, _ = make_user()
    fake = _ScriptedMessages(_tool_call("fatigue_forecast", {}), _final("Do a session first."))
    _use(monkeypatch, fake)
    client.post("/coach/ask", headers=headers, json={"question": "Am I tired?"})
    assert "no focus sessions" in fake.calls[1]["messages"][-1]["content"][0]["content"].lower()
