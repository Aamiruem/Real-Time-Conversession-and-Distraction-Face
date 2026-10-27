"""Session history, trends, leaderboard and NLP conversation insights."""
import pandas as pd
import plotly.express as px
import streamlit as st

from utils import api_client as api
from utils.ui import STATE_COLORS, metric_card, require_login, setup

setup("Analytics", "📊")
require_login()

st.title("📊 Analytics")

try:
    summary = api.my_summary()
    sessions = api.sessions()
    board = api.leaderboard()
    rooms = api.rooms()
    speech = api.speech_sessions()
except api.APIError as e:
    st.error(str(e))
    st.stop()

c = st.columns(7)
metric_card(c[0], summary["sessions"], "Sessions")
metric_card(c[1], summary["total_minutes"], "Minutes tracked")
metric_card(c[2], f"{summary['avg_focus_pct']}%", "Avg focus")
metric_card(c[3], f"{summary['avg_distracted_pct']}%", "Avg distracted")
metric_card(c[4], f"{summary['avg_drowsy_pct']}%", "Avg drowsy")
metric_card(c[5], summary["messages_sent"], "Messages sent")
metric_card(c[6], f"{summary['avg_speech_confidence']}%", "Speaking confidence")

tab_focus, tab_speech, tab_live, tab_board, tab_nlp = st.tabs(
    ["🎯 Focus history", "🗣️ Speech progress", "⏱️ Live samples", "🏆 Leaderboard", "🧠 Conversation insights"])

with tab_focus:
    if not sessions:
        st.info("No saved sessions yet — finish one in the Focus Monitor.")
    else:
        df = pd.DataFrame(sessions)
        df["started_at"] = pd.to_datetime(df["started_at"])
        df["minutes"] = (df["duration_sec"] / 60).round(1)
        long = df.melt(id_vars="started_at", value_vars=["focus_pct", "distracted_pct", "drowsy_pct"],
                       var_name="metric", value_name="percent")
        st.plotly_chart(px.line(long, x="started_at", y="percent", color="metric", markers=True,
                                title="Focus vs distraction per session"), use_container_width=True)
        st.dataframe(
            df[["id", "started_at", "minutes", "focus_pct", "distracted_pct", "drowsy_pct", "total_blinks",
                "total_yawns", "report_url"]],
            use_container_width=True, hide_index=True,
            column_config={"report_url": st.column_config.LinkColumn("S3 report")},
        )

with tab_speech:
    if not speech:
        st.info("No speech sessions yet — record one in the Speech Coach.")
    else:
        sp = pd.DataFrame(speech)
        sp["created_at"] = pd.to_datetime(sp["created_at"])
        parts = ["confidence", "fluency", "pace", "clarity", "voice", "assertiveness", "eye_contact"]
        long = sp.melt(id_vars="created_at", value_vars=parts, var_name="score", value_name="value")
        st.plotly_chart(px.line(long, x="created_at", y="value", color="score", markers=True,
                                title="Speaking confidence over time"), use_container_width=True)
        first, last = sp.iloc[0], sp.iloc[-1]
        a, b, cc = st.columns(3)
        a.metric("Latest confidence", f"{last['confidence']:.0f}%",
                 f"{last['confidence'] - first['confidence']:+.0f} since first")
        b.metric("Latest pace", f"{last['wpm']:.0f} wpm")
        cc.metric("Fillers (latest)", int(last["fillers"]), f"{int(last['fillers'] - first['fillers']):+d} since first",
                  delta_color="inverse")
        st.dataframe(sp[["id", "created_at", "mode", "duration_sec", "confidence", "fluency", "pace", "clarity",
                         "voice", "assertiveness", "eye_contact", "wpm", "fillers", "transcript"]],
                     use_container_width=True, hide_index=True)

with tab_live:
    snaps = api.snapshots(500)
    if snaps:
        sdf = pd.DataFrame(snaps)
        sdf["timestamp"] = pd.to_datetime(sdf["timestamp"])
        st.plotly_chart(px.area(sdf, x="timestamp", y="focus_pct", title="Live focus % samples"),
                        use_container_width=True)
        counts = sdf["state"].value_counts().reset_index()
        counts.columns = ["state", "samples"]
        st.plotly_chart(px.bar(counts, x="state", y="samples", color="state",
                               color_discrete_map=STATE_COLORS, title="State distribution"),
                        use_container_width=True)
    else:
        st.info("No live samples yet.")

with tab_board:
    if board:
        st.plotly_chart(px.bar(pd.DataFrame(board), x="username", y="avg_focus_pct", text="avg_focus_pct",
                               title="Top focused users"), use_container_width=True)
    else:
        st.info("Leaderboard appears once sessions are saved.")

with tab_nlp:
    if not rooms:
        st.info("No rooms yet.")
    else:
        room = st.selectbox("Room", rooms, format_func=lambda r: r["name"])
        ins = api.insights(room["id"])
        a, b, cc = st.columns(3)
        a.metric("Messages", ins["total_messages"])
        b.metric("Flagged toxic", ins["toxic_messages"])
        cc.metric("Participants", len(ins["messages_per_user"]))
        st.markdown(f"**📝 AI summary:** {ins['summary']}")
        st.markdown("**🔑 Top keywords:** " + " ".join(f"`{k}`" for k in ins["top_keywords"]))
        col1, col2 = st.columns(2)
        if ins["sentiment_distribution"]:
            sd = pd.DataFrame(ins["sentiment_distribution"].items(), columns=["sentiment", "count"])
            col1.plotly_chart(px.pie(sd, names="sentiment", values="count", hole=0.5, title="Sentiment",
                                     color="sentiment", color_discrete_map={"positive": "#22c55e",
                                                                            "neutral": "#94a3b8",
                                                                            "negative": "#ef4444"}),
                              use_container_width=True)
        if ins.get("confidence_by_user"):
            cd = pd.DataFrame(ins["confidence_by_user"].items(), columns=["user", "confidence"])
            st.plotly_chart(px.bar(cd, x="user", y="confidence", range_y=[0, 100],
                                   title="Confidence of wording (hedging vs. assertive language)"),
                            use_container_width=True)
        if ins["avg_focus_while_chatting"]:
            fd = pd.DataFrame(ins["avg_focus_while_chatting"].items(), columns=["user", "avg_focus"])
            col2.plotly_chart(px.bar(fd, x="user", y="avg_focus", title="Avg focus while chatting"),
                              use_container_width=True)
