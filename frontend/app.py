"""FocusLink AI — Streamlit entry point (login / register / home).

Run: streamlit run frontend/app.py
"""
import streamlit as st

from utils import api_client as api
from utils.ui import setup

setup("Home", "🎯")

st.title("🎯 FocusLink AI")
st.caption("Real-time attention, distraction & drowsiness detection with focus-aware live conversations")

if st.session_state.get("token"):
    user = st.session_state["user"]
    st.success(f"Welcome back, **{user['username']}**!")
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("### 🎥 Focus Monitor")
        st.write("Track your focus %, distraction %, blinks, yawns, gaze and head pose live from your webcam.")
        st.page_link("pages/1_Focus_Monitor.py", label="Open Focus Monitor", icon="🎥")
    with c2:
        st.markdown("### 💬 Focus Rooms")
        st.write("Chat in real time with others while everyone sees each other's live focus score.")
        st.page_link("pages/2_Focus_Rooms.py", label="Open Focus Rooms", icon="💬")
    with c3:
        st.markdown("### 📊 Analytics")
        st.write("Session history, trends, leaderboard and NLP insights from your conversations.")
        st.page_link("pages/3_Analytics.py", label="Open Analytics", icon="📊")
    if st.button("Log out"):
        st.session_state.clear()
        st.rerun()
    st.stop()

login_tab, register_tab = st.tabs(["🔐 Login", "📝 Register"])


def _store(auth):
    st.session_state["token"] = auth["access_token"]
    st.session_state["user"] = auth["user"]
    st.rerun()


with login_tab:
    with st.form("login"):
        username = st.text_input("Username")
        password = st.text_input("Password", type="password")
        if st.form_submit_button("Login", use_container_width=True):
            try:
                _store(api.login(username, password))
            except api.APIError as e:
                st.error(str(e))

with register_tab:
    with st.form("register"):
        username = st.text_input("Username ", help="3–50 characters")
        email = st.text_input("Email")
        password = st.text_input("Password ", type="password", help="At least 6 characters")
        if st.form_submit_button("Create account", use_container_width=True):
            try:
                _store(api.register(username, email, password))
            except api.APIError as e:
                st.error(str(e))

st.divider()
st.markdown(
    """
**How it works**
- **Computer Vision** (MediaPipe Face Mesh + OpenCV): eye aspect ratio, blink rate, yawns, head pose, iris gaze
- **AI state engine**: classifies *Focused / Distracted / Drowsy / Yawning / No Face* and computes live percentages
- **Real-time conversations** (FastAPI WebSockets): chat rooms that share every participant's live focus score
- **NLP**: sentiment, toxicity flagging, keyword extraction and conversation summaries
- **Database** (SQLite / AWS RDS PostgreSQL) + **AWS S3** session reports + optional **Amazon Comprehend**
"""
)
