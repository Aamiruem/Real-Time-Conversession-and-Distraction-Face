"""The MCP server, exercised through a real MCP client session (in-memory transport)."""
import json

import anyio
import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp_server import mcp

EXPECTED_TOOLS = {
    "analyze_text", "analyze_conversation", "coach_speech_file", "confident_rewrite", "predict_fatigue",
    "fatigue_model_card", "platform_stats", "user_overview", "list_focus_sessions", "list_rooms", "room_messages",
    "room_insights", "leaderboard",
}


def run(coro_fn):
    return anyio.run(coro_fn)


async def _call(session, name, args):
    res = await session.call_tool(name, args)
    assert not res.isError, res.content
    data = res.structuredContent
    return data.get("result", data) if isinstance(data, dict) else json.loads(res.content[0].text)


def test_lists_tools_prompts_resources():
    async def go():
        async with create_connected_server_and_client_session(mcp._mcp_server) as s:
            tools = {t.name for t in (await s.list_tools()).tools}
            prompts = {p.name for p in (await s.list_prompts()).prompts}
            resources = {str(r.uri) for r in (await s.list_resources()).resources}
            return tools, prompts, resources
    tools, prompts, resources = run(go)
    assert EXPECTED_TOOLS <= tools
    assert {"weekly_focus_review", "improve_my_message"} <= prompts
    assert "focuslink://model-card" in resources


def test_ai_tools(client):  # `client` starts the app so the database and tables exist
    async def go():
        async with create_connected_server_and_client_session(mcp._mcp_server) as s:
            text = await _call(s, "analyze_text", {"text": "I think maybe we should sort of ship it. Great job team!"})
            rewrite = await _call(s, "confident_rewrite", {"text": "Umm, I think we should maybe ship it."})
            convo = await _call(s, "analyze_conversation", {"messages": ["I will lead the demo.", "Maybe, not sure, sorry"],
                                                            "speakers": ["asha", "ravi"]})
            fatigue = await _call(s, "predict_fatigue", {"duration_min": 180, "hour": 23, "focus_pct": 40,
                                                         "distracted_pct": 25, "drowsy_pct": 30, "blinks_per_min": 30,
                                                         "yawns_per_10min": 4, "avg_ear": 0.22})
            stats = await _call(s, "platform_stats", {})
            missing = await s.call_tool("user_overview", {"username": "nobody-here"})
            return text, rewrite, convo, fatigue, stats, missing
    text, rewrite, convo, fatigue, stats, missing = run(go)
    assert {"maybe", "sort of"} <= set(text["hedges"])
    assert rewrite["rewrite"] == "We should ship it." and rewrite["confidence_after"] > rewrite["confidence_before"]
    assert convo["confidence_by_user"]["asha"] > convo["confidence_by_user"]["ravi"]
    assert fatigue["risk"] == "high"
    assert {"users", "focus_sessions", "messages"} <= set(stats)
    assert missing.isError


def test_data_tools(client, verified_user):
    headers, creds = verified_user
    client.post("/attention/sessions", headers=headers, json={"started_at": "2026-01-01T21:00:00Z", "duration_sec": 1800,
                                                              "focus_pct": 70, "distracted_pct": 20, "drowsy_pct": 5})
    room = client.post("/rooms", headers=headers, json={"name": "mcp-room"}).json()
    client.post(f"/rooms/{room['id']}/messages", headers=headers, json={"content": "I will finish the slides today"})

    async def go():
        async with create_connected_server_and_client_session(mcp._mcp_server) as s:
            return (await _call(s, "user_overview", {"username": creds["username"]}),
                    await _call(s, "list_focus_sessions", {"username": creds["email"]}),
                    await _call(s, "room_messages", {"room": "mcp-room"}),
                    await _call(s, "room_insights", {"room": str(room["id"])}),
                    await _call(s, "leaderboard", {}))
    overview, sessions, msgs, insights, board = run(go)
    assert overview["focus"]["sessions"] == 1 and overview["focus"]["latest_fatigue"]["risk"] in {"low", "medium", "high"}
    assert sessions[0]["minutes"] == 30
    assert msgs[-1]["text"] == "I will finish the slides today"
    assert insights["total_messages"] == 1
    assert any(r["username"] == creds["username"] for r in board)


@pytest.mark.parametrize("key,status", [(None, 401), ("wrong", 401)])
def test_http_endpoint_requires_api_key(monkeypatch, key, status):
    from starlette.testclient import TestClient

    from app import mcp_server

    monkeypatch.setenv("MCP_API_KEY", "secret-key")
    monkeypatch.setattr(mcp_server.mcp, "_session_manager", None)  # a session manager can only run once
    app = mcp_server.http_app()
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    with TestClient(app) as c:
        assert c.post("/mcp", json={}, headers=headers).status_code == status
