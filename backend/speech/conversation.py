"""Conversation coach: turns a speech-coach report into feedback for a specific kind of conversation.

Five areas, each scored 0-100 with a "needs improvement" share, the evidence behind the score and
suggestions tailored to the conversation type (job interview, sales call, casual chat, …):

  * Fluency          -> fillers, hesitation pauses, pace for this type of conversation, clear words
  * Word confidence  -> hedging ("I think maybe…") vs. decisive wording ("I recommend…")
  * Focus            -> eye contact with the camera while speaking (face attention engine)
  * Interaction      -> questions, speaking *to* the listener (you / we / let's), acknowledging them
  * Voice modulation -> pitch variety, loudness dynamics and projection

Builds only on speech.analyzer output, so it runs anywhere the speech engine runs (API and Streamlit).
"""
import re

AREAS = {
    "fluency": "Fluency",
    "word_confidence": "Word confidence",
    "focus": "Focus",
    "interaction": "Interaction",
    "voice_modulation": "Voice modulation",
}

ASSERTIVE = [
    "i will", "i'll", "i recommend", "i suggest", "we should", "we will", "definitely", "certainly",
    "i'm confident", "i am confident", "clearly", "absolutely", "i believe", "i know", "the key", "i led",
    "i built", "i delivered", "i achieved", "my goal",
]
AUDIENCE = ["you", "your", "you're", "yours", "we", "we're", "our", "us", "let's", "together"]
ACKNOWLEDGE = [
    "thank you", "thanks", "great question", "good question", "i understand", "i hear you", "that makes sense",
    "fair point", "good point", "exactly", "i agree", "i appreciate", "you're right", "of course",
]
SIGNPOSTS = ["first", "second", "third", "finally", "next", "for example", "for instance", "because", "so",
             "in summary", "to sum up", "the reason", "as a result", "on the other hand", "however"]

