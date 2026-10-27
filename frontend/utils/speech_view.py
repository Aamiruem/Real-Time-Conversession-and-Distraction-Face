"""Speech-coach result widgets and audio decoding, shared by the Speech Coach page and the AI Lab."""
import html
import io

import av
import numpy as np
import plotly.graph_objects as go
import streamlit as st

from utils.ui import focus_gauge, metric_card
from utils.video import ROOT  # noqa: F401  (puts the repo root on sys.path)

from speech.analyzer import LABELS, SAMPLE_RATE  # noqa: E402


def decode_audio(data: bytes) -> np.ndarray:
    """Any audio/video file (wav, mp3, m4a, ogg, webm…) -> float32 mono 16 kHz."""
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    chunks = []
    with av.open(io.BytesIO(data)) as container:
        for frame in container.decode(audio=0):
            chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
    chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    return (np.concatenate(chunks).astype(np.float32) / 32768.0) if chunks else np.zeros(0, np.float32)


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
