"""AI Lab: try every AI/ML technology in the project on its own — CV, NLP, Speech AI and the ML model."""
import cv2
import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from utils import api_client as api
from utils.speech_view import decode_audio, render
from utils.ui import metric_card, page_header, require_login, setup
from utils.video import ROOT, to_wav  # noqa: F401  (ROOT puts the repo root on sys.path)

from cv.attention_detector import AttentionDetector, Thresholds  # noqa: E402
from speech.analyzer import analyze as analyze_speech  # noqa: E402

setup("AI Lab", "🧪")
require_login()

page_header("🧪 AI Lab", "Each AI technology in FocusLink, isolated so you can try it, see how it works and what it "
            "outputs — from raw input to result.", eyebrow="Computer vision · NLP · Speech · Machine learning",
            highlight="AI Lab")

t_cv, t_nlp, t_speech, t_ml, t_arch = st.tabs(
    ["🎥 Computer vision", "💬 NLP", "🗣️ Speech AI", "🧠 Machine learning", "🏗️ Architecture"])


@st.cache_resource
def detector() -> AttentionDetector:
    return AttentionDetector()


# ============================================================== computer vision
with t_cv:
    st.markdown("**Pipeline:** image → MediaPipe Face Mesh (468 landmarks + iris) → eye aspect ratio, mouth "
                "aspect ratio, head pose (OpenCV solvePnP), iris gaze → attention verdict.")
    src = st.radio("Input", ["📷 Take a photo", "🖼️ Upload an image"], horizontal=True, key="cv_src")
    shot = st.camera_input("Look at the camera") if src.startswith("📷") else \
        st.file_uploader("Face photo", type=["jpg", "jpeg", "png", "webp"])
    if shot:
        img = cv2.imdecode(np.frombuffer(shot.getvalue(), np.uint8), cv2.IMREAD_COLOR)
        det = detector()
        det.reset()
        out = det.process(img.copy())
        m = det.metrics()
        t = Thresholds()
        a, b = st.columns([3, 2])
        a.image(cv2.cvtColor(out, cv2.COLOR_BGR2RGB), caption="Landmarks, head box and live metrics overlay",
                use_container_width=True)
        with b:
            if m.state == "No Face":
                st.warning("No face found — use a well-lit, front-facing photo.")
            else:
                eyes_closed = m.ear < t.ear_closed
                away = abs(m.yaw) > t.yaw_limit or abs(m.pitch) > t.pitch_limit or m.gaze != "center"
                verdict = "😴 Eyes closed" if eyes_closed else "👀 Looking away" if away else "🎯 Attentive"
                st.markdown(f"### {verdict}")
                c = st.columns(2)
                metric_card(c[0], f"{m.ear:.3f}", f"Eye aspect ratio (closed < {t.ear_closed})")
                metric_card(c[1], f"{m.mar:.2f}", f"Mouth ratio (yawn > {t.mar_yawn})")
                c = st.columns(3)
                metric_card(c[0], f"{m.yaw:.0f}°", f"Yaw (±{t.yaw_limit:.0f})")
                metric_card(c[1], f"{m.pitch:.0f}°", f"Pitch (±{t.pitch_limit:.0f})")
                metric_card(c[2], m.gaze, "Iris gaze")
                st.caption("In the live Focus Monitor these per-frame values are tracked over time: eyes closed > "
                           "1.2 s = drowsy, looking away > 1.5 s = distracted, and time in each state gives focus %.")