# Each type: ideal pace, how much questions matter (per 100 words), how much each area counts,
# practice scenarios and type-specific advice per area.
CONVERSATION_TYPES = {
    "interview": {
        "label": "Job interview", "icon": "💼", "wpm": (120, 155), "questions": 0.3,
        "weights": {"fluency": 0.25, "word_confidence": 0.3, "focus": 0.2, "interaction": 0.1, "voice_modulation": 0.15},
        "prompts": ["Tell me about yourself.", "Why should we hire you?",
                    "Describe a challenge you faced at work and how you handled it.",
                    "What is your biggest weakness?", "Where do you see yourself in five years?"],
        "advice": {
            "fluency": "Answer with STAR — Situation, Task, Action, Result — so you never run out of what to say next.",
            "word_confidence": "Own your results: “I led…”, “I delivered…”, “I reduced costs by 20%”. Interviewers "
                               "hear “I think I maybe helped” as doubt.",
            "focus": "Look at the interviewer (the lens on video calls) when you state your key result.",
            "interaction": "End one or two answers with a check-in such as “Would you like more detail on that?” "
                           "and prepare two questions about the role.",
            "voice_modulation": "Slow down and drop your pitch on the result of each story — that's the line they "
                                "should remember.",
        },
    },
    "presentation": {
        "label": "Presentation / public speaking", "icon": "🎤", "wpm": (110, 150), "questions": 0.3,
        "weights": {"fluency": 0.25, "word_confidence": 0.2, "focus": 0.15, "interaction": 0.1, "voice_modulation": 0.3},
        "prompts": ["Present the main idea of a project you worked on in two minutes.",
                    "Open a talk about why sleep matters for productivity.",
                    "Give the closing summary of a quarterly results presentation."],
        "advice": {
            "fluency": "Rehearse your first and last sentence word for word; signpost the middle "
                       "(“First… Second… Finally…”).",
            "word_confidence": "State the takeaway as a fact in your first 20 seconds, then prove it.",
            "focus": "Pick three spots in the room (or the lens) and finish a full sentence on each.",
            "interaction": "Ask the audience a rhetorical question early (“How many of you…?”) and use “you” more "
                           "than “I”.",
            "voice_modulation": "Mark your notes: ↑ for emphasis, ‖ for a two-second pause before key numbers. "
                                "Vary volume, not just pitch.",
        },
    },
    "meeting": {
        "label": "Team meeting", "icon": "👥", "wpm": (120, 160), "questions": 1.0,
        "weights": {"fluency": 0.2, "word_confidence": 0.25, "focus": 0.15, "interaction": 0.25, "voice_modulation": 0.15},
        "prompts": ["Give a two-minute status update on your work this week.",
                    "Propose a change to how your team runs stand-ups.",
                    "Explain a blocker and ask the team for help."],
        "advice": {
            "fluency": "Lead with the headline (“We're on track except for X”), then the detail.",
            "word_confidence": "Make proposals, not wishes: “I propose we…” instead of “maybe we could sort of…”.",
            "focus": "Look up from your notes when you ask for a decision.",
            "interaction": "Name people and invite input: “Priya, does that work for QA?”, “What am I missing?”.",
            "voice_modulation": "Keep energy up at the end of your update — trailing off sounds like you're unsure.",
        },
    },
    "sales": {
        "label": "Sales / pitch", "icon": "📈", "wpm": (130, 165), "questions": 1.5,
        "weights": {"fluency": 0.2, "word_confidence": 0.25, "focus": 0.15, "interaction": 0.25, "voice_modulation": 0.15},
        "prompts": ["Pitch a product you use every day in 60 seconds.",
                    "A customer says your price is too high. Respond.",
                    "Open a discovery call with a new prospect."],
        "advice": {
            "fluency": "Use a simple arc: problem → cost of the problem → your solution → proof → next step.",
            "word_confidence": "Replace “it might help” with outcomes: “Teams like yours save 5 hours a week.”",
            "focus": "Hold eye contact when you state the price — looking away signals you don't believe it.",
            "interaction": "Ask open questions (“What happens today when…?”) and talk less than half the time.",
            "voice_modulation": "Get excited about the benefit, calm and slow about the price.",
        },
    },
    "casual": {
        "label": "Casual conversation", "icon": "☕", "wpm": (120, 170), "questions": 1.5,
        "weights": {"fluency": 0.2, "word_confidence": 0.1, "focus": 0.2, "interaction": 0.35, "voice_modulation": 0.15},
        "prompts": ["Tell a friend about the best trip you've taken.", "Make small talk with a new colleague.",
                    "Describe your weekend to someone you just met."],
        "advice": {
            "fluency": "Short sentences are fine — a natural chat is about rhythm, not perfect grammar.",
            "word_confidence": "Share opinions plainly (“I loved it”) instead of softening everything.",
            "focus": "Look at the other person while they talk too — it shows you're listening.",
            "interaction": "Ask follow-up questions about what they said (“How did that go?”) and react to it.",
            "voice_modulation": "Let your voice show emotion — smile while you talk, it changes your tone.",
        },
    },
    "debate": {
        "label": "Debate / negotiation", "icon": "⚖️", "wpm": (120, 160), "questions": 0.8,
        "weights": {"fluency": 0.2, "word_confidence": 0.35, "focus": 0.15, "interaction": 0.15, "voice_modulation": 0.15},
        "prompts": ["Argue for or against working from home.", "Negotiate a higher salary for a new role.",
                    "Respond to someone who disagrees with your plan."],
        "advice": {
            "fluency": "Claim → reason → evidence. Number your points so the other side can't skip one.",
            "word_confidence": "Never open with “Sorry, but…” or “I might be wrong…”. State your position first.",
            "focus": "Keep steady eye contact when you disagree; looking down reads as backing off.",
            "interaction": "Acknowledge their point before countering (“Fair point — and here's why…”).",
            "voice_modulation": "Lower and slow your voice for your strongest point; don't rise in volume when "
                                "challenged.",
        },
    },
    "support": {
        "label": "Customer support", "icon": "🎧", "wpm": (115, 150), "questions": 1.2,
        "weights": {"fluency": 0.2, "word_confidence": 0.2, "focus": 0.1, "interaction": 0.35, "voice_modulation": 0.15},
        "prompts": ["A customer's order arrived broken. Help them.", "Explain a delay to an upset customer.",
                    "Walk a user through resetting their password."],
        "advice": {
            "fluency": "Give steps one at a time and confirm each before moving on.",
            "word_confidence": "Say what you *will* do: “I'll send a replacement today”, not “I'll try to see if…”.",
            "focus": "On video, look at the customer while they describe the problem.",
            "interaction": "Acknowledge feelings first (“I understand how frustrating that is”), then ask a "
                           "clarifying question.",
            "voice_modulation": "Warm, steady and slightly slower than normal — calm is contagious.",
        },
    },
    "teaching": {
        "label": "Teaching / explaining", "icon": "🧑‍🏫", "wpm": (110, 145), "questions": 1.0,
        "weights": {"fluency": 0.25, "word_confidence": 0.15, "focus": 0.15, "interaction": 0.25, "voice_modulation": 0.2},
        "prompts": ["Explain what you do to a 10-year-old.", "Teach someone how the internet works in two minutes.",
                    "Explain a concept from your field with one example."],
        "advice": {
            "fluency": "One idea per sentence, then an example: “For example…”.",
            "word_confidence": "Define terms plainly; avoid “basically” and “sort of” — they blur the explanation.",
            "focus": "Watch your listener's face for confusion and pause there.",
            "interaction": "Check understanding with real questions (“What would happen if…?”), not “Make sense?”.",
            "voice_modulation": "Stress the key term every time you introduce it, and pause after it.",
        },
    },
    "storytelling": {
        "label": "Storytelling", "icon": "📖", "wpm": (110, 150), "questions": 0.3,
        "weights": {"fluency": 0.25, "word_confidence": 0.15, "focus": 0.15, "interaction": 0.1, "voice_modulation": 0.35},
        "prompts": ["Tell a story about a time you failed and what you learned.",
                    "Describe the moment you decided on your career.", "Tell the story of your proudest achievement."],
        "advice": {
            "fluency": "Structure: setting → challenge → turning point → result → lesson.",
            "word_confidence": "Use concrete details (names, numbers, places) instead of “kind of a big thing”.",
            "focus": "Look at your listener at the turning point — that's where they lean in.",
            "interaction": "Pull the listener in: “Imagine you're…”, “You know that feeling when…”.",
            "voice_modulation": "Speed up in the action, slow down and go quieter just before the turning point.",
        },
    },
    "phone": {
        "label": "Phone / video call", "icon": "📞", "wpm": (115, 155), "questions": 1.0,
        "weights": {"fluency": 0.25, "word_confidence": 0.2, "focus": 0.15, "interaction": 0.2, "voice_modulation": 0.2},
        "prompts": ["Leave a clear voicemail asking a client to call you back.",
                    "Open a video call with someone you've never met.", "Reschedule a meeting politely over the phone."],
        "advice": {
            "fluency": "Say who you are and why you're calling in the first sentence.",
            "word_confidence": "Finish with a clear ask: “Can you call me back by 3 pm?”.",
            "focus": "Put the call window right under your camera so you look at the person, not past them.",
            "interaction": "Without body language, say acknowledgements out loud: “Got it”, “That makes sense”.",
            "voice_modulation": "Your voice is all they have — smile, vary pitch and speak a little louder than usual.",
        },
    },
}

