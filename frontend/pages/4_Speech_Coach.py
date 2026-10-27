"""Speech Coach: talk to the camera and get pronunciation, pace, filler-word and confidence coaching."""
import html
import random
import time

import plotly.graph_objects as go
import streamlit as st
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.ui import focus_gauge, metric_card, require_login, setup, state_badge
from utils.video import (MEDIA_CONSTRAINTS_WITH_MIC, RTC_CONFIGURATION, AttentionProcessor, AudioCollector,
                         to_wav)

from speech.analyzer import LABELS, analyze  # noqa: E402  (repo root is put on sys.path by utils.video)

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

st.title("🗣️ Speech Coach")
st.caption("Speak to the camera. You get a confidence score from your voice, words and eye contact — plus "
           "pronunciation feedback and a concrete way to say it better.")

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


# ---------------- result rendering
def score_bars(scores: dict):
    keys = list(scores)
    vals = [scores[k] for k in keys]
    colors = ["#22c55e" if v >= 75 else "#eab308" if v >= 50 else "#ef4444" for v in vals]
    fig = go.Figure(go.Bar(x=vals, y=[LABELS[k] for k in keys], orientation="h", marker_color=colors,
                           text=[f"{v:.0f}" for v in vals], textposition="outside"))
    fig.update_layout(height=260, margin=dict(l=10, r=30, t=10, b=10), xaxis=dict(range=[0, 110], visible=False),
                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font_color="#e2e8f0")
    fig.update_yaxes(autorange="reversed")
    return fig


def highlighted_transcript(words: list[dict]) -> str:
    out = []
    for w in words:
        cls = "w-filler" if w.get("filler") else "w-unclear" if w.get("unclear") else ""
        out.append(f"<span class='{cls}' title='{w['prob'] * 100:.0f}% clear'>{html.escape(w['word'])}</span>")
    return "<div class='transcript'>" + " ".join(out) + "</div>"


def render(rep: dict, wav: bytes | None = None):
    m = rep["metrics"]
    g, s = st.columns([1, 2])
    g.plotly_chart(focus_gauge(rep["confidence"], "Confidence"), use_container_width=True)
    g.markdown(f"<div style='text-align:center'><b>{rep['level']}</b></div>", unsafe_allow_html=True)
    s.plotly_chart(score_bars(rep["scores"]), use_container_width=True)

    cards = [
        (f"{m['wpm']}", "Words / min (120-160)"),
        (m["fillers"], "Filler words"),
        (m["long_pauses"], "Long pauses"),
        (f"{m['pitch_var_st']:.1f} st", "Pitch variety"),
        (f"{m['clarity_pct']:.0f}%", "Word clarity"),
        ("—" if m["eye_contact"] is None else f"{m['eye_contact']:.0f}%", "Eye contact"),
    ]
    if rep.get("reading"):
        cards.append((f"{rep['reading']['accuracy']:.0f}%", "Reading accuracy"))
    for col, (v, lbl) in zip(st.columns(len(cards)), cards):
        metric_card(col, v, lbl)

    if rep.get("strengths"):
        st.success("💪 **Strengths:** " + " · ".join(rep["strengths"]))

    st.subheader("🧭 How to sound more confident")
    for i, t in enumerate(rep["tips"], 1):
        st.markdown(f"**{i}. {t['title']}** — {t['detail']}")

    left, right = st.columns(2)
    with left:
        st.subheader("📝 What you said")
        st.markdown(highlighted_transcript(rep["words"]), unsafe_allow_html=True)
        st.caption("🟧 filler word · 🟥 unclear pronunciation (hover a word to see how clearly it was heard)")
    with right:
        st.subheader("✨ Say it like this")
        st.info(rep["improved"] or "—")
        st.caption("Your own words without fillers and hedges. Read it aloud with a steady voice, pause at each "
                   "full stop and finish sentences on a lower pitch.")
    reading = rep.get("reading")
    if reading and reading["misread"]:
        st.subheader("🔤 Pronunciation practice")
        st.table([{"Expected": p["expected"], "We heard": p["heard"]} for p in reading["misread"]])
    if wav:
        st.audio(wav, format="audio/wav")


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
