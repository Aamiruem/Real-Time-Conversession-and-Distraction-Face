"""Interview answer coach: scores one recorded answer for content, delivery and on-camera presence.

  * Content  -> relevance to the question (TF-IDF cosine similarity, scikit-learn), answer structure
                (STAR / Present-Past-Future / PREP cues), vocabulary (power verbs, weak words, variety),
                opening strength and answer length
  * Delivery -> the conversation coach's five areas for a job interview (fluency, word confidence, focus,
                interaction, voice modulation)
  * Presence -> camera measurements from the face tracker: eye contact, smile, expressiveness, framing,
                head posture, lighting, sharpness and resolution

Input is a speech-coach report (speech.analyzer.analyze) plus an optional `presence` dict with the keys produced
by cv.attention_detector.AttentionDetector.presence() / the browser's lib/presence.js.
"""
import re

from interview.knowledge import FIELDS, FRAMEWORKS, POWER_VERBS, WORD_SWAPS
from speech.conversation import conversation_feedback

STRUCTURE_CUES = {
    "STAR": {
        "Situation": ["when i", "at my", "in my last", "in my previous", "during", "project", "at college",
                      "last year", "we had", "there was", "while working"],
        "Task": ["my role", "my goal", "i was asked", "responsible", "needed to", "had to", "the task",
                 "the challenge", "the problem", "the goal"],
        "Action": ["i decided", "i built", "i led", "i created", "i started", "i organised", "i organized",
                   "i spoke", "i worked", "i designed", "i implemented", "i analysed", "i analyzed", "so i", "i made",
                   "i tested", "i planned", "i set up", "i proposed"],
        "Result": ["as a result", "result", "increased", "reduced", "saved", "improved", "achieved", "delivered",
                   "on time", "percent", "%", "grew", "won", "learned", "outcome"],
    },
    "PPF": {
        "Present": ["currently", "i am a", "i'm a", "right now", "at the moment", "i work", "i am working",
                    "i'm working", "i study", "i am studying", "final year"],
        "Past": ["previously", "before", "i have", "i've", "experience", "graduated", "worked on", "last year",
                 "my background", "started"],
        "Future": ["looking for", "next step", "excited", "this role", "i want to", "i'd like to", "join",
                   "opportunity", "future", "grow"],
    },
    "PREP": {
        "Point": ["i believe", "my answer", "i would", "i'm confident", "the main", "i want", "because i",
                  "i am", "i'm"],
        "Reason": ["because", "the reason", "since", "that's why", "which means"],
        "Example": ["for example", "for instance", "when i", "in my last", "at my", "such as", "once"],
        "Point again": ["that's why", "so i", "overall", "in short", "to sum up", "which is why", "so that's"],
    },
    "CAR": {
        "Challenge": ["problem", "challenge", "weakness", "difficult", "struggled", "gap", "mistake", "issue"],
        "Action": ["i started", "i decided", "i am working", "i'm working", "i took", "i practise", "i practice",
                   "course", "i asked", "i changed", "so i"],
        "Result": ["now", "improved", "better", "learned", "result", "since then", "progress", "today"],
    },
}
NUMBER_RE = re.compile(r"\b\d[\d,.]*\s*(%|percent|x|k|lakh|crore|million|hours|days|weeks|months|people|users|"
                       r"customers|clients)?\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|"
                       r"hundred|thousand)\b")


def _clamp(v: float) -> float:
    return float(max(0.0, min(100.0, v)))


def _has(text: str, phrase: str) -> bool:
    if not phrase[0].isalnum():
        return phrase in text
    return re.search(rf"(?<![\w']){re.escape(phrase)}(?![\w'])", text) is not None


def _count(text: str, phrase: str) -> int:
    return len(re.findall(rf"(?<![\w']){re.escape(phrase)}(?![\w'])", text))


