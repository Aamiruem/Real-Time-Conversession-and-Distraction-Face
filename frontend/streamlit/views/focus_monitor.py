"""Solo live attention tracking with a dashboard like a focus tracker."""
import time
from datetime import datetime, timezone

import streamlit as st
from streamlit_webrtc import WebRtcMode, webrtc_streamer

from utils import api_client as api
from utils.ui import (fmt_duration, focus_gauge, metric_card, page_header, require_login, setup, state_badge,
                      state_donut)
from utils.video import MEDIA_CONSTRAINTS, RTC_CONFIGURATION, AttentionProcessor, alarm_wav, metrics_to_payload

setup("Focus Monitor", "🎥")
require_login()

page_header("🎥 Focus Monitor", "Look at the camera — focus %, distraction % and drowsiness are computed live on "
            "every frame.", eyebrow="Computer vision", highlight="Focus Monitor")

enable_alarm = st.sidebar.toggle("🔊 Drowsiness alarm sound", value=True)
push_every = st.sidebar.slider("Sync to backend every (s)", 2, 15, 3)

left, right = st.columns([3, 2])

with left:
    ctx = webrtc_streamer(
        key="focus-monitor",
        mode=WebRtcMode.SENDRECV,
        rtc_configuration=RTC_CONFIGURATION,
        media_stream_constraints=MEDIA_CONSTRAINTS,
        video_processor_factory=AttentionProcessor,
        async_processing=True,
    )
    alarm_slot = st.empty()
    sound_slot = st.empty()

with right:
    badge_slot = st.empty()
    cards_slot = st.empty()
    pose_slot = st.empty()
    donut_slot = st.empty()

if ctx.state.playing:
    new_take = st.session_state.pop("monitor_saved", None) is not None  # previous take already saved
    if new_take or "monitor_started_at" not in st.session_state:
        st.session_state["monitor_started_at"] = datetime.now(timezone.utc).isoformat()
    last_push, was_drowsy = 0.0, False
    while ctx.state.playing:
        proc = ctx.video_processor
        if proc is None:
            time.sleep(0.2)
            continue
        m = proc.detector.metrics()
        st.session_state["monitor_last"] = m

        with badge_slot.container():
            state_badge(m.state, m.focus_pct)
        with cards_slot.container():
            c1, c2, c3, c4 = st.columns(4)
            metric_card(c1, f"{m.ear:.3f}", "Eye aspect ratio")
            metric_card(c2, m.blinks_per_min, "Blinks / min")
            metric_card(c3, m.gaze.title(), "Gaze")
            metric_card(c4, m.yawns_total, "Yawns")
        with pose_slot.container():
            st.markdown(f"**Head pose** — Yaw `{m.yaw}°` · Pitch `{m.pitch}°` · Roll `{m.roll}°` · "
                        f"**Session** `{fmt_duration(m.elapsed_sec)}`")
        donut_slot.plotly_chart(state_donut(m.focus_pct, m.distracted_pct, m.drowsy_pct, m.no_face_pct),
                                use_container_width=True, key=f"donut-{time.time()}")

        if m.alarm:
            alarm_slot.markdown("<div class='alarm'>🚨 ALARM — You look drowsy! Look at the camera.</div>",
                                unsafe_allow_html=True)
            if enable_alarm and not was_drowsy:
                sound_slot.audio(alarm_wav(), format="audio/wav", autoplay=True)
        else:
            alarm_slot.empty()
            if was_drowsy:
                sound_slot.empty()
        was_drowsy = m.alarm

        if time.time() - last_push >= push_every:
            last_push = time.time()
            try:
                api.push_focus(metrics_to_payload(m))
            except api.APIError:
                pass
        time.sleep(0.5)

