"""Daily routine: save a plan, tick blocks off, history + streak, validation, and removal with the account."""
from datetime import date, timedelta

PLAN = {
    "template": "aiml-pro",
    "blocks": [
        {"id": "deep-1", "title": "Deep work: AI/ML coding", "start": "08:30", "minutes": 150, "category": "coding", "link": "/app/focus"},
        {"id": "gym", "title": "Gym", "start": "06:00", "minutes": 45, "category": "health", "days": [1, 3, 5]},
    ],
    "prayer": {"enabled": True, "method": "karachi", "asr": "hanafi", "lat": 28.61, "lng": 77.21, "place": "Delhi"},
}


def test_plan_round_trip(client, verified_user):
    headers, _ = verified_user
    today = date.today().isoformat()
    first = client.get(f"/routine?day={today}", headers=headers).json()
    assert first["plan"] is None and first["checks"] == [] and len(first["history"]) == 7 and first["streak"] == 0
    assert client.put("/routine", headers=headers, json=PLAN).json() == {"ok": True, "blocks": 2}
    plan = client.get(f"/routine?day={today}", headers=headers).json()["plan"]
    assert plan["blocks"][0]["title"] == "Deep work: AI/ML coding" and plan["prayer"]["place"] == "Delhi"
    assert plan["blocks"][0]["days"] == list(range(7))  # default: every day


def test_checks_history_and_streak(client, verified_user):
    headers, _ = verified_user
    today = date.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(3)]
    for d in days[1:]:  # yesterday and the day before
        client.put("/routine/check", headers=headers, json={"day": d, "block_id": "deep-1"})
    r = client.get(f"/routine?day={days[0]}", headers=headers).json()
    assert r["streak"] == 2  # today not done yet still keeps the streak
    assert client.put("/routine/check", headers=headers, json={"day": days[0], "block_id": "prayer-fajr"}).json() == {"checks": ["prayer-fajr"]}
    client.put("/routine/check", headers=headers, json={"day": days[0], "block_id": "prayer-fajr"})  # twice = still once
    r = client.get(f"/routine?day={days[0]}", headers=headers).json()
    assert r["checks"] == ["prayer-fajr"] and r["streak"] == 3 and r["history"][-1] == {"day": days[0], "done": 1}
    assert client.put("/routine/check", headers=headers, json={"day": days[0], "block_id": "prayer-fajr", "done": False}).json() == {"checks": []}


def test_validation(client, verified_user):
    headers, _ = verified_user
    bad = [
        {**PLAN, "blocks": [{**PLAN["blocks"][0], "start": "25:00"}]},
        {**PLAN, "blocks": [{**PLAN["blocks"][0], "minutes": 2}]},
        {**PLAN, "blocks": [{**PLAN["blocks"][0], "category": "partying"}]},
        {**PLAN, "blocks": [{**PLAN["blocks"][0], "link": "https://evil.example"}]},
        {**PLAN, "blocks": [PLAN["blocks"][0]] * 61},
        {**PLAN, "prayer": {**PLAN["prayer"], "lat": 123}},
    ]
    for plan in bad:
        assert client.put("/routine", headers=headers, json=plan).status_code == 422
    assert client.get("/routine?day=yesterday", headers=headers).status_code == 422
    assert client.get("/routine?day=2026-01-01").status_code in (401, 403)


def test_deleted_with_account(client, verified_user):
    headers, creds = verified_user
    uid = client.get("/auth/me", headers=headers).json()["id"]
    client.put("/routine", headers=headers, json=PLAN)
    client.put("/routine/check", headers=headers, json={"day": date.today().isoformat(), "block_id": "gym"})
    r = client.request("DELETE", "/auth/me", headers=headers, json={"password": creds["password"]})
    assert r.status_code == 200, r.text
    from app.database import SessionLocal
    from app.models import RoutineCheck, RoutinePlan
    with SessionLocal() as db:  # the test database is shared, so count only this user's rows
        assert db.query(RoutinePlan).filter_by(user_id=uid).count() == 0
        assert db.query(RoutineCheck).filter_by(user_id=uid).count() == 0
