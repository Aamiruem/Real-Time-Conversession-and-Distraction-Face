"""Real-time conversation rooms where every participant's live focus score is shared."""
import html
import time

import streamlit as st
from streamlit_autorefresh import st_autorefresh
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.ui import STATE_COLORS, STATE_EMOJI, focus_gauge, require_login, setup
from utils.video import MEDIA_CONSTRAINTS, RTC_CONFIGURATION, AttentionProcessor, metrics_to_payload
from utils.ws_client import RoomSocket

setup("Focus Rooms", "💬")
require_login()
me = st.session_state["user"]["username"]

# ---------------- sidebar: pick / create a room
with st.sidebar:
    st.subheader("💬 Rooms")
    try:
        rooms = api.rooms()
    except api.APIError as e:
        st.error(str(e))
        st.stop()
    with st.expander("➕ Create room"):
        with st.form("new_room", clear_on_submit=True):
            name = st.text_input("Room name")
            desc = st.text_input("Description")
            if st.form_submit_button("Create") and name:
                try:
                    api.create_room(name, desc)
                    st.rerun()
                except api.APIError as e:
                    st.error(str(e))
    if not rooms:
        st.info("No rooms yet — create one.")
        st.stop()
    names = {r["name"]: r for r in rooms}
    room = names[st.selectbox("Join room", list(names))]
    share_cam = st.toggle("📷 Share my live focus", value=True)

# ---------------- connect (or switch) WebSocket
sock: RoomSocket | None = st.session_state.get("room_socket")
if sock is None or sock.room_id != room["id"]:
    if sock:
        sock.close()
    sock = RoomSocket(room["id"], st.session_state["token"], history=api.messages(room["id"]))
    st.session_state["room_socket"] = sock
    time.sleep(0.4)

st_autorefresh(interval=1500, key="room-refresh")

st.title(f"💬 {room['name']}")
if room["description"]:
    st.caption(room["description"])

messages, participants, alerts = sock.snapshot()
video_col, chat_col, people_col = st.columns([2, 3, 1.4])

# ---------------- my camera + live focus push
with video_col:
    my_focus = None
    if share_cam:
        ctx = webrtc_streamer(
            key="room-cam",
            mode=WebRtcMode.SENDRECV,
            rtc_configuration=RTC_CONFIGURATION,
            media_stream_constraints=MEDIA_CONSTRAINTS,
            video_processor_factory=AttentionProcessor,
            async_processing=True,
        )
        if ctx.state.playing and ctx.video_processor:
            m = ctx.video_processor.detector.metrics()
            my_focus = m
            if time.time() - st.session_state.get("room_last_push", 0) >= 3:
                st.session_state["room_last_push"] = time.time()
                try:
                    api.push_focus(metrics_to_payload(m))
                except api.APIError:
                    pass
    if my_focus:
        st.plotly_chart(focus_gauge(my_focus.focus_pct, "My focus", height=190), use_container_width=True)
        st.markdown(f"{STATE_EMOJI[my_focus.state]} **{my_focus.state}** · distracted "
                    f"`{my_focus.distracted_pct:.0f}%`")
    else:
        st.info("Start your camera so others can see your live focus score.")

# ---------------- chat
with chat_col:
    status = "🟢 live" if sock.connected else "🟠 reconnecting…"
    st.markdown(f"**Conversation** · {status}")
    for a in alerts[-2:]:
        st.markdown(f"<div class='alarm'>{html.escape(a)}</div>", unsafe_allow_html=True)

    box = st.container(height=430)
    sentiment_icon = {"positive": "😊", "negative": "😟", "neutral": "😐"}
    for msg in messages[-80:]:
        mine = "me" if msg["username"] == me else ""
        focus = f" · focus {msg['sender_focus']:.0f}%" if msg.get("sender_focus") is not None else ""
        toxic = "<div class='toxic'>⚠️ flagged as possibly offensive</div>" if msg["is_toxic"] else ""
        tags = " ".join(f"#{k}" for k in msg.get("keywords", []))
        box.markdown(
            f"<div class='chat-msg {mine}'><div class='meta'><b>{html.escape(msg['username'])}</b> · "
            f"{msg['created_at'][11:16]} · {sentiment_icon.get(msg['sentiment_label'], '')}{focus}</div>"
            f"{html.escape(msg['content'])}{toxic}<div class='meta'>{html.escape(tags)}</div></div>",
            unsafe_allow_html=True,
        )

    typing = sock.typing_users(me)
    if typing:
        st.caption(f"✍️ {', '.join(typing)} typing…")

    with st.form("send", clear_on_submit=True):
        c1, c2 = st.columns([5, 1])
        text = c1.text_input("Message", label_visibility="collapsed", placeholder="Type a message…")
        if c2.form_submit_button("Send", use_container_width=True) and text.strip():
            if not sock.send_chat(text.strip()):
                try:
                    api.send_message(room["id"], text.strip())  # REST fallback
                except api.APIError as e:
                    st.error(str(e))
            time.sleep(0.25)
            st.rerun()

# ---------------- participants with live focus
with people_col:
    st.markdown("**👥 Online**")
    for p in participants:
        state = p.get("state") or "Offline cam"
        fp = p.get("focus_pct")
        st.markdown(
            f"<div class='participant' style='border-left:4px solid {STATE_COLORS.get(state, '#64748b')}'>"
            f"<span>{STATE_EMOJI.get(state, '')} {html.escape(p['username'])}</span>"
            f"<b>{'' if fp is None else f'{fp:.0f}%'}</b></div>",
            unsafe_allow_html=True,
        )
    focus_vals = [p["focus_pct"] for p in participants if p.get("focus_pct") is not None]
    if focus_vals:
        st.metric("Room avg focus", f"{sum(focus_vals) / len(focus_vals):.0f}%")
