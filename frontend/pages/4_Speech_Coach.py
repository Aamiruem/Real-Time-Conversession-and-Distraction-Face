"""Speech Coach: talk to the camera and get pronunciation, pace, filler-word and confidence coaching."""
import html
import random
import time

import streamlit as st
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.speech_view import render
from utils.ui import page_header, require_login, setup, state_badge
from utils.video import (MEDIA_CONSTRAINTS_WITH_MIC, RTC_CONFIGURATION, AttentionProcessor, AudioCollector,
                         to_wav)

from speech.analyzer import analyze  # noqa: E402  (repo root is put on sys.path by utils.video)

setup("Speech Coach", "🗣️")
require_login()

TOPICS = [
    "Introduce yourself as if you were starting a job interview.",
    "Describe a project you are proud of and the hardest problem you solved in it.",
    "Convince your team to adopt an idea you believe in.",
    "Explain what you do to a 10-year-old.",
    "Tell a story about a time you failed and what you learned.",
    "What are your strengths and how have you used them recently?",
    "Pitch a product you use every day in 60 seconds.",
    "Give feedback to a colleague whose work needs improvement — kindly but clearly.",
]
PASSAGES = [
    "The quick brown fox jumps over the lazy dog. She sells sea shells by the sea shore.",
    "Thank you all for coming today. I am confident that this plan will help our team deliver better results, "
    "faster and with fewer mistakes.",
    "Peter Piper picked a peck of pickled peppers. Red lorry, yellow lorry. Unique New York.",
    "Technology is best when it brings people together. Our product makes collaboration simple, reliable and "
    "secure for everyone.",
    "Particularly, the specific statistics show a significant improvement in the thoroughness of our research.",
]
MIN_SECONDS = 4

page_header("🗣️ Speech Coach", "Speak to the camera. You get a confidence score from your voice, words and eye "
            "contact — plus pronunciation feedback and a concrete way to say it better.",
            eyebrow="Speech AI", highlight="Speech Coach")

# ---------------- sidebar: exercise
with st.sidebar:
    st.subheader("🎯 Exercise")
    mode = st.radio("Mode", ["free", "read"], horizontal=True,
                    format_func=lambda m: "🎤 Free talk" if m == "free" else "📖 Read aloud")
    if mode == "free":
        shuffle = st.button("🔀 New topic", use_container_width=True)
        if shuffle or "coach_topic" not in st.session_state:
            st.session_state["coach_topic"] = random.choice(TOPICS)
        custom = st.text_input("…or your own topic", placeholder="e.g. Answer: why should we hire you?")
        prompt = custom.strip() or st.session_state["coach_topic"]
    else:
        idx = st.selectbox("Passage", range(len(PASSAGES)), format_func=lambda i: PASSAGES[i][:40] + "…")
        prompt = PASSAGES[idx]
    model_size = st.selectbox("Speech model", ["base.en", "small.en"],
                              help="small.en recognises pronunciation more accurately but is ~3× slower")

label = "Talk about" if mode == "free" else "Read this aloud, clearly"
st.markdown(f"<div class='prompt-card'><div class='l'>{label}</div>{html.escape(prompt)}</div>",
            unsafe_allow_html=True)


# ---------------- live recording: camera (eye contact) + microphone
left, right = st.columns([3, 2])
with left:
    ctx = webrtc_streamer(
        key="speech-coach",
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
    st.session_state.pop("coach_result", None)  # a new take replaces the previous result
    while ctx.state.playing:
        vp, ap = ctx.video_processor, ctx.audio_processor
        if vp is None or ap is None:
            time.sleep(0.2)
            continue
        st.session_state["coach_take"] = (vp, ap, mode, prompt)
        fm = vp.detector.metrics()
        with live.container():
            state_badge(fm.state, fm.focus_pct)
            st.progress(min(max((ap.level_db + 60) / 50, 0.0), 1.0), text=f"🎙️ Mic level {ap.level_db:.0f} dB")
            st.markdown(f"⏺️ **Recording** `{ap.seconds:.0f}s` · 👀 eye contact `{fm.focus_pct:.0f}%`")
            if fm.state != "Focused":
                st.caption("👉 Look at the camera lens while you speak.")
            elif ap.seconds > 3 and ap.level_db < -50:
                st.caption("🔈 I can barely hear you — speak up or move closer to the mic.")
            else:
                st.caption("✅ Good — keep going. Press **STOP** when you are done.")
        time.sleep(0.3)

# ---------------- after STOP: analyse, save, show
take = st.session_state.pop("coach_take", None)
if take and not ctx.state.playing:
    vp, ap, take_mode, take_prompt = take
    audio = ap.audio()
    if len(audio) < MIN_SECONDS * 16000:
        st.warning(f"Recording too short — speak for at least {MIN_SECONDS} seconds, then press STOP.")
    else:
        with st.spinner("Analysing your speech… (the first run downloads the speech model, ~150 MB)"):
            rep = analyze(audio, eye_contact=vp.detector.metrics().focus_pct,
                          passage=take_prompt if take_mode == "read" else None, model_size=model_size)
        if rep.get("error"):
            st.warning(rep["error"])
        else:
            try:
                saved = api.save_speech(rep, take_mode, take_prompt)
                st.session_state["coach_result"] = {"id": saved["id"], "report": rep, "wav": to_wav(audio)}
            except api.APIError as e:
                st.error(f"Could not save the result: {e}")
                st.session_state["coach_result"] = {"id": None, "report": rep, "wav": to_wav(audio)}

if not ctx.state.playing:
    result = st.session_state.get("coach_result")
    if result:
        st.divider()
        if result["id"]:
            st.caption(f"✅ Saved as speech session #{result['id']} — see your progress in **Analytics**.")
        render(result["report"], result["wav"])
    else:
        try:
            last = api.latest_speech()
        except api.APIError:
            last = None
        if last and last.get("report"):
            st.divider()
            st.caption(f"Your last analysis · {last['created_at'][:16].replace('T', ' ')} UTC · "
                       f"prompt: “{last['prompt'][:80]}”")
            render(last["report"])
        else:
            st.info("Press **START**, allow camera + microphone access, speak for 30–60 seconds, then press "
                    "**STOP** to get your feedback.")
