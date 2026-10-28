from ml.features import FEATURES, from_session
from nlp.text_analyzer import analyze_text
from speech.analyzer import compare_to_passage, confident_rewrite


def test_nlp_analysis():
    r = analyze_text("I think maybe this is a stupid plan. I will fix it and I recommend we test it.")
    assert r["is_toxic"] and "stupid" in r["toxic_words"]
    assert {"i think", "maybe"} <= set(r["hedges"]) and {"i will", "i recommend"} <= set(r["assertive"])
    assert 0 <= r["confidence"] <= 100


def test_confident_rewrite_removes_fillers_and_hedges():
    assert confident_rewrite("Umm, I think, you know, we should maybe ship it, sorry.") == "We should ship it."


def test_read_aloud_alignment_handles_compounds():
    words = [{"word": w} for w in "the seashells by the seashore".split()]
    r = compare_to_passage(words, "The sea shells by the sea shore")
    assert r["accuracy"] == 100 and not r["misread"]


def test_feature_extraction():
    f = from_session({"duration_sec": 1200, "started_at": "2026-01-01T22:15:00", "focus_pct": 70,
                      "distracted_pct": 20, "drowsy_pct": 5, "no_face_pct": 5, "total_blinks": 400,
                      "total_yawns": 2, "avg_ear": 0.27})
    assert list(f) == FEATURES and f["hour"] == 22 and f["blinks_per_min"] == 20 and f["yawns_per_10min"] == 1


def test_ml_api(client, verified_user):
    headers, _ = verified_user
    card = client.get("/ml/model", headers=headers).json()
    assert card["test"]["f1_macro"] > 0.5 and set(card["features"]) == set(FEATURES)
    tired = {"duration_min": 180, "hour": 23, "focus_pct": 40, "distracted_pct": 25, "drowsy_pct": 30,
             "no_face_pct": 5, "blinks_per_min": 30, "yawns_per_10min": 4, "avg_ear": 0.22}
    fresh = {"duration_min": 25, "hour": 10, "focus_pct": 90, "distracted_pct": 7, "drowsy_pct": 0,
             "no_face_pct": 3, "blinks_per_min": 15, "yawns_per_10min": 0, "avg_ear": 0.31}
    assert client.post("/ml/predict", json=tired, headers=headers).json()["risk"] == "high"
    assert client.post("/ml/predict", json=fresh, headers=headers).json()["risk"] == "low"


def test_session_feedback_label(client, verified_user):
    headers, _ = verified_user
    s = client.post("/attention/sessions", headers=headers, json={
        "started_at": "2026-01-01T09:00:00Z", "duration_sec": 600, "focus_pct": 80, "distracted_pct": 15,
        "drowsy_pct": 2}).json()
    assert client.get("/ml/fatigue/me", headers=headers).json()["session_id"] == s["id"]
    r = client.patch(f"/attention/sessions/{s['id']}/feedback", headers=headers, json={"self_fatigue": 2})
    assert r.json()["self_fatigue"] == 2


def test_nlp_api_requires_auth(client, verified_user):
    assert client.post("/nlp/analyze", json={"text": "hello"}).status_code in (401, 403)
    headers, _ = verified_user
    r = client.post("/nlp/analyze", json={"text": "Great work team!"}, headers=headers).json()
    assert r["sentiment_label"] == "positive"
