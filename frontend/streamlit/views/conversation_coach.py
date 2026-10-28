"""Conversation Coach: record a conversation and get fluency, word confidence, focus, interaction and voice
modulation scores with what to improve — tailored to the type of conversation (interview, sales, chat…)."""
import html
import time

import streamlit as st
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.speech_view import render_conversation
from utils.ui import page_header, require_login, setup, state_badge
from utils.video import (MEDIA_CONSTRAINTS_WITH_MIC, RTC_CONFIGURATION, AttentionProcessor, AudioCollector,
                         to_wav)

from speech.analyzer import analyze  # noqa: E402  (backend/ is put on sys.path by utils.video)
from speech.conversation import CONVERSATION_TYPES, conversation_feedback  # noqa: E402

setup("Conversation Coach", "🗨️")
require_login()

MIN_SECONDS = 5

page_header("🗨️ Conversation Coach", "Pick a conversation, record yourself and get a score for fluency, word "
            "confidence, focus, interaction and voice modulation — with what to improve and how.",
            eyebrow="Speech AI · conversation feedback", highlight="Conversation Coach")

# ---------------- sidebar: conversation type + scenario
with st.sidebar:
    st.subheader("🗨️ Conversation")
    ctype = st.selectbox("Type", list(CONVERSATION_TYPES),
                         format_func=lambda k: f"{CONVERSATION_TYPES[k]['icon']} {CONVERSATION_TYPES[k]['label']}")
    prompts = CONVERSATION_TYPES[ctype]["prompts"]
    key = f"conv_prompt_{ctype}"
    if st.button("🔀 New scenario", use_container_width=True):
        st.session_state[key] = (st.session_state.get(key, 0) + 1) % len(prompts)
    custom = st.text_input("…or your own scenario", placeholder="e.g. Ask my manager for a day off")
    prompt = custom.strip() or prompts[st.session_state.get(key, 0)]
    model_size = st.selectbox("Speech model", ["small.en", "base.en", "medium.en"],
                              help="small.en: accurate (recommended) · base.en: fastest · medium.en: most accurate, ~3× slower")

lo, hi = CONVERSATION_TYPES[ctype]["wpm"]
st.markdown(f"<div class='prompt-card'><div class='l'>{CONVERSATION_TYPES[ctype]['icon']} "
            f"{CONVERSATION_TYPES[ctype]['label']} · scenario</div>{html.escape(prompt)}"
            f"<div class='l' style='margin-top:6px'>Ideal pace {lo}–{hi} words/min · speak for 30–90 s</div></div>",
            unsafe_allow_html=True)

# ---------------- live recording: camera (focus) + microphone
left, right = st.columns([3, 2])
with left:
    ctx = webrtc_streamer(
        key="conversation-coach",
        mode=WebRtcMode.SENDRECV,
        rtc_configuration=RTC_CONFIGURATION,
        media_stream_constraints=MEDIA_CONSTRAINTS_WITH_MIC,
        video_processor_factory=AttentionProcessor,
        audio_processor_factory=AudioCollector,
        async_processing=True,
    )
with right:
    live = st.empty()

if ctx.state.playing:
    st.session_state.pop("conv_result", None)  # a new take replaces the previous result
    while ctx.state.playing:
        vp, ap = ctx.video_processor, ctx.audio_processor
        if vp is None or ap is None:
            time.sleep(0.2)
            continue
        st.session_state["conv_take"] = (vp, ap, ctype, prompt)
        fm = vp.detector.metrics()
        with live.container():
            state_badge(fm.state, fm.focus_pct)
            st.progress(min(max((ap.level_db + 60) / 50, 0.0), 1.0), text=f"🎙️ Mic level {ap.level_db:.0f} dB")
            st.markdown(f"⏺️ **Recording** `{ap.seconds:.0f}s` · 👀 eye contact `{fm.focus_pct:.0f}%`")
            if fm.state != "Focused":
                st.caption("👉 Look at the camera lens while you speak.")
            elif ap.seconds > 3 and ap.level_db < -50:
                st.caption("🔈 I can barely hear you — speak up or move closer to the mic.")
            elif ap.seconds < 30:
                st.caption("✅ Good — keep going, aim for at least 30 seconds.")
            else:
                st.caption("✅ Great length — press **STOP** when you are done.")
        time.sleep(0.3)

# ---------------- after STOP: analyse, save, show
take = st.session_state.pop("conv_take", None)
if take and not ctx.state.playing:
    vp, ap, take_type, take_prompt = take
    audio = ap.audio()
    if len(audio) < MIN_SECONDS * 16000:
        st.warning(f"Recording too short — speak for at least {MIN_SECONDS} seconds, then press STOP.")
    else:
        with st.spinner("Analysing your conversation… (the first run downloads the speech model, ~150 MB)"):
            rep = analyze(audio, eye_contact=vp.detector.metrics().focus_pct, model_size=model_size)
        if rep.get("error"):
            st.warning(rep["error"])
        else:
            rep["conversation"] = conversation_feedback(rep, take_type)
            label = f"[{CONVERSATION_TYPES[take_type]['label']}] {take_prompt}"
            try:
                saved = api.save_speech(rep, "conversation", label)
                st.session_state["conv_result"] = {"id": saved["id"], "report": rep, "wav": to_wav(audio)}
            except api.APIError as e:
                st.error(f"Could not save the result: {e}")
                st.session_state["conv_result"] = {"id": None, "report": rep, "wav": to_wav(audio)}

if not ctx.state.playing:
    result = st.session_state.get("conv_result")
    if result:
        st.divider()
        if result["id"]:
            st.caption(f"✅ Saved as speech session #{result['id']} — see your progress in **Analytics**.")
        render_conversation(result["report"], result["wav"])
    else:
        try:
            last = api.latest_speech()
        except api.APIError:
            last = None
        if last and (last.get("report") or {}).get("conversation"):
            st.divider()
            st.caption(f"Your last conversation analysis · {last['created_at'][:16].replace('T', ' ')} UTC · "
                       f"“{last['prompt'][:80]}”")
            render_conversation(last["report"])
        else:
            st.info("Pick a conversation type in the sidebar, press **START**, allow camera + microphone, talk "
                    "for 30–90 seconds, then press **STOP** for your feedback.")