# ---------------- after the stream stops: summary + save
m = st.session_state.get("monitor_last")
if m and not ctx.state.playing:
    st.divider()
    st.subheader("📋 Session summary")
    c1, c2, c3, c4, c5 = st.columns(5)
    metric_card(c1, fmt_duration(m.elapsed_sec), "Duration")
    metric_card(c2, f"{m.focus_pct:.1f}%", "Focused")
    metric_card(c3, f"{m.distracted_pct:.1f}%", "Distracted")
    metric_card(c4, f"{m.drowsy_pct:.1f}%", "Drowsy")
    metric_card(c5, m.blinks_total, "Total blinks")
    g1, g2 = st.columns(2)
    g1.plotly_chart(focus_gauge(m.focus_pct), use_container_width=True)
    g2.plotly_chart(state_donut(m.focus_pct, m.distracted_pct, m.drowsy_pct, m.no_face_pct),
                    use_container_width=True)

    # saved automatically as soon as the stream stops, so a page refresh never loses the session
    saved = st.session_state.get("monitor_saved")
    if saved is None:
        payload = {
            "started_at": st.session_state.get("monitor_started_at", datetime.now(timezone.utc).isoformat()),
            "duration_sec": m.elapsed_sec,
            "focus_pct": m.focus_pct,
            "distracted_pct": m.distracted_pct,
            "drowsy_pct": m.drowsy_pct,
            "no_face_pct": m.no_face_pct,
            "total_blinks": m.blinks_total,
            "total_yawns": m.yawns_total,
            "avg_ear": m.avg_ear,
            "timeline": m.timeline,
        }
        try:
            saved = st.session_state["monitor_saved"] = api.save_session(payload)
        except api.APIError as e:
            st.error(f"Could not save the session: {e}")
    if saved:
        st.success(f"✅ Saved automatically as session #{saved['id']} — see it in **Analytics**.")
        if saved.get("report_url"):
            st.markdown(f"[Download S3 report]({saved['report_url']})")

        # ---- machine learning: fatigue risk for this session + the user's own label for retraining
        st.subheader("🧠 Fatigue risk (ML prediction)")
        try:
            pred = api.my_fatigue()
        except api.APIError:
            pred = None
        if pred and pred.get("session_id") == saved["id"]:
            colors = {"low": "#22c55e", "medium": "#eab308", "high": "#ef4444"}
            f1, f2 = st.columns([1, 2])
            f1.plotly_chart(focus_gauge(pred["risk_score"], f"Risk: {pred['risk'].upper()}"), use_container_width=True)
            with f2:
                st.markdown(f"<span class='fl-pill' style='color:{colors[pred['risk']]}'>"
                            f"{pred['risk'].upper()} risk</span>", unsafe_allow_html=True)
                st.markdown(f"**{pred['advice']}**")
                for f in pred["factors"]:
                    arrow = "⬆️ raises" if f["effect"] > 0 else "⬇️ lowers"
                    st.markdown(f"- {f['label']}: `{f['value']}` (typical `{f['typical']}`) — {arrow} risk")
        rated = saved.get("self_fatigue")
        choice = st.radio("How tired do you actually feel? (trains the model for you)", [0, 1, 2],
                          index=rated if rated is not None else None, horizontal=True,
                          format_func=lambda v: ["😀 Fresh", "😐 A bit tired", "😫 Exhausted"][v])
        if choice is not None and choice != rated:
            try:
                st.session_state["monitor_saved"] = api.session_feedback(saved["id"], choice)
                st.toast("Thanks — your rating will be used the next time the model is retrained.")
            except api.APIError as e:
                st.error(str(e))

    b1, b2 = st.columns(2)
    if b1.button("▶️ New session", type="primary", use_container_width=True):
        for k in ("monitor_last", "monitor_started_at", "monitor_saved"):
            st.session_state.pop(k, None)
        st.rerun()
    if saved and b2.button("🗑️ Delete this session", use_container_width=True):
        try:
            api.delete_session(saved["id"])
        except api.APIError as e:
            st.error(str(e))
        for k in ("monitor_last", "monitor_started_at", "monitor_saved"):
            st.session_state.pop(k, None)
        st.rerun()
elif not ctx.state.playing:
    st.info("Press **START** to begin a focus session. Allow camera access in your browser.")
    try:
        history = api.sessions()
    except api.APIError:
        history = []
    if history:
        last = history[-1]
        st.caption(f"Last session · {last['started_at'][:16].replace('T', ' ')} UTC · "
                   f"{last['duration_sec'] / 60:.1f} min · 🎯 {last['focus_pct']:.0f}% focused · "
                   f"👀 {last['distracted_pct']:.0f}% distracted · 😴 {last['drowsy_pct']:.0f}% drowsy")
