"""Interview Prep: mock interviews scored for content, delivery and on-camera presence, plus the full preparation
guide (getting the interview, first impression, dressing, body language, voice, vocabulary) for any job field."""
import html
import time

import streamlit as st
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.speech_view import render_interview
from utils.ui import page_header, require_login, setup, state_badge
from utils.video import MEDIA_CONSTRAINTS_WITH_MIC, RTC_CONFIGURATION, AudioCollector, InterviewProcessor, to_wav

from interview.coach import answer_feedback  # noqa: E402  (backend/ is put on sys.path by utils.video)
from interview.knowledge import FIELDS, FRAMEWORKS, GUIDE, POWER_VERBS, WORD_SWAPS, all_questions  # noqa: E402
from speech.analyzer import analyze  # noqa: E402
from speech.conversation import conversation_feedback  # noqa: E402

setup("Interview Prep", "💼")
require_login()

MIN_SECONDS = 8

page_header("💼 Interview Prep", "Practise real interview questions on camera. AI scores your answer's content, "
            "your delivery and your on-camera presence — and the guide covers everything from getting the "
            "interview to the follow-up email.", eyebrow="AI interview coach · any field", highlight="Interview Prep")

# ---------------- sidebar: field + question
with st.sidebar:
    st.subheader("💼 Interview")
    field = st.selectbox("Job field", list(FIELDS), format_func=lambda k: f"{FIELDS[k]['icon']} {FIELDS[k]['label']}")
    questions = all_questions(field)
    by_id = {q["id"]: q for q in questions}
    if st.session_state.get("iv_qid") not in by_id:
        st.session_state["iv_qid"] = questions[0]["id"]
    if st.button("⏭️ Next question", use_container_width=True):
        ids = list(by_id)
        st.session_state["iv_qid"] = ids[(ids.index(st.session_state["iv_qid"]) + 1) % len(ids)]
    qid = st.selectbox("Question", list(by_id), key="iv_qid",
                       format_func=lambda i: f"[{by_id[i]['category']}] {by_id[i]['q'][:55]}")
    model_size = st.selectbox("Speech model", ["base.en", "small.en"],
                              help="small.en recognises words more accurately but is ~3× slower")
q = by_id[qid]
fw = FRAMEWORKS[q["framework"]]


def question_details(q: dict):
    st.markdown(f"**They look for:** {q['looks_for']}")
    st.markdown(" → ".join(f"`{s.split(' —')[0]}`" for s in FRAMEWORKS[q["framework"]]["steps"]))
    a, b = st.columns(2)
    a.markdown("**Answer outline**\n" + "\n".join(f"{i}. {o}" for i, o in enumerate(q["outline"], 1)))
    b.markdown("**Avoid**\n" + "\n".join(f"- {p}" for p in q["pitfalls"]))


t_mock, t_guide, t_bank, t_vocab = st.tabs(["🎬 Mock interview", "📘 Prep guide", "❓ Question bank",
                                            "📖 Vocabulary & voice"])

