"""Speech-coach result widgets and audio decoding, shared by the Speech Coach page and the AI Lab."""
import html

import plotly.graph_objects as go
import streamlit as st

from utils.ui import focus_gauge, metric_card
from utils.video import ROOT  # noqa: F401  (puts backend/ on sys.path)

from speech.analyzer import LABELS  # noqa: E402
from speech.audio import decode_audio  # noqa: E402,F401  (re-exported for the AI Lab)


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


AREA_ICONS = {"fluency": "🌊", "word_confidence": "💬", "focus": "👀", "interaction": "🤝", "voice_modulation": "🎚️"}
STATUS_COLORS = {"Excellent": "#22c55e", "Good": "#38bdf8", "Needs improvement": "#eab308", "Weak": "#ef4444"}


def area_radar(areas: list[dict]):
    labels = [a["label"] for a in areas]
    vals = [a["score"] for a in areas]
    fig = go.Figure(go.Scatterpolar(r=vals + vals[:1], theta=labels + labels[:1], fill="toself",
                                    line_color="#38bdf8", fillcolor="rgba(56,189,248,.3)"))
    fig.update_layout(height=280, margin=dict(l=50, r=50, t=20, b=20), paper_bgcolor="rgba(0,0,0,0)",
                      font_color="#94a3b8", showlegend=False,
                      polar=dict(bgcolor="rgba(0,0,0,0)", radialaxis=dict(range=[0, 100], visible=False),
                                 angularaxis=dict(gridcolor="#1e2a44")))
    return fig


def area_card(a: dict, type_label: str) -> str:
    color = STATUS_COLORS.get(a["status"], "#38bdf8")
    esc = html.escape
    evidence = "".join(f"<li>{esc(e)}</li>" for e in a["evidence"])
    tips = "".join(f"<li>{esc(s)}</li>" for s in a["suggestions"])
    drill = f"<div class='drill'>🏋️ {esc(a['drill'])}</div>" if a.get("drill") else ""
    return (f"<div class='fl-area' style='--a:{color}'><div class='hd'><span>{AREA_ICONS.get(a['key'], '')} "
            f"{esc(a['label'])}</span><span class='chip'>{esc(a['status'])}</span></div>"
            f"<div class='sc'>{a['score']:.0f}<small>%</small></div>"
            f"<div class='bar'><div style='width:{a['score']}%'></div></div>"
            f"<div class='lg'><span>✓ {a['score']:.0f}% strong</span>"
            f"<span>⚠ {a['needs_improvement']:.0f}% needs improvement</span></div>"
            f"<ul>{evidence}</ul><b>How to improve</b><ol>{tips}</ol>{drill}"
            f"<div style='font-size:.75rem;color:#94a3b8;margin-top:6px'>Counts {a['weight']}% of your score for "
            f"{esc(type_label.lower())}</div></div>")


def render_conversation(rep: dict, wav: bytes | None = None, full_report: bool = True):
    """Five-area conversation feedback; falls back to the plain speech report for older results.

    `full_report=False` leaves out the speech-report expander (for use inside another expander).
    """
    c = rep.get("conversation")
    if not c:
        return render(rep, wav)
    g, mid, r = st.columns([1, 1.3, 1.3])
    g.plotly_chart(focus_gauge(c["overall"], f"{c['type_label']} score"), use_container_width=True)
    g.markdown(f"<div style='text-align:center'><b>{c['status']}</b></div>", unsafe_allow_html=True)
    with mid:
        st.markdown(f"#### {c['summary']}")
        by = {a["key"]: a for a in c["areas"]}
        best, worst = by[c["best_area"]], by[c["focus_area"]]
        a, b = st.columns(2)
        metric_card(a, f"{AREA_ICONS[best['key']]} {best['score']:.0f}%", f"Strongest · {best['label']}")
        metric_card(b, f"{AREA_ICONS[worst['key']]} {worst['needs_improvement']:.0f}%", f"To improve · {worst['label']}")
        if wav:
            st.audio(wav, format="audio/wav")
    r.plotly_chart(area_radar(c["areas"]), use_container_width=True)

    st.subheader("🧭 Your areas — weakest first")
    cols = st.columns(3)
    for i, a in enumerate(sorted(c["areas"], key=lambda x: x["score"])):
        cols[i % 3].markdown(area_card(a, c["type_label"]), unsafe_allow_html=True)

    left, right = st.columns(2)
    with left:
        st.subheader("📝 What you said")
        st.markdown(highlighted_transcript(rep["words"]), unsafe_allow_html=True)
    with right:
        st.subheader("✨ Say it like this")
        st.info(rep["improved"] or "—")
    if full_report:
        with st.expander("Full speech report (pace, pronunciation, tips)"):
            render(rep)


