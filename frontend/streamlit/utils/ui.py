"""Shared design system: page setup, theme CSS, headers, auth guard and chart widgets."""
import plotly.graph_objects as go
import streamlit as st

from utils import api_client as api

APP_NAME = "Presence AI"
# Presence AI mark (same as frontend/public/icon.svg): focus ring + attention dot + two voice waves
LOGO_SVG = (
    "<svg width='28' height='28' viewBox='0 0 64 64' aria-hidden='true'><defs><linearGradient id='plg' x1='0' y1='0' "
    "x2='1' y2='1'><stop offset='0' stop-color='#38bdf8'/><stop offset='1' stop-color='#a78bfa'/></linearGradient>"
    "</defs><circle cx='25' cy='32' r='13' fill='none' stroke='url(#plg)' stroke-width='5.5'/><circle cx='25' "
    "cy='32' r='5' fill='url(#plg)'/><path d='M43 23.5a12 12 0 0 1 0 17' fill='none' stroke='url(#plg)' "
    "stroke-width='4.5' stroke-linecap='round'/><path d='M50 17a21 21 0 0 1 0 30' fill='none' stroke='url(#plg)' "
    "stroke-width='4.5' stroke-linecap='round' opacity='.65'/></svg>"
)
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root {--fl-bg:#0b1120; --fl-surface:#111a2e; --fl-line:#1e2a44; --fl-text:#e2e8f0; --fl-muted:#94a3b8;
       --fl-accent:#38bdf8; --fl-accent2:#a78bfa;}
html, body, [class*="css"], .stMarkdown, .stButton button, input, textarea, select {font-family: Inter, system-ui, sans-serif !important;}
.stApp {background: radial-gradient(1000px 500px at 85% -10%, #1e1b4b55 0%, transparent 60%),
        radial-gradient(800px 420px at -10% 0%, #0c4a6e55 0%, transparent 55%), var(--fl-bg);}
.block-container {padding-top: 1.4rem; max-width: 1280px;}
[data-testid="stToolbar"] [data-testid="stToolbarActions"], .stDeployButton, [data-testid="stAppDeployButton"] {display:none !important;}
[data-testid="stSidebar"] {background: #0d1526; border-right: 1px solid var(--fl-line);}
[data-testid="stSidebarNav"] header, [data-testid="stNavSectionHeader"] {color: var(--fl-muted) !important;
    font-size: .7rem !important; font-weight: 700 !important; letter-spacing: .1em; text-transform: uppercase;}
[data-testid="stSidebarNavItems"] {max-height: none !important;}  /* always show every page (8 + headers) */
[data-testid="stSidebarNavViewButton"] {display: none;}
[data-testid="stSidebarNavLink"] {border-radius: 10px; margin: 1px 0; transition: background .15s;}
[data-testid="stSidebarNavLink"]:hover {background: #ffffff0a;}
[data-testid="stSidebarNavLink"][aria-current="page"] {background: #38bdf81f; box-shadow: inset 3px 0 0 var(--fl-accent);}
[data-testid="stMain"] .block-container {animation: fl-fade .25s ease-out;}
@keyframes fl-fade {from {opacity: 0; transform: translateY(4px);} to {opacity: 1; transform: none;}}
.js-plotly-plot .plotly .modebar {display: none !important;}
.stButton button[kind="primary"], .stFormSubmitButton button[kind="primaryFormSubmit"] {
    background: linear-gradient(135deg, var(--fl-accent), var(--fl-accent2)); color: #04121f; border: 0; font-weight: 700;}
.stButton button, .stFormSubmitButton button {border-radius: 10px;}
.stTextInput input, .stSelectbox div[data-baseweb="select"] > div {border-radius: 10px;}
[data-testid="stForm"] {background: var(--fl-surface); border: 1px solid var(--fl-line); border-radius: 18px; padding: 18px 20px;}
.stTabs [data-baseweb="tab-list"] {gap: 6px;}
.stTabs [data-baseweb="tab"] {border-radius: 10px 10px 0 0; padding: 8px 14px;}

.fl-brand {display:flex; align-items:center; gap:10px; font-weight:800; font-size:1.15rem; color:var(--fl-text); margin:4px 0 6px;}
.fl-brand .dot {width:26px; height:26px; border-radius:50%; border:4px solid var(--fl-accent);
                box-shadow: inset 0 0 0 5px #0d1526, inset 0 0 0 20px var(--fl-accent2);}
.fl-user {background:var(--fl-surface); border:1px solid var(--fl-line); border-radius:12px; padding:10px 12px; margin:6px 0 10px;}
.fl-user .n {font-weight:700; color:var(--fl-text);} .fl-user .e {font-size:.78rem; color:var(--fl-muted);}
.fl-header {margin: 0 0 18px;}
.fl-header .eyebrow {color:var(--fl-accent); font-weight:600; font-size:.75rem; letter-spacing:.08em; text-transform:uppercase;}
.fl-header h1 {font-size:2.2rem; font-weight:800; letter-spacing:-.02em; margin:2px 0 4px; padding:0; color:var(--fl-text);}
.fl-header h1 span {background:linear-gradient(135deg,var(--fl-accent),var(--fl-accent2)); -webkit-background-clip:text;
                    background-clip:text; color:transparent;}
.fl-header p {color:var(--fl-muted); margin:0; font-size:1rem;}
.fl-card {background:var(--fl-surface); border:1px solid var(--fl-line); border-radius:18px; padding:18px 20px; height:100%;
          color:var(--fl-text);}
.fl-card h3 {margin:6px 0 6px; font-size:1.05rem;} .fl-card p {color:var(--fl-muted); font-size:.92rem; margin:0;}
.fl-card .ic {font-size:1.6rem;}
.fl-hero h1 {font-size:2.8rem; line-height:1.08; font-weight:800; letter-spacing:-.02em; color:var(--fl-text); padding:0; margin:8px 0 12px;}
.fl-hero h1 span {background:linear-gradient(135deg,var(--fl-accent),var(--fl-accent2)); -webkit-background-clip:text;
                  background-clip:text; color:transparent;}
.fl-hero p.lead {color:var(--fl-muted); font-size:1.08rem;}
.fl-hero ul {list-style:none; padding:0; margin:18px 0 0;}
.fl-hero li {color:var(--fl-text); margin:9px 0; font-size:.98rem;}
.fl-pill {display:inline-block; background:#0c4a6e55; color:#7dd3fc; border:1px solid #0c4a6e; border-radius:999px;
          padding:3px 10px; font-size:.75rem; font-weight:600;}
.fl-otp-dev {background:#422006; border:1px solid #854d0e; color:#fde68a; border-radius:12px; padding:10px 14px; font-size:.88rem;}

.metric-card {background:var(--fl-surface); border:1px solid var(--fl-line); border-radius:14px; padding:14px 16px; text-align:center;}
.metric-card .v {font-size:1.6rem; font-weight:700; color:var(--fl-accent);}
.metric-card .l {font-size:.72rem; color:var(--fl-muted); text-transform:uppercase; letter-spacing:.05em;}
.state-badge {border-radius:14px; padding:14px 18px; font-size:1.3rem; font-weight:700; color:white;}
.chat-msg {background:#111827; border-radius:12px; padding:8px 12px; margin:6px 0; border-left:4px solid #38bdf8; color:var(--fl-text);}
.chat-msg.me {border-left-color:#22c55e; background:#0b2a1a;}
.chat-msg .meta {font-size:.72rem; color:#94a3b8;}
.chat-msg .toxic {color:#f87171; font-size:.72rem;}
.participant {display:flex; justify-content:space-between; padding:6px 10px; border-radius:10px; background:#0f172a; margin:4px 0; color:var(--fl-text);}
.alarm {background:#7f1d1d; color:#fecaca; padding:10px 14px; border-radius:10px; font-weight:600;}
.prompt-card {background:#0f172a; border:1px solid #1e293b; border-left:4px solid #38bdf8; border-radius:12px;
              padding:12px 16px; margin:4px 0 14px; font-size:1.1rem; color:#e2e8f0;}
.prompt-card .l {font-size:.72rem; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em;}
.transcript {line-height:1.9; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:12px 14px;}
.transcript .w-filler {background:#9a3412; color:#ffedd5; border-radius:4px; padding:0 3px;}
.transcript .w-unclear {text-decoration:underline wavy #ef4444; text-underline-offset:4px;}
.fl-area {background:var(--fl-surface); border:1px solid var(--fl-line); border-top:4px solid var(--a); border-radius:16px;
          padding:16px 18px; margin-bottom:14px; color:var(--fl-text);}
.fl-area .hd {display:flex; justify-content:space-between; align-items:center; font-weight:700;}
.fl-area .chip {font-size:.72rem; padding:2px 10px; border-radius:99px; color:var(--a); border:1px solid var(--a);}
.fl-area .sc {font-size:2.4rem; font-weight:800; color:var(--a); line-height:1.1; margin:6px 0;}
.fl-area .bar {height:10px; border-radius:99px; overflow:hidden;
               background:repeating-linear-gradient(45deg,#eab30833 0 6px,#eab30814 6px 12px);}
.fl-area .bar div {height:100%; background:var(--a); border-radius:99px;}
.fl-area .lg {display:flex; justify-content:space-between; font-size:.75rem; color:var(--fl-muted); margin:6px 0 8px;}
.fl-area ul {font-size:.82rem; color:var(--fl-muted); padding-left:18px; margin:0 0 8px;}
.fl-area ol {font-size:.88rem; padding-left:20px; margin:4px 0 8px;}
.fl-area .drill {background:#0a1222; border:1px dashed var(--fl-line); border-radius:10px; padding:8px 12px; font-size:.82rem;}
</style>
"""
HIDE_SIDEBAR = """<style>[data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"] {display:none;}</style>"""


def setup(title: str, icon: str = "🎯"):
    st.set_page_config(page_title=f"{title} · {APP_NAME}", page_icon=icon, layout="wide",
                       menu_items={"About": f"{APP_NAME} — focus tracking, speech coaching and fatigue prediction."})
    st.markdown(CSS, unsafe_allow_html=True)
    restore_login()


def page_header(title: str, subtitle: str = "", eyebrow: str = "", highlight: str = ""):
    """Gradient page title; `highlight` is the part of the title drawn in the brand gradient."""
    shown = title.replace(highlight, f"<span>{highlight}</span>") if highlight else title
    st.markdown(f"<div class='fl-header'><div class='eyebrow'>{eyebrow}</div><h1>{shown}</h1><p>{subtitle}</p></div>",
                unsafe_allow_html=True)


def card(col, icon: str, title: str, text: str):
    col.markdown(f"<div class='fl-card'><div class='ic'>{icon}</div><h3>{title}</h3><p>{text}</p></div>",
                 unsafe_allow_html=True)


def restore_login():
    """Keep the JWT in the URL (?session=…) so a browser refresh does not log the user out.

    Streamlit wipes session_state on refresh, but the URL survives; on the next run the token
    is validated against the backend and the login is restored.
    """
    token = st.session_state.get("token")
    if token:
        if st.query_params.get("session") != token:
            st.query_params["session"] = token
        return
    saved = st.query_params.get("session")
    if saved:
        try:
            st.session_state["user"] = api.me(saved)
            st.session_state["token"] = saved
        except api.APIError:
            del st.query_params["session"]  # expired / invalid -> show login


def logout():
    sock = st.session_state.get("room_socket")
    if sock:
        sock.close()
    st.session_state.clear()
    st.query_params.clear()
    st.rerun()


def sidebar_user():
    user = st.session_state["user"]
    with st.sidebar:
        st.markdown(f"<div class='fl-brand'>{LOGO_SVG}{APP_NAME}</div>", unsafe_allow_html=True)
        st.markdown(f"<div class='fl-user'><div class='n'>{user.get('full_name') or user['username']}</div>"
                    f"<div class='e'>@{user['username']} · {user['email']}</div></div>", unsafe_allow_html=True)
        if st.button("Log out", use_container_width=True, key="logout"):
            logout()


def require_login():
    if not st.session_state.get("token"):
        st.markdown(HIDE_SIDEBAR, unsafe_allow_html=True)
        st.warning("Please sign in first.")
        st.page_link("views/home.py", label="Go to sign in", icon="🔐")
        st.stop()
    sidebar_user()


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