# ============================================================== NLP
with t_nlp:
    st.markdown("**Pipeline:** text → VADER sentiment (or Amazon Comprehend) → toxicity lexicon → keyword "
                "extraction → hedging vs. assertive phrasing → extractive summary.")
    sample = ("I think maybe we could sort of try the new plan, sorry if it's a bad idea. I will prepare the "
              "report by Friday and I recommend we test it with five users first. The last release was great!")
    text = st.text_area("Text to analyse", sample, height=120)
    if st.button("Analyse text", type="primary") and text.strip():
        try:
            r = api.analyze_text(text)
        except api.APIError as e:
            st.error(str(e))
        else:
            emoji = {"positive": "😊", "negative": "😟", "neutral": "😐"}[r["sentiment_label"]]
            c = st.columns(4)
            metric_card(c[0], f"{emoji} {r['sentiment_label']}", f"Sentiment ({r['sentiment_score']:+.2f})")
            metric_card(c[1], f"{r['confidence']:.0f}%", "Wording confidence")
            metric_card(c[2], "⚠️ yes" if r["is_toxic"] else "✅ no", "Toxic language")
            metric_card(c[3], f"{r['words']} / {r['sentences']}", "Words / sentences")
            a, b = st.columns(2)
            with a:
                d = r["sentiment_detail"]
                st.plotly_chart(px.bar(x=["negative", "neutral", "positive"], y=[d["neg"], d["neu"], d["pos"]],
                                       color=["negative", "neutral", "positive"], title="Sentiment mix",
                                       color_discrete_sequence=["#ef4444", "#94a3b8", "#22c55e"],
                                       labels={"x": "", "y": "share"}), use_container_width=True)
            with b:
                st.markdown("**🔑 Keywords:** " + " ".join(f"`{k}`" for k in r["keywords"]))
                st.markdown("**🫣 Hedges:** " + (", ".join(f"“{h}”" for h in r["hedges"]) or "none"))
                st.markdown("**💪 Assertive phrases:** " + (", ".join(f"“{h}”" for h in r["assertive"]) or "none"))
                if r["toxic_words"]:
                    st.markdown("**⚠️ Flagged words:** " + ", ".join(r["toxic_words"]))
                st.markdown(f"**📝 Summary:** {r['summary']}")

# ============================================================== speech
with t_speech:
    st.markdown("**Pipeline:** audio → faster-whisper (local speech-to-text, word timings + probabilities) → pace, "
                "fillers, pauses, clarity → pitch & loudness from the raw signal → confidence score + tips.")
    st.caption("For live practice with eye contact use the **Speech Coach** page. Here you can analyse any recording.")
    up = st.file_uploader("Recording (wav, mp3, m4a, ogg, webm)", type=["wav", "mp3", "m4a", "ogg", "webm", "mp4"])
    passage = st.text_input("Optional: the text you read aloud (enables pronunciation accuracy)")
    if up and st.button("Analyse speech", type="primary"):
        try:
            audio = decode_audio(up.getvalue())
        except Exception as e:  # unreadable / unsupported file
            st.error(f"Could not read that file: {e}")
        else:
            with st.spinner("Transcribing and analysing… (first run downloads the speech model)"):
                rep = analyze_speech(audio, passage=passage.strip() or None)
            if rep.get("error"):
                st.warning(rep["error"])
            else:
                render(rep, to_wav(audio))