DRILLS = {
    "fluency": "60-second drill: talk about any object on your desk without a single “um” — pause silently instead.",
    "word_confidence": "Record one answer, then re-record it using the “Say it like this” version below.",
    "focus": "Stick a small note next to the lens and talk to it for one full minute.",
    "interaction": "Re-do this take and ask at least two questions to the listener.",
    "voice_modulation": "Read one sentence three times: excited, serious, and as a secret. Notice the pitch change.",
}


def _clamp(v: float) -> float:
    return float(max(0.0, min(100.0, v)))


def _count(text: str, phrases: list[str]) -> int:
    return sum(len(re.findall(rf"(?<![\w']){re.escape(p)}(?![\w'])", text)) for p in phrases)


def _status(score: float) -> str:
    return "Excellent" if score >= 85 else "Good" if score >= 70 else "Needs improvement" if score >= 50 else "Weak"


def conversation_feedback(report: dict, conversation_type: str = "casual") -> dict:
    """Five-area feedback for one speech-coach report (output of speech.analyzer.analyze)."""
    ctype = CONVERSATION_TYPES.get(conversation_type, CONVERSATION_TYPES["casual"])
    m, s = report["metrics"], report["scores"]
    transcript = report.get("transcript", "")
    text = " " + transcript.lower() + " "
    words = max(m["words"], 1)
    per100 = 100 / words

    areas: dict[str, dict] = {}

    # ---- fluency: fillers + pauses (analyzer), pace for *this* kind of conversation, clear words
    lo, hi = ctype["wpm"]
    pace = _clamp(100 - 1.5 * max(0, lo - m["wpm"], m["wpm"] - hi))
    signposts = _count(text, SIGNPOSTS)
    fluency = 0.45 * s["fluency"] + 0.3 * pace + 0.25 * s["clarity"]
    areas["fluency"] = {
        "score": fluency,
        "evidence": [f"{m['fillers']} filler word(s), {m['long_pauses']} pause(s) over 2 s",
                     f"{m['wpm']} words/min (ideal for this conversation: {lo}–{hi})",
                     f"{m['clarity_pct']:.0f}% of words recognised clearly",
                     f"{signposts} structure word(s) like “first”, “because”, “for example”"],
        "general": [t for t in (
            "Swap every “um” for a silent breath — silence sounds thoughtful." if m["fillers"] else "",
            f"Slow down toward {hi} words/min; pause at each full stop." if m["wpm"] > hi else "",
            f"Speed up a little toward {lo} words/min; know your first line by heart." if m["wpm"] < lo else "",
            "Plan the next point before stopping — use “First… Then… Finally…”." if m["long_pauses"] else "",
            "Open your mouth more and finish final consonants on: " + ", ".join(m["unclear_words"][:5]) + "."
            if m["unclear_words"] else "",
        ) if t],
    }

    # ---- word confidence: hedges pull down, decisive phrases push up
    hedges, strong = m["hedges"], _count(text, ASSERTIVE)
    wording = _clamp(75 + 450 * (strong - hedges) / words)
    word_conf = 0.5 * s["assertiveness"] + 0.5 * wording
    top_hedges = ", ".join(f"“{re.sub(r'(?<![a-z])i(?![a-z])', 'I', k)}”" for k in list(m.get("hedge_breakdown", {}))[:4])
    areas["word_confidence"] = {
        "score": word_conf,
        "evidence": [f"{hedges} hedging phrase(s){' (' + top_hedges + ')' if top_hedges else ''}",
                     f"{strong} decisive phrase(s) like “I will”, “I recommend”"],
        "general": [t for t in (
            f"Drop {top_hedges} — say the sentence without them and it gets stronger." if hedges else "",
            "Use action verbs about yourself: “I decided”, “I built”, “I will”." if strong < 2 else "",
            "End sentences on a falling pitch so statements don't sound like questions.",
        ) if t],
    }

    # ---- focus: eye contact while speaking (only when the camera was on)
    if m.get("eye_contact") is not None:
        ec = float(m["eye_contact"])
        areas["focus"] = {
            "score": _clamp(ec),
            "evidence": [f"Looking at the camera {ec:.0f}% of the time"],
            "general": [t for t in (
                "Look at the lens, not your own video — put the call window right under the camera." if ec < 70 else "",
                "Glance away only between sentences, never in the middle of a key point." if ec < 85 else "",
            ) if t],
        }

    # ---- interaction: questions, audience-directed words, acknowledgements
    questions = transcript.count("?")
    audience = _count(text, AUDIENCE)
    acks = _count(text, ACKNOWLEDGE)
    q_target = ctype["questions"]
    # where questions are rare (interview answers, talks) one is a bonus and none is only a small minus
    q_part = (1.0 if questions else 0.6) if q_target <= 0.3 else min(1.0, questions * per100 / q_target)
    interaction = 100 * (0.4 * q_part + 0.4 * min(1.0, audience * per100 / 5) + 0.2 * min(1.0, acks / 1))
    i_ratio = _count(text, ["i", "me", "my", "i'm", "i've"]) * per100
    areas["interaction"] = {
        "score": _clamp(interaction),
        "evidence": [f"{questions} question(s) asked",
                     f"{audience} listener-directed word(s) (you, we, let's…)",
                     f"{acks} acknowledgement(s) like “thank you”, “that makes sense”",
                     f"{i_ratio:.0f} “I/me/my” per 100 words"],
        "general": [t for t in (
            "Ask the listener at least one open question (“What do you think about…?”)." if not questions else "",
            "Talk *to* the listener: swap some “I” for “you” and “we”." if audience * per100 < 3 or i_ratio > 9 else "",
            "Acknowledge the other person before you answer (“Good question —”)." if not acks else "",
        ) if t],
    }

    # ---- voice modulation: pitch variety + loudness dynamics, minus a penalty for speaking too quietly
    pv, ls, loud = m["pitch_var_st"], m.get("loudness_std", 0.0), m["loudness_db"]
    pitch = 40 if pv < 1.2 else 65 if pv < 2.0 else 100 if pv <= 6 else 80
    dyn = 50 if ls < 2 else 75 if ls < 4 else 100 if ls <= 9 else 80
    modulation = _clamp(0.6 * pitch + 0.4 * dyn - _clamp((-38 - loud) * 4))
    areas["voice_modulation"] = {
        "score": modulation,
        "evidence": [f"Pitch variety {pv:.1f} semitones (lively speech: 2–6)",
                     f"Volume variation {ls:.1f} dB (dynamic speech: 4–9)",
                     f"Average loudness {loud:.0f} dB{' — quiet' if loud < -38 else ''}"],
        "general": [t for t in (
            "You sound monotone — lift your pitch on the key word of each sentence." if pv < 2 else "",
            "Vary your volume: a little louder for the main point, softer to draw people in." if ls < 4 else "",
            "Project more — sit up and speak to the back of the room." if loud < -38 else "",
        ) if t],
    }

    weights = {k: w for k, w in ctype["weights"].items() if k in areas}
    overall = sum(areas[k]["score"] * w for k, w in weights.items()) / sum(weights.values())

    out_areas = []
    for key, a in areas.items():
        score = round(a["score"], 1)
        out_areas.append({
            "key": key, "label": AREAS[key], "score": score, "needs_improvement": round(100 - score, 1),
            "status": _status(score), "weight": round(weights[key] / sum(weights.values()) * 100),
            "evidence": a["evidence"],
            "suggestions": ([ctype["advice"][key]] + a["general"])[:4] if score < 85 else [ctype["advice"][key]],
            "drill": DRILLS[key] if score < 70 else None,
        })
    ranked = sorted(out_areas, key=lambda a: a["score"])
    return {
        "type": conversation_type if conversation_type in CONVERSATION_TYPES else "casual",
        "type_label": ctype["label"],
        "overall": round(overall, 1),
        "status": _status(overall),
        "areas": out_areas,
        "focus_area": ranked[0]["key"],
        "best_area": ranked[-1]["key"],
        "summary": (f"Strongest: {ranked[-1]['label']} ({ranked[-1]['score']:.0f}%). "
                    f"Work on {ranked[0]['label'].lower()} first ({ranked[0]['needs_improvement']:.0f}% to improve)."),
    }


def conversation_types() -> list[dict]:
    """Public list for the UI: key, label, icon, ideal pace and practice prompts."""
    return [{"key": k, "label": v["label"], "icon": v["icon"], "wpm": list(v["wpm"]), "prompts": v["prompts"]}
            for k, v in CONVERSATION_TYPES.items()]
