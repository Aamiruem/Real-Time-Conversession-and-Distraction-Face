import io
import wave

import numpy as np

from interview.coach import answer_feedback, relevance
from interview.knowledge import FIELDS, FRAMEWORKS, GUIDE, all_questions, find_question


def _report(transcript: str, duration: float = 70.0, eye_contact: float | None = 75.0) -> dict:
    words = [{"word": w, "filler": w.lower().strip(",.") in ("um", "uh"), "prob": 0.95} for w in transcript.split()]
    m = {"words": len(words), "wpm": 140, "fillers": 0, "long_pauses": 0, "clarity_pct": 92.0, "unclear_words": [],
         "hedges": 0, "hedge_breakdown": {}, "pitch_var_st": 3.0, "loudness_std": 5.0, "loudness_db": -25.0,
         "eye_contact": eye_contact, "duration_sec": duration}
    return {"transcript": transcript, "words": words, "metrics": m,
            "scores": {"fluency": 90.0, "clarity": 90.0, "assertiveness": 85.0}}


STAR = ("In my last internship at a fintech startup our reports took two days. My goal was to cut that time. "
        "I decided to automate the Excel pipeline with Python and I tested it with the finance team. "
        "As a result we reduced report time by 80 percent and saved 10 hours every week.")


def test_knowledge_base_is_consistent():
    for key in FIELDS:
        qs = all_questions(key)
        assert len({q["id"] for q in qs}) == len(qs)
        assert all(q["framework"] in FRAMEWORKS and q["points"] and q["outline"] for q in qs)
    assert find_question("g-about")["framework"] == "PPF"
    assert find_question("software-0", "software") and find_question("software-0", "finance") is None
    assert {s["id"] for s in GUIDE} >= {"get", "first", "dress", "body", "eyes", "voice", "vocab", "video"}


def test_relevance_prefers_on_topic_answers():
    ref = "challenge problem deadline solution result improved team"
    assert relevance(STAR + " challenge solution", ref) > relevance("I like football and pizza on weekends.", ref)


def test_answer_feedback_scores_content_delivery_and_presence():
    presence = {"smile_pct": 30, "expressiveness": 6, "face_size": 0.3, "center_offset": 0.04, "head_tilt": 3,
                "brightness": 130, "contrast": 45, "sharpness": 150, "width": 1280, "height": 720}
    fb = answer_feedback(_report(STAR), find_question("g-challenge"), "data", presence)
    by = {s["key"]: s for s in fb["sections"]}
    assert set(by) == {"content", "delivery", "presence"}
    content = {i["key"]: i for i in by["content"]["items"]}
    assert all(p["done"] for p in fb["structure"])  # full STAR story
    assert content["structure"]["score"] == 100
    assert {"decided", "reduced", "saved"} <= set(fb["power_verbs"])
    assert {i["key"] for i in by["presence"]["items"]} == {"eye_contact", "smile", "expression", "framing",
                                                           "posture", "lighting", "camera"}
    assert 0 <= fb["readiness"] <= 100 and len(fb["top_tips"]) == 3


def test_weak_answer_gets_swaps_and_low_structure():
    weak = "Um so I think I just helped with stuff and things, kind of a lot of stuff, I guess it was fine."
    fb = answer_feedback(_report(weak, duration=12, eye_contact=None), find_question("g-challenge"))
    content = {i["key"]: i for i in fb["sections"][0]["items"]}
    assert {s["weak"] for s in fb["swaps"]} >= {"i think", "just", "helped with", "stuff", "kind of"}
    assert content["structure"]["score"] < 50 and content["length"]["score"] < 60
    assert content["opening"]["score"] < 85
    assert "presence" not in {s["key"] for s in fb["sections"]}  # no camera data


def test_interview_api(client, verified_user):
    headers, _ = verified_user
    assert len(client.get("/interview/fields").json()) == len(FIELDS)
    qs = client.get("/interview/questions", params={"field": "sales"}).json()
    assert any(q["id"] == "sales-0" for q in qs)
    assert client.get("/interview/questions", params={"field": "astronaut"}).status_code == 404
    assert client.get("/interview/guide").json()["sections"]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(np.zeros(16000 * 4, np.int16).tobytes())
    files = {"audio": ("a.wav", buf.getvalue(), "audio/wav")}
    assert client.post("/interview/answer", headers=headers, files=files,
                       data={"question_id": "nope"}).status_code == 404
    assert client.post("/interview/answer", headers=headers, files=files,
                       data={"question_id": "g-about", "presence": "[1]"}).status_code == 422