def _score_color(v: float) -> str:
    return "#22c55e" if v >= 85 else "#38bdf8" if v >= 70 else "#eab308" if v >= 50 else "#ef4444"


def section_card(s: dict) -> str:
    esc = html.escape
    rows = "".join(
        f"<div style='margin:10px 0;--a:{_score_color(i['score'])}'><div class='hd' style='font-size:.9rem'>"
        f"<span>{esc(i['label'])}</span><span style='color:var(--a)'>{i['score']:.0f}%</span></div>"
        f"<div class='bar' style='height:7px'><div style='width:{i['score']}%'></div></div>"
        f"<div style='font-size:.78rem;color:#94a3b8;margin-top:3px'>{esc(i['detail'])}</div>"
        f"<div style='font-size:.85rem'>→ {esc(i['tip'])}</div></div>"
        for i in s["items"])
    icon = {"content": "🧠", "delivery": "🎙️", "presence": "🎥"}.get(s["key"], "")
    return (f"<div class='fl-area' style='--a:{_score_color(s['score'])}'><div class='hd'><span>{icon} "
            f"{esc(s['label'])}</span><span class='sc' style='font-size:1.6rem;margin:0'>{s['score']:.0f}%</span>"
            f"</div>{rows}</div>")


def render_interview(rep: dict, wav: bytes | None = None):
    """Mock-interview feedback: readiness, content / delivery / presence, structure, vocabulary, delivery detail."""
    iv = rep.get("interview")
    if not iv:
        return render_conversation(rep, wav)
    g, info = st.columns([1, 2])
    g.plotly_chart(focus_gauge(iv["readiness"], "Interview readiness"), use_container_width=True)
    g.markdown(f"<div style='text-align:center'><b>{iv['level']}</b></div>", unsafe_allow_html=True)
    with info:
        st.caption(f"{iv['field_label']} · {iv['question']['category']}")
        st.markdown(f"#### “{iv['question']['q']}”")
        st.markdown("**Do this next**")
        for i, t in enumerate(iv["top_tips"], 1):
            st.markdown(f"{i}. **{t['label']}:** {t['tip']}")
        if wav:
            st.audio(wav, format="audio/wav")

    cols = st.columns(len(iv["sections"]))
    for col, s in zip(cols, iv["sections"]):
        col.markdown(section_card(s), unsafe_allow_html=True)

    a, b, c = st.columns(3)
    with a:
        st.subheader(f"🧩 {iv['framework']['label']}")
        for p in iv["structure"]:
            st.markdown(f"{'✅' if p['done'] else '⬜'} {p['part']}")
        st.markdown("**A strong answer covers**")
        for o in iv["question"]["outline"]:
            st.markdown(f"- {o}")
    with b:
        st.subheader("📖 Vocabulary")
        if iv["swaps"]:
            st.table([{"Weak": f"{s['weak']} ×{s['count']}", "Say instead": s["strong"]} for s in iv["swaps"]])
        else:
            st.success("No weak phrases found.")
        st.caption("Power verbs used: " + (", ".join(iv["power_verbs"]) or "none yet"))
    with c:
        st.subheader("⚠️ Avoid")
        for p in iv["question"]["pitfalls"]:
            st.markdown(f"- {p}")
        st.markdown(f"**👔 Dress:** {iv['dress']}")
    with st.expander("Delivery in detail — fluency, word confidence, interaction, voice modulation, transcript"):
        render_conversation(rep, full_report=False)
