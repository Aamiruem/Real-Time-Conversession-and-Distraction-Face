import io
import wave

import numpy as np

from speech.conversation import AREAS, CONVERSATION_TYPES, conversation_feedback


def _report(transcript: str, eye_contact: float | None = 80.0, **metrics) -> dict:
    words = len(transcript.split())
    m = {"words": words, "wpm": 140, "fillers": 0, "long_pauses": 0, "clarity_pct": 92.0, "unclear_words": [],
         "hedges": 0, "hedge_breakdown": {}, "pitch_var_st": 3.0, "loudness_std": 5.0, "loudness_db": -25.0,
         "eye_contact": eye_contact, **metrics}
    return {"transcript": transcript, "metrics": m,
            "scores": {"fluency": 95.0, "clarity": 90.0, "assertiveness": 90.0}}


ENGAGING = ("Thank you for having me. I led a team of five and we delivered the project early. "
            "What does success look like for you in this role? I will bring the same focus here.")


def test_feedback_has_five_scored_areas():
    fb = conversation_feedback(_report(ENGAGING), "interview")
    assert [a["key"] for a in fb["areas"]] == list(AREAS)
    for a in fb["areas"]:
        assert 0 <= a["score"] <= 100 and a["needs_improvement"] == round(100 - a["score"], 1)
        assert a["suggestions"] and a["evidence"]
    assert sum(a["weight"] for a in fb["areas"]) in (99, 100, 101)  # rounded shares
    assert fb["type_label"] == "Job interview" and 0 <= fb["overall"] <= 100


def test_weak_areas_are_flagged_with_tailored_advice():
    flat = _report("I think maybe I sort of did the work I guess and I am not sure it was good I suppose",
                   eye_contact=30, pitch_var_st=0.8, loudness_std=1.0, loudness_db=-45.0, wpm=95,
                   hedges=5, hedge_breakdown={"i think": 1, "maybe": 1, "sort of": 1, "i guess": 1, "i suppose": 1})
    fb = conversation_feedback(flat, "sales")
    by = {a["key"]: a for a in fb["areas"]}
    assert by["voice_modulation"]["status"] in ("Weak", "Needs improvement")
    assert by["interaction"]["score"] < 50 and by["interaction"]["drill"]
    assert by["focus"]["score"] == 30
    assert "“I think”" in by["word_confidence"]["evidence"][0]
    assert CONVERSATION_TYPES["sales"]["advice"]["interaction"] in by["interaction"]["suggestions"]
    assert fb["focus_area"] != fb["best_area"]


def test_audio_only_skips_focus_and_unknown_type_falls_back():
    fb = conversation_feedback(_report(ENGAGING, eye_contact=None), "no-such-type")
    assert "focus" not in {a["key"] for a in fb["areas"]} and fb["type"] == "casual"


def test_conversation_api(client, verified_user):
    headers, _ = verified_user
    types = client.get("/speech/conversation-types").json()
    assert {t["key"] for t in types} == set(CONVERSATION_TYPES) and all(t["prompts"] for t in types)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(np.zeros(16000 * 4, np.int16).tobytes())
    bad = client.post("/speech/analyze", headers=headers, data={"conversation_type": "karaoke"},
                      files={"audio": ("x.wav", buf.getvalue(), "audio/wav")})
    assert bad.status_code == 422 and "conversation_type" in bad.json()["detail"]
