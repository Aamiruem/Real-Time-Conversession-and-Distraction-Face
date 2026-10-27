"""Shared page setup, theme, auth guard and chart widgets."""
import plotly.graph_objects as go
import streamlit as st

STATE_COLORS = {
    "Focused": "#22c55e",
    "Distracted": "#f97316",
    "Drowsy": "#ef4444",
    "Yawning": "#eab308",
    "No Face": "#94a3b8",
    "Offline cam": "#64748b",
}
STATE_EMOJI = {"Focused": "🎯", "Distracted": "👀", "Drowsy": "😴", "Yawning": "🥱", "No Face": "❔", "Offline cam": "📷"}

CSS = """
<style>
.block-container {padding-top: 1.6rem;}
.metric-card {background:#0f172a; border:1px solid #1e293b; border-radius:14px; padding:14px 16px; text-align:center;}
.metric-card .v {font-size:1.6rem; font-weight:700; color:#38bdf8;}
.metric-card .l {font-size:.75rem; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em;}
.state-badge {border-radius:14px; padding:14px 18px; font-size:1.3rem; font-weight:700; color:white;}
.chat-msg {background:#111827; border-radius:12px; padding:8px 12px; margin:6px 0; border-left:4px solid #38bdf8;}
.chat-msg.me {border-left-color:#22c55e; background:#0b2a1a;}
.chat-msg .meta {font-size:.72rem; color:#94a3b8;}
.chat-msg .toxic {color:#f87171; font-size:.72rem;}
.participant {display:flex; justify-content:space-between; padding:6px 10px; border-radius:10px; background:#0f172a; margin:4px 0;}
.alarm {background:#7f1d1d; color:#fecaca; padding:10px 14px; border-radius:10px; font-weight:600;}
</style>
"""


def setup(title: str, icon: str = "🎯"):
    st.set_page_config(page_title=f"{title} · FocusLink AI", page_icon=icon, layout="wide")
    st.markdown(CSS, unsafe_allow_html=True)


def require_login():
    if not st.session_state.get("token"):
        st.warning("Please log in from the **Home** page first.")
        st.page_link("app.py", label="Go to login", icon="🔐")
        st.stop()
    with st.sidebar:
        st.markdown(f"**Signed in as** `{st.session_state['user']['username']}`")
        if st.button("Log out", use_container_width=True):
            sock = st.session_state.get("room_socket")
            if sock:
                sock.close()
            st.session_state.clear()
            st.rerun()


def metric_card(col, value, label):
    col.markdown(f"<div class='metric-card'><div class='v'>{value}</div><div class='l'>{label}</div></div>",
                 unsafe_allow_html=True)


def state_badge(state: str, focus_pct: float):
    color = STATE_COLORS.get(state, "#334155")
    st.markdown(
        f"<div class='state-badge' style='background:{color}'>{STATE_EMOJI.get(state, '')} {state}"
        f"<div style='font-size:.8rem;font-weight:400'>Focus score {focus_pct:.0f}%</div></div>",
        unsafe_allow_html=True,
    )


def focus_gauge(value: float, title="Focus %", height=220):
    fig = go.Figure(go.Indicator(
        mode="gauge+number", value=value, number={"suffix": "%"}, title={"text": title},
        gauge={"axis": {"range": [0, 100]}, "bar": {"color": "#22c55e"},
               "steps": [{"range": [0, 40], "color": "#450a0a"}, {"range": [40, 70], "color": "#422006"},
                         {"range": [70, 100], "color": "#052e16"}]},
    ))
    fig.update_layout(height=height, margin=dict(l=20, r=20, t=40, b=10), paper_bgcolor="rgba(0,0,0,0)",
                      font_color="#e2e8f0")
    return fig


def state_donut(focus, distracted, drowsy, no_face, height=260):
    labels = ["Focused", "Distracted", "Drowsy", "No Face"]
    fig = go.Figure(go.Pie(labels=labels, values=[focus, distracted, drowsy, no_face], hole=0.62,
                           marker_colors=[STATE_COLORS[l] for l in labels], sort=False))
    fig.update_layout(height=height, margin=dict(l=10, r=10, t=10, b=10), paper_bgcolor="rgba(0,0,0,0)",
                      font_color="#e2e8f0", annotations=[dict(text=f"{focus:.1f}%<br>focused", showarrow=False,
                                                              font_size=16)])
    return fig


def fmt_duration(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"
