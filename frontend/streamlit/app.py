"""Presence AI — Streamlit entry point: restores the login, then routes to the pages with grouped navigation.

Run (from frontend/streamlit/): streamlit run app.py

This file only decides *which* pages exist (sign-in only when signed out, everything when signed in); each page
draws itself and calls `setup()` (st.set_page_config) first, so nothing may be rendered here before `pg.run()`.
"""
import threading

import streamlit as st

from utils.ui import restore_login


@st.cache_resource(show_spinner=False)
def _preload_camera_stack():
    """Import the video/CV libraries (WebRTC, OpenCV, MediaPipe: ~20 s the first time) in the background once per
    server process, so the first visit to a camera page doesn't wait for them."""
    def load():
        import streamlit_webrtc  # noqa: F401
        import utils.video  # noqa: F401

    threading.Thread(target=load, name="preload-camera", daemon=True).start()


_preload_camera_stack()
restore_login()

home = st.Page("views/home.py", title="Dashboard", icon="🏠", default=True)
if st.session_state.get("token"):
    pg = st.navigation({
        "Home": [home],
        "Practice": [
            st.Page("views/focus_monitor.py", title="Focus Monitor", icon="🎥"),
            st.Page("views/speech_coach.py", title="Speech Coach", icon="🗣️"),
            st.Page("views/conversation_coach.py", title="Conversation Coach", icon="🗨️"),
            st.Page("views/interview_prep.py", title="Interview Prep", icon="💼"),
        ],
        "Community": [st.Page("views/focus_rooms.py", title="Focus Rooms", icon="💬")],
        "Insights": [
            st.Page("views/analytics.py", title="Analytics", icon="📊"),
            st.Page("views/ai_lab.py", title="AI Lab", icon="🧪"),
        ],
        "Account": [st.Page("views/account.py", title="Account settings", icon="⚙️")],
    })
else:
    pg = st.navigation([st.Page("views/home.py", title="Sign in", icon="🔐", default=True)], position="hidden")
pg.run()