# ============================================================== machine learning
with t_ml:
    try:
        card = api.model_card()
    except api.APIError as e:
        st.error(str(e))
        card = None
    if card:
        st.markdown(f"**{card['name']}** — {card['task']}.")
        c = st.columns(4)
        metric_card(c[0], card["algorithm"].replace("_", " "), "Selected algorithm")
        metric_card(c[1], f"{card['test']['accuracy'] * 100:.0f}%", "Test accuracy")
        metric_card(c[2], f"{card['test']['f1_macro']:.2f}", "Test F1 (macro)")
        metric_card(c[3], f"{card['data']['rows']:,}", f"Rows ({card['data']['user_labelled']} user-labelled)")

        a, b, cc = st.columns(3)
        short = {"logistic_regression": "LogReg", "random_forest": "RandomForest", "gradient_boosting": "GradBoost"}
        cv = pd.DataFrame([(short.get(k, k), v) for k, v in card["cv_f1_macro"].items()], columns=["model", "cv_f1"])
        a.plotly_chart(px.bar(cv, x="model", y="cv_f1", title="Model selection (5-fold CV, F1)", range_y=[0, 1]),
                       use_container_width=True)
        fi = pd.DataFrame(card["feature_importance"].items(), columns=["feature", "importance"])
        b.plotly_chart(px.bar(fi, x="importance", y="feature", orientation="h", title="Permutation importance")
                       .update_yaxes(autorange="reversed"), use_container_width=True)
        cc.plotly_chart(px.imshow(card["test"]["confusion_matrix"], x=card["labels"], y=card["labels"], text_auto=True,
                                  color_continuous_scale="Blues", title="Confusion matrix (rows = actual)",
                                  labels={"x": "predicted", "y": "actual"}), use_container_width=True)

        st.subheader("🎛️ Try a prediction")
        with st.form("ml_predict"):
            c = st.columns(3)
            feats = {
                "duration_min": c[0].slider("Session length (min)", 5, 240, 60),
                "hour": c[1].slider("Start hour", 0, 23, 21),
                "focus_pct": c[2].slider("Focused %", 0, 100, 60),
                "distracted_pct": c[0].slider("Distracted %", 0, 100, 20),
                "drowsy_pct": c[1].slider("Drowsy %", 0, 60, 12),
                "no_face_pct": c[2].slider("Away %", 0, 40, 8),
                "blinks_per_min": c[0].slider("Blinks / min", 3, 50, 22),
                "yawns_per_10min": c[1].slider("Yawns / 10 min", 0.0, 10.0, 1.5, 0.5),
                "avg_ear": c[2].slider("Eye openness (EAR)", 0.15, 0.40, 0.26, 0.01),
            }
            go_predict = st.form_submit_button("Predict fatigue risk", type="primary")
        if go_predict:
            p = api.predict_fatigue(feats)
            colors = {"low": "#22c55e", "medium": "#eab308", "high": "#ef4444"}
            a, b = st.columns([1, 2])
            a.markdown(f"<div class='fl-card'><h3 style='color:{colors[p['risk']]}'>{p['risk'].upper()} risk</h3>"
                       f"<p>{p['advice']}</p></div>", unsafe_allow_html=True)
            b.plotly_chart(px.bar(x=list(p["probabilities"]), y=list(p["probabilities"].values()),
                                  color=list(p["probabilities"]), color_discrete_map=colors, range_y=[0, 1],
                                  labels={"x": "", "y": "probability"}, title="Class probabilities"),
                           use_container_width=True)
            if p["factors"]:
                st.markdown("**Why:** " + " · ".join(
                    f"{f['label']} `{f['value']}` {'raises' if f['effect'] > 0 else 'lowers'} risk"
                    for f in p["factors"]))
        st.caption(f"Trained {card['trained_at']} · {card['limitations']}")
        st.code("python -m ml.train --with-db   # retrain with sessions users rated after the Focus Monitor",
                language="bash")

# ============================================================== architecture
with t_arch:
    st.markdown("""
| Layer | Technology | Where |
|---|---|---|
| Computer vision | MediaPipe Face Mesh, OpenCV (solvePnP), NumPy | `cv/attention_detector.py` |
| NLP | VADER / Amazon Comprehend, keyword + summary algorithms | `nlp/text_analyzer.py` |
| Speech AI | faster-whisper (CTranslate2), autocorrelation pitch tracking | `speech/analyzer.py` |
| Machine learning | scikit-learn (LogReg / RandomForest / GradientBoosting), CV model selection, model card | `ml/` |
| Real-time | WebRTC (streamlit-webrtc), FastAPI WebSockets | `frontend/utils/video.py`, `backend/websocket_manager.py` |
| API & auth | FastAPI, JWT, bcrypt, email + SMS OTP (AWS SES / SNS) | `backend/` |
| Data | SQLAlchemy → SQLite (dev) / PostgreSQL on AWS RDS, reports on S3 | `backend/models.py` |
| Frontend | Streamlit, Plotly; SEO landing page in plain HTML | `frontend/`, `backend/web/` |
| Deploy | Docker, docker-compose, Nginx (HTTPS), EC2 | `deploy/`, `aws/` |
""")
    st.markdown("""
**Data flow** — the browser streams camera + mic over WebRTC → the Streamlit server runs the CV / speech engines
per frame → summaries go to the FastAPI backend → stored in PostgreSQL (RDS) and S3 → the ML model reads labelled
sessions to retrain → predictions are served back through the API. See `docs/PIPELINE.md` for the full
initial-to-live walkthrough.
""")