def relevance(answer: str, reference: str) -> float:
    """Cosine similarity (0-1) between TF-IDF vectors of the answer and what a strong answer covers."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    try:
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True).fit([reference, answer])
    except ValueError:  # nothing but stop words
        return 0.0
    m = vec.transform([reference, answer])
    return float(cosine_similarity(m[0], m[1])[0, 0])


def _item(key, label, score, detail, tip):
    return {"key": key, "label": label, "score": round(_clamp(score), 1), "detail": detail, "tip": tip}


# ------------------------------------------------------------------------------------------------ content
def content_items(report: dict, question: dict, field: dict) -> tuple[list[dict], dict]:
    transcript = report.get("transcript", "")
    text = " " + transcript.lower() + " "
    m = report["metrics"]
    words = max(m["words"], 1)

    # relevance (ML): answer vs question + expected points + field vocabulary
    reference = " ".join([question["q"], question["looks_for"], " ".join(question["outline"]),
                          " ".join(question["points"]), " ".join(field["keywords"])])
    sim = relevance(transcript, reference)
    hits = sorted({k for k in question["points"] + field["keywords"] if _has(text, k)})
    # short answers vs. a long reference give low raw cosine values, so 0.10 already means clearly on topic
    rel = 0.5 * _clamp(sim / 0.10 * 100) + 0.5 * min(1.0, len(hits) / 5) * 100
    missing = [k for k in question["points"] if k not in hits][:5]
    items = [_item("relevance", "Relevance to the question", rel,
                   f"Similarity to a strong answer {sim:.2f} · mentioned: {', '.join(hits[:8]) or 'none of the key ideas'}",
                   "Answer the exact question in your first sentence, then cover: " + ", ".join(missing) + "."
                   if rel < 70 else "On topic." + (" You could also touch on: " + ", ".join(missing[:3]) + "."
                                                    if missing else ""))]

    # structure: does the answer follow the recommended framework?
    fw = question["framework"]
    cues = STRUCTURE_CUES[fw]
    parts = {part: any(_has(text, c) for c in phrases) for part, phrases in cues.items()}
    numbers = len(NUMBER_RE.findall(transcript.lower()))
    struct = 100 * sum(parts.values()) / len(parts)
    if fw in ("STAR", "CAR") and numbers == 0:
        struct -= 10
    missing_parts = [p for p, ok in parts.items() if not ok]
    items.append(_item("structure", f"Structure ({FRAMEWORKS[fw]['label']})", struct,
                       " · ".join(f"{'✓' if ok else '✗'} {p}" for p, ok in parts.items()) + f" · {numbers} number(s)",
                       f"Add the missing part{'s' if len(missing_parts) > 1 else ''}: {', '.join(missing_parts)}. "
                       + ("Quantify the result (%, time, money, people)." if numbers == 0 else "")
                       if missing_parts or numbers == 0 else "Clear structure — keep each part to 1–2 sentences."))

    # vocabulary: power verbs, weak phrases and variety
    power = sorted({v for v in POWER_VERBS if _has(text, v)})
    swaps = [{**s, "count": n} for s in WORD_SWAPS if (n := _count(text, s["weak"]))]
    if any(s["weak"] == "like" for s in swaps):  # "like" is often legitimate ("I'd like to", "looks like")
        n_like = _count(text, "like") - _count(text, "i'd like") - _count(text, "would like") - _count(text, "looks like")
        swaps = [s if s["weak"] != "like" else {**s, "count": n_like} for s in swaps if s["weak"] != "like" or n_like > 1]
    content = [w for w in re.findall(r"[a-z']+", text) if len(w) > 3]
    variety = len(set(content)) / max(len(content), 1)
    weak_total = sum(s["count"] for s in swaps)
    vocab = 45 * min(1.0, len(power) / 3) + 35 * _clamp((variety - 0.45) / 0.3 * 100) / 100 + 20 \
        - 6 * weak_total * 100 / words
    items.append(_item("vocabulary", "Vocabulary", vocab,
                       f"Power verbs: {', '.join(power) or 'none'} · {weak_total} weak phrase(s) · "
                       f"word variety {variety:.0%}",
                       ("Swap: " + "; ".join(f"“{s['weak']}” → {s['strong']}" for s in swaps[:3]) + ". ")
                       * bool(swaps) + ("Start achievement sentences with verbs like led, built, improved."
                                        if len(power) < 2 else "")
                       or "Strong, specific wording — keep using numbers and action verbs."))

    # opening: the first ~15 words set the impression
    first = report.get("words", [])[:15]
    first_text = " " + " ".join(w["word"] for w in first).lower() + " "
    open_fillers = sum(1 for w in first if w.get("filler"))
    open_hedges = sum(_count(first_text, h) for h in ("i think", "maybe", "i guess", "kind of", "sort of", "so yeah"))
    opening = 100 - 22 * open_fillers - 18 * open_hedges
    items.append(_item("opening", "Strong opening", opening,
                       f"First words: “{' '.join(w['word'] for w in first[:10])}…” · {open_fillers} filler(s), "
                       f"{open_hedges} hedge(s)",
                       "Memorise your first sentence word for word and start with a clear, direct statement."
                       if opening < 85 else "Confident start."))

    # length: 45-120 s is ideal for most answers
    dur = m["duration_sec"]
    length = 100 - max(0.0, 45 - dur) * 2 - max(0.0, dur - 120) * 1.2
    items.append(_item("length", "Answer length", length, f"{dur:.0f} s · {m['words']} words (ideal 45–120 s)",
                       "Good length." if length >= 90 else "Too short — add an example and the result."
                       if dur < 45 else "Too long — cut the background, lead with the result."))
    return items, {"framework": fw, "parts": parts, "swaps": swaps, "power_verbs": power, "keywords_hit": hits}


# ----------------------------------------------------------------------------------------------- presence
def presence_items(p: dict) -> list[dict]:
    items = []
    if p.get("eye_contact") is not None:
        ec = float(p["eye_contact"])
        items.append(_item("eye_contact", "Eye contact", ec, f"Looking at the camera {ec:.0f}% of the time",
                           "Look at the lens when you speak — put the call window right under the camera."
                           if ec < 70 else "Good eye contact."))
    if p.get("smile_pct") is not None:
        s = float(p["smile_pct"])
        score = 100 if 15 <= s <= 60 else 55 + 3 * s if s < 15 else 100 - (s - 60) * 1.2
        items.append(_item("smile", "Smile & warmth", score, f"Smiling {s:.0f}% of the time (natural: 15–60%)",
                           "Smile when you greet, when you finish, and when you talk about what you enjoy."
                           if s < 15 else "A constant smile can look nervous — relax it during serious parts."
                           if s > 60 else "Warm and natural."))
    if p.get("expressiveness") is not None:
        e = float(p["expressiveness"])
        score = 55 + e * 15 if e < 3 else 100 if e <= 12 else 100 - (e - 12) * 3
        items.append(_item("expression", "Facial expression", score,
                           f"Expressiveness {e:.1f} (lively: 3–12)",
                           "Your face stayed very still — let your expression follow your story (serious for the "
                           "challenge, brighter for the result)." if e < 3 else
                           "Lots of movement — keep a calm, steady face between key points." if e > 12 else
                           "Natural, engaged expression."))
    if p.get("face_size"):
        size, off, tilt = float(p["face_size"]), float(p.get("center_offset", 0)), float(p.get("head_tilt", 0))
        frame_score = 100 - max(0, 0.16 - size) * 400 - max(0, size - 0.45) * 250 - max(0, off - 0.1) * 300
        items.append(_item("framing", "Framing", frame_score,
                           f"Face fills {size:.0%} of the width · {off:.2f} off-centre",
                           "Move closer — frame your head and shoulders." if size < 0.16 else
                           "Move back a little — leave space above your head and show your shoulders." if size > 0.45
                           else "Centre yourself in the frame." if off > 0.1 else "Well framed."))
        items.append(_item("posture", "Head posture", 100 - max(0, tilt - 5) * 6, f"Average head tilt {tilt:.0f}°",
                           "Keep your head level and sit upright — a tilted head reads as unsure." if tilt > 8
                           else "Upright, level posture."))
    if p.get("brightness"):
        b, c = float(p["brightness"]), float(p.get("contrast", 40))
        light = 100 - max(0, 85 - b) * 1.6 - max(0, b - 190) * 2 - max(0, 30 - c) * 2
        items.append(_item("lighting", "Lighting", light, f"Brightness {b:.0f}/255 · contrast {c:.0f}",
                           "Too dark — face a window or put a lamp behind your camera." if b < 85 else
                           "Too bright / washed out — soften the light or move away from the window." if b > 190 else
                           "Flat image — add light from the front and avoid a bright window behind you." if c < 30
                           else "Good lighting."))
    if p.get("sharpness"):
        sh, height = float(p["sharpness"]), int(p.get("height") or 0)
        cam = min(100.0, sh / 120 * 100) * 0.6 + (100 if height >= 720 else 75 if height >= 480 else 45) * 0.4
        items.append(_item("camera", "Camera quality", cam,
                           f"Sharpness {sh:.0f} · {p.get('width', '?')}×{height or '?'}",
                           "Blurry picture — clean the lens, add light and keep the camera steady." if sh < 40 else
                           "Use an HD (720p+) camera or your phone's front camera for a sharper picture."
                           if height and height < 720 else "Sharp, clear picture."))
    return items


# ------------------------------------------------------------------------------------------------ overall
def _section(key, label, items):
    total = sum(i.get("weight", 1.0) for i in items)
    score = sum(i["score"] * i.get("weight", 1.0) for i in items) / total if items else None
    return {"key": key, "label": label, "score": None if score is None else round(score, 1), "items": items}


def level(score: float) -> str:
    if score >= 85:
        return "Interview-ready — polish the details"
    if score >= 70:
        return "Strong — a few things to sharpen"
    if score >= 55:
        return "Getting there — practise the weak spots"
    return "Needs practice — focus on the top tips below"


def answer_feedback(report: dict, question: dict, field_key: str = "general", presence: dict | None = None) -> dict:
    field = FIELDS.get(field_key, FIELDS["general"])
    delivery = report.get("conversation") or conversation_feedback(report, "interview")
    content, extra = content_items(report, question, field)
    # the most specific suggestion (measured problem) beats the general interview advice, except for interaction
    # where the interview advice (check-ins, questions at the end) fits better than generic chat advice
    delivery_items = [{**_item(a["key"], a["label"], a["score"], " · ".join(a["evidence"][:2]),
                               a["suggestions"][1] if len(a["suggestions"]) > 1 and a["key"] != "interaction"
                               else a["suggestions"][0]),
                       "weight": a["weight"] / 20} for a in delivery["areas"] if a["key"] != "focus"]
    p = dict(presence or {})
    if p.get("eye_contact") is None and report["metrics"].get("eye_contact") is not None:
        p["eye_contact"] = report["metrics"]["eye_contact"]
    sections = [_section("content", "Content", content), _section("delivery", "Delivery", delivery_items)]
    pres = presence_items(p)
    if pres:
        sections.append(_section("presence", "Presence & camera", pres))
    weights = {"content": 0.4, "delivery": 0.35, "presence": 0.25}
    used = [s for s in sections if s["score"] is not None]
    readiness = sum(s["score"] * weights[s["key"]] for s in used) / sum(weights[s["key"]] for s in used)
    # tips first for what costs the most: the gap to 100, scaled by how much the area counts for interviews
    weakest = sorted((i for s in sections for i in s["items"]),
                     key=lambda i: -(100 - i["score"]) * i.get("weight", 1.0))[:3]
    return {
        "readiness": round(readiness, 1),
        "level": level(readiness),
        "field": field_key if field_key in FIELDS else "general",
        "field_label": field["label"],
        "question": question,
        "framework": FRAMEWORKS[extra["framework"]],
        "structure": [{"part": k, "done": v} for k, v in extra["parts"].items()],
        "swaps": extra["swaps"],
        "power_verbs": extra["power_verbs"],
        "keywords_hit": extra["keywords_hit"],
        "sections": sections,
        "top_tips": [{"label": i["label"], "tip": i["tip"], "score": i["score"]} for i in weakest],
        "dress": field["dress"],
    }