# ---------------- mock interview
with t_mock:
    st.markdown(f"<div class='prompt-card'><div class='l'>{html.escape(q['category'])} · {fw['label']}</div>"
                f"{html.escape(q['q'])}</div>", unsafe_allow_html=True)
    with st.expander("💡 Hints for this question"):
        question_details(q)

    left, right = st.columns([3, 2])
    with left:
        ctx = webrtc_streamer(
            key="interview-prep",
            mode=WebRtcMode.SENDRECV,
            rtc_configuration=RTC_CONFIGURATION,
            media_stream_constraints=MEDIA_CONSTRAINTS_WITH_MIC,
            video_processor_factory=InterviewProcessor,
            audio_processor_factory=AudioCollector,
            async_processing=True,
        )
        st.caption("Press **START**, answer the question (45–120 s), then press **STOP** for your feedback.")
    with right:
        live = st.empty()
        f = FIELDS[field]
        st.markdown(f"<div class='fl-card'><h3>{f['icon']} {html.escape(f['label'])}</h3><p><b>Dress:</b> "
                    f"{html.escape(f['dress'])}</p><p style='margin-top:6px'><b>Skills they test:</b> "
                    f"{html.escape(', '.join(f['skills']))}</p></div>", unsafe_allow_html=True)

    if ctx.state.playing:
        st.session_state.pop("iv_result", None)
        while ctx.state.playing:
            vp, ap = ctx.video_processor, ctx.audio_processor
            if vp is None or ap is None:
                time.sleep(0.2)
                continue
            st.session_state["iv_take"] = (vp, ap, field, qid)
            fm, pr = vp.detector.metrics(), vp.detector.presence()
            with live.container():
                state_badge(fm.state, fm.focus_pct)
                st.progress(min(max((ap.level_db + 60) / 50, 0.0), 1.0), text=f"🎙️ Voice {ap.level_db:.0f} dB")
                light = "too dark" if pr["brightness"] < 85 else "too bright" if pr["brightness"] > 190 else "good"
                sharp = "blurry" if pr["sharpness"] < 40 else "sharp"
                st.markdown(f"⏺️ `{ap.seconds:.0f}s` · 👀 eye contact `{fm.focus_pct:.0f}%` · 💡 light **{light}** · "
                            f"🔍 **{sharp}** · 📷 `{pr['width']}×{pr['height']}`")
                b = vp.body.live
                in_frame = ", ".join(b["objects"] + ([f"{b['people']} people"] if b["people"] > 1 else [])) or "clear"
                st.markdown(f"🧍 posture **{b['posture']}** · ✋ hands **{'touching face' if b['touching'] else b['hands']}**"
                            f" · 👐 gestures **{b['gesture']}** · 📱 in frame **{in_frame}**")
                if fm.state != "Focused":
                    st.caption("👉 Look at the camera lens.")
                elif ap.seconds < 45:
                    st.caption("✅ Give an example and a result — aim for 45–120 s.")
                else:
                    st.caption("✅ Great length — finish with your result, then press STOP.")
            time.sleep(0.3)

    take = st.session_state.pop("iv_take", None)
    if take and not ctx.state.playing:
        vp, ap, take_field, take_qid = take
        audio = ap.audio()
        if len(audio) < MIN_SECONDS * 16000:
            st.warning(f"Answer too short — speak for at least {MIN_SECONDS} seconds, then press STOP.")
        else:
            with st.spinner("Analysing your answer — transcript, content, delivery and presence…"):
                presence = {**vp.detector.presence(), **vp.body.summary()}
                rep = analyze(audio, eye_contact=presence["eye_contact"], model_size=model_size)
            if rep.get("error"):
                st.warning(rep["error"])
            else:
                question = {x["id"]: x for x in all_questions(take_field)}[take_qid]
                rep["conversation"] = conversation_feedback(rep, "interview")
                rep["interview"] = answer_feedback(rep, question, take_field, presence)
                label = f"[Interview · {FIELDS[take_field]['label']}] {question['q']}"
                try:
                    saved = api.save_speech(rep, "interview", label)
                    st.session_state["iv_result"] = {"id": saved["id"], "report": rep, "wav": to_wav(audio)}
                except api.APIError as e:
                    st.error(f"Could not save the result: {e}")
                    st.session_state["iv_result"] = {"id": None, "report": rep, "wav": to_wav(audio)}

    if not ctx.state.playing:
        result = st.session_state.get("iv_result")
        if result:
            st.divider()
            if result["id"]:
                st.caption(f"✅ Saved as session #{result['id']} — see your progress in **Analytics**.")
            render_interview(result["report"], result["wav"])
        else:
            try:
                last = api.latest_speech()
            except api.APIError:
                last = None
            if last and (last.get("report") or {}).get("interview"):
                st.divider()
                st.caption(f"Your last mock-interview answer · {last['created_at'][:16].replace('T', ' ')} UTC")
                render_interview(last["report"])

# ---------------- preparation guide
with t_guide:
    f = FIELDS[field]
    st.info(f"**{f['icon']} {f['label']}** — 👔 {f['dress']}  \n🎯 Skills they test: {', '.join(f['skills'])}")
    cols = st.columns(2)
    for i, s in enumerate(GUIDE):
        tips = "".join(f"<li>{html.escape(t)}</li>" for t in s["tips"])
        cols[i % 2].markdown(f"<div class='fl-card' style='margin-bottom:14px;height:auto'><h3>{s['icon']} "
                             f"{html.escape(s['title'])}</h3><p>{html.escape(s['intro'])}</p>"
                             f"<ul style='font-size:.9rem;margin-top:8px'>{tips}</ul></div>", unsafe_allow_html=True)

# ---------------- question bank
with t_bank:
    st.caption(f"{len(questions)} questions for {FIELDS[field]['label']} — choose one in the sidebar to practise it.")
    for cat in dict.fromkeys(x["category"] for x in questions):
        st.markdown(f"##### {cat}")
        for x in (x for x in questions if x["category"] == cat):
            with st.expander(f"{x['q']}  ·  {FRAMEWORKS[x['framework']]['label']}"):
                question_details(x)

# ---------------- vocabulary & voice
with t_vocab:
    a, b = st.columns([3, 2])
    with a:
        st.subheader("🔁 Say this, not that")
        st.table([{"Weak": s["weak"], "Strong": s["strong"], "Why": s["why"]} for s in WORD_SWAPS])
    with b:
        st.subheader("💪 Power verbs")
        st.markdown(" · ".join(dict.fromkeys(FIELDS[field]["power_words"] + POWER_VERBS)))
        for s in (s for s in GUIDE if s["id"] in ("voice", "answer")):
            st.subheader(f"{s['icon']} {s['title']}")
            st.markdown("\n".join(f"- {t}" for t in s["tips"]))
