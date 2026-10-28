"""Home dashboard (same data and layout as the React app's /app page): hero + goals, KPIs, activity, focus,
speaking and interview charts, recent activity and links to every feature."""
import html
from datetime import datetime, timezone

import plotly.graph_objects as go
import streamlit as st

from utils import api_client as api
from utils.ui import STATE_COLORS

# Validated categorical slots for the dark surface (dataviz reference palette); single series use SERIES[0]
SERIES = ["#3987e5", "#d95926", "#199e70"]
GRID, MUTED = "#1e2a44", "#94a3b8"
PAGES = {
    "/app/focus": ("views/focus_monitor.py", "🎥", "Focus Monitor", "Live focus & drowsiness"),
    "/app/speech": ("views/speech_coach.py", "🗣️", "Speech Coach", "Confidence & pronunciation"),
    "/app/conversation": ("views/conversation_coach.py", "🗨️", "Conversation Coach", "Fluency, tone, interaction"),
    "/app/interview": ("views/interview_prep.py", "💼", "Interview Prep", "Mock interviews, any field"),
    "/app/rooms": ("views/focus_rooms.py", "💬", "Focus Rooms", "Chat with live focus"),
    "/app/analytics": ("views/analytics.py", "📊", "Analytics", "History & leaderboard"),
    "/app/lab": ("views/ai_lab.py", "🧪", "AI Lab", "Try each AI model"),
}

CSS = """
<style>
.dash-hero {background: radial-gradient(600px 220px at 0% 0%, #38bdf81f, transparent 70%),
  radial-gradient(500px 240px at 100% 100%, #a78bfa1f, transparent 70%), var(--fl-surface);
  border:1px solid var(--fl-line); border-radius:18px; padding:22px 26px; color:var(--fl-text);}
.dash-hero .eyebrow {color:var(--fl-accent); font-weight:700; font-size:.75rem; letter-spacing:.1em; text-transform:uppercase;}
.dash-hero h1 {font-size:2.2rem; font-weight:800; margin:4px 0; padding:0; color:var(--fl-text);}
.dash-hero h1 span {background:linear-gradient(135deg,var(--fl-accent),var(--fl-accent2)); -webkit-background-clip:text;
  background-clip:text; color:transparent;}
.dash-hero p {color:var(--fl-muted); margin:0;}
.goal-row {display:flex; gap:18px; flex-wrap:wrap; margin-top:14px;}
.goal {display:flex; gap:10px; align-items:center; background:#0a122299; border:1px solid var(--fl-line);
  border-radius:12px; padding:8px 14px 8px 8px;}
.goal b {display:block; color:var(--fl-text);} .goal span {font-size:.78rem; color:var(--fl-muted);}
.kpi {background:var(--fl-surface); border:1px solid var(--fl-line); border-radius:16px; padding:14px;
  color:var(--fl-text); height:100%;}
.kpi .hd {display:flex; gap:8px; align-items:center; margin-bottom:6px;}
.kpi .ic {width:30px; height:30px; flex:none; display:grid; place-items:center; border-radius:9px; background:#38bdf814;
  border:1px solid #38bdf833; font-size:1rem;}
.kpi .v {font-size:1.55rem; font-weight:800; line-height:1.15; white-space:nowrap;}
.step {background:#0a1222; border:1px solid var(--fl-line); border-radius:11px; padding:10px 12px; color:var(--fl-text);
  font-size:.92rem; margin-top:8px;}
.kpi .l {font-size:.72rem; color:var(--fl-muted); text-transform:uppercase; letter-spacing:.06em;}
.kpi .s {font-size:.75rem; color:var(--fl-muted); margin-top:3px;} .kpi .s.up {color:#86efac;} .kpi .s.down {color:#fcd34d;}
.feed-row {display:flex; gap:12px; align-items:center; padding:9px 2px; border-bottom:1px solid var(--fl-line); color:var(--fl-text);}
.feed-row .t {flex:1; min-width:0;} .feed-row .t small {display:block; color:var(--fl-muted); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis;}
.feed-row .sc {text-align:right;} .feed-row .sc small {display:block; color:var(--fl-muted);}
.empty {border:1px dashed var(--fl-line); border-radius:12px; padding:30px 16px; text-align:center; color:var(--fl-muted);}
</style>
"""


def _layout(fig, height=240, **kw):
    fig.update_layout(height=height, margin=dict(l=8, r=8, t=8, b=8), paper_bgcolor="rgba(0,0,0,0)",
                      plot_bgcolor="rgba(0,0,0,0)", font=dict(color=MUTED, size=11), showlegend=False,
                      hoverlabel=dict(bgcolor="#0d1526", bordercolor=GRID, font_color="#e2e8f0"), **kw)
    fig.update_xaxes(showgrid=False, zeroline=False)
    fig.update_yaxes(gridcolor=GRID, zeroline=False)
    return fig


def _by_index(fig, labels):
    """Plot by position so sessions on the same day stay separate points; dates become tick labels."""
    fig.update_xaxes(tickmode="array", tickvals=list(range(len(labels))), ticktext=labels)
    return fig


def _ring(value: float, goal: float, color: str) -> str:
    pct = min(1.0, value / goal) if goal else 0
    c = 2 * 3.1416 * 26
    stroke = "#22c55e" if pct >= 1 else color
    label = "✓" if pct >= 1 else f"{pct * 100:.0f}%"
    return (f"<svg width='64' height='64' viewBox='0 0 64 64'><circle cx='32' cy='32' r='26' fill='none' "
            f"stroke='{GRID}' stroke-width='7'/><circle cx='32' cy='32' r='26' fill='none' stroke='{stroke}' "
            f"stroke-width='7' stroke-linecap='round' stroke-dasharray='{pct * c:.1f} {c:.1f}' "
            f"transform='rotate(-90 32 32)'/><text x='32' y='37' text-anchor='middle' fill='#e2e8f0' "
            f"font-size='13' font-weight='800'>{label}</text></svg>")


def _kpi(col, icon, value, label, sub="", trend=""):
    col.markdown(f"<div class='kpi'><div class='hd'><span class='ic'>{icon}</span><span class='l'>{label}</span></div>"
                 f"<div class='v'>{value}</div><div class='s {trend}'>{html.escape(sub)}</div></div>",
                 unsafe_allow_html=True)


def _empty(text: str, href: str | None = None):
    st.markdown(f"<div class='empty'>{html.escape(text)}</div>", unsafe_allow_html=True)
    if href:
        path, icon, title, _ = PAGES[href]
        st.page_link(path, label=f"Open {title}", icon=icon)


def _ago(iso: str) -> str:
    t = datetime.fromisoformat(iso)
    s = (datetime.now(timezone.utc) - (t if t.tzinfo else t.replace(tzinfo=timezone.utc))).total_seconds()
    return "just now" if s < 60 else f"{s // 60:.0f} min ago" if s < 3600 else \
        f"{s // 3600:.0f} h ago" if s < 86400 else f"{s // 86400:.0f} d ago"


def _optional(call):
    """Features of a newer backend (recommendations, coach): None instead of an error on an older one."""
    try:
        return call()
    except api.APIError:
        return None


def render_coach_chat():
    """Chat with the AI coach at the bottom of the dashboard (history kept for this browser session)."""
    st.markdown("#### ✨ Ask your AI coach")
    st.caption("About your progress, what to practise next, or any interview question.")
    history = st.session_state.setdefault("coach_history", [])
    for turn in history:
        with st.chat_message("user" if turn["role"] == "user" else "assistant", avatar="🧑" if turn["role"] == "user" else "✨"):
            st.markdown(turn["content"])
    question = st.chat_input("Ask your coach…")
    if question:
        with st.chat_message("user", avatar="🧑"):
            st.markdown(question)
        with st.chat_message("assistant", avatar="✨"), st.spinner("Thinking…"):
            try:
                r = api.coach_ask(question, history[-6:])
                st.markdown(r["answer"])
                st.caption("Claude" if r["engine"] == "claude" else "Built-in coach")
                history += [{"role": "user", "content": question}, {"role": "assistant", "content": r["answer"]}]
            except api.APIError as e:
                st.warning("The AI coach needs the updated backend — restart it." if e.status == 404 else str(e))


def render_dashboard(user: dict):
    st.markdown(CSS, unsafe_allow_html=True)
    try:
        d = api.dashboard(fresh=st.session_state.pop("dash_refresh", False))
    except api.APIError as e:
        st.error(f"Could not load your dashboard: {e}. Is the backend running and up to date?")
        return
    k, today = d["kpis"], d["today"]
    first = html.escape((user.get("full_name") or user["username"]).split()[0])
    hour = datetime.now().hour
    hello = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
    streak = (f"🔥 {k['streak_days']}-day streak — keep it going today." if k["streak_days"]
              else "Start a streak today — one focus session or one practice counts.")

    # ---------------- hero + goals
    st.markdown(
        f"<div class='dash-hero'><div class='eyebrow'>{datetime.now():%A, %d %B}</div>"
        f"<h1>{hello}, <span>{first}</span></h1><p>{streak}</p><div class='goal-row'>"
        f"<div class='goal'>{_ring(today['focus_minutes'], today['goal_focus_minutes'], SERIES[0])}<div>"
        f"<b>{today['focus_minutes']:.0f}/{today['goal_focus_minutes']} min</b><span>Focus time today</span></div></div>"
        f"<div class='goal'>{_ring(today['practice'], today['goal_practice'], SERIES[2])}<div>"
        f"<b>{today['practice']}/{today['goal_practice']}</b><span>Speaking practice today</span></div></div>"
        f"</div></div>", unsafe_allow_html=True)
    a, b, _, r = st.columns([1, 1, 2, 0.6])
    a.page_link("views/focus_monitor.py", label="Start focus session", icon="▶️")
    b.page_link("views/interview_prep.py", label="Mock interview", icon="💼")
    if r.button("↻ Refresh", use_container_width=True, help="Data is cached for 30 seconds"):
        st.session_state["dash_refresh"] = True
        st.rerun()

    # ---------------- AI coach: today's automated insight (skipped quietly on an older backend)
    insight = _optional(api.coach_insight)
    if insight:
        engine = "Claude" if insight["engine"] == "claude" else "Built-in coach"
        st.markdown(f"<div class='fl-card' style='margin:10px 0 16px;height:auto'><b>✨ Your coach says</b> "
                    f"<span class='fl-pill'>{engine}</span><p style='margin-top:8px'>"
                    f"{html.escape(insight['answer']).replace(chr(10), '<br>')}</p></div>", unsafe_allow_html=True)

    # ---------------- KPIs
    delta = k["week_minutes"] - k["last_week_minutes"]
    cols = st.columns(6)
    _kpi(cols[0], "🎯", f"{k['avg_focus_pct']}%", "Average focus", f"{k['focus_sessions']} sessions")
    _kpi(cols[1], "⏱️", f"{k['week_minutes']:.0f} min", "Focus this week",
         f"{'↑' if delta >= 0 else '↓'} {abs(delta):.0f} min vs last week", "up" if delta >= 0 else "down")
    _kpi(cols[2], "🗣️", f"{k['avg_confidence']}%", "Speaking confidence", f"{k['practice_sessions']} practices")
    _kpi(cols[3], "💼", "—" if k["latest_readiness"] is None else f"{k['latest_readiness']:.0f}%",
         "Interview readiness", "no mock interview yet" if k["best_readiness"] is None
         else f"best {k['best_readiness']:.0f}% · {k['interview_answers']} answer{'' if k['interview_answers'] == 1 else 's'}")
    _kpi(cols[4], "🔥", k["streak_days"], "Day streak", f"{k['messages_sent']} room messages")
    _kpi(cols[5], "🏆", f"#{k['rank']}" if k["rank"] else "—", "Focus leaderboard",
         f"of {k['ranked_users']} people" if k["rank"] else "do a focus session to rank")
    st.write("")

    # ---------------- activity + next steps + fatigue
    left, right = st.columns([2, 1])
    with left:
        st.markdown("#### Focus minutes per day")
        st.caption("Last 14 days · hover a bar for practice and messages")
        act = d["activity"]
        fig = go.Figure(go.Bar(
            x=[x["label"] for x in act], y=[x["focus_minutes"] for x in act], marker_color=SERIES[0],
            marker_cornerradius=4, customdata=[[x["practice"], x["messages"]] for x in act],
            hovertemplate="%{x}<br>%{y} min focus · %{customdata[0]} practice · %{customdata[1]} msgs<extra></extra>"))
        fig.add_hline(y=today["goal_focus_minutes"], line_dash="dash", line_color=MUTED,
                      annotation_text="daily goal", annotation_font_color=MUTED)
        st.plotly_chart(_layout(fig, 260), use_container_width=True)
    with right:
        recs = _optional(api.recommendations)
        if recs:
            st.markdown("#### 🎯 Recommended for you")
            st.caption("Ranked by how much each should help — from your own data")
            for r in recs[:4]:
                path, icon, title, _ = PAGES.get(r["href"].split("?")[0], PAGES["/app/focus"])
                st.markdown(f"<div class='step'>{r['icon']} <b>{html.escape(r['title'])}</b><br>"
                            f"<small style='color:var(--fl-muted)'>{html.escape(r['reason'])}</small><br>"
                            f"<small>→ {html.escape(r['action'])}</small></div>", unsafe_allow_html=True)
                st.page_link(path, label=f"Open {title} →")
        else:
            st.markdown("#### ✨ Next steps")
            for s in d["next_steps"]:
                path, icon, title, _ = PAGES.get(s["href"], PAGES["/app/focus"])
                st.markdown(f"<div class='step'>{s['icon']} {html.escape(s['text'])}</div>", unsafe_allow_html=True)
                st.page_link(path, label=f"Open {title} →")
        st.markdown("#### 🧠 Fatigue risk")
        f = d["fatigue"]
        if f:
            color = {"low": "#22c55e", "medium": "#eab308", "high": "#ef4444"}[f["risk"]]
            st.markdown(f"<div class='fl-card'><span class='fl-pill' style='background:{color}33;color:{color};"
                        f"border-color:{color}'>{f['risk'].upper()} · {f['risk_score']:.0f}/100</span>"
                        f"<p style='margin-top:10px'>{html.escape(f['advice'])}</p></div>", unsafe_allow_html=True)
        else:
            _empty("Finish a focus session to get your machine-learning fatigue prediction.")

    # ---------------- focus
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("#### Focus by session")
        ft = d["focus_trend"]
        if ft:
            fig = go.Figure(go.Scatter(x=list(range(len(ft))), y=[x["focus"] for x in ft], mode="lines+markers",
                                       line=dict(color=SERIES[0], width=2), marker=dict(size=8),
                                       customdata=[[x["label"], x["minutes"]] for x in ft],
                                       hovertemplate="%{customdata[0]}<br>%{y}% focus · %{customdata[1]} min<extra></extra>"))
            _by_index(fig, [x["label"] for x in ft])
            st.plotly_chart(_layout(fig, 230, yaxis_range=[0, 100]), use_container_width=True)
        else:
            _empty("No focus sessions yet.", "/app/focus")
    with c2:
        st.markdown("#### Where your time goes")
        if k["focus_sessions"]:
            split = d["state_split"]
            fig = go.Figure(go.Pie(labels=list(split), values=list(split.values()), hole=0.62, sort=False,
                                   marker=dict(colors=[STATE_COLORS[s] for s in split], line=dict(color="#111a2e", width=2)),
                                   textinfo="none", hovertemplate="%{label}: %{value:.1f}%<extra></extra>"))
            fig.update_layout(annotations=[dict(text=f"{k['avg_focus_pct']}%<br>focused", showarrow=False,
                                                font=dict(size=15, color="#e2e8f0"))])
            fig = _layout(fig, 230).update_layout(
                showlegend=True, legend=dict(orientation="v", x=1, y=0.5, font=dict(color="#e2e8f0")))
            st.plotly_chart(fig, use_container_width=True)
        else:
            _empty("Your focus / distracted / drowsy split appears here.")
    with c3:
        st.markdown("#### Speaking skills")
        sk = d["skills"]
        if sk:
            labels, vals = [s["label"] for s in sk], [s["score"] for s in sk]
            fig = go.Figure(go.Scatterpolar(r=vals + vals[:1], theta=labels + labels[:1], fill="toself",
                                            line=dict(color=SERIES[0], width=2), fillcolor="rgba(57,135,229,.3)",
                                            hovertemplate="%{theta}: %{r:.0f}%<extra></extra>"))
            fig.update_layout(polar=dict(bgcolor="rgba(0,0,0,0)", radialaxis=dict(range=[0, 100], visible=False),
                                         angularaxis=dict(gridcolor=GRID)))
            st.plotly_chart(_layout(fig, 230), use_container_width=True)
        else:
            _empty("Record a speech to map your skills.", "/app/speech")

    # ---------------- speaking + interview
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### Speaking confidence")
        stt = d["speech_trend"]
        if stt:
            fig = go.Figure(go.Scatter(x=list(range(len(stt))), y=[x["confidence"] for x in stt],
                                       mode="lines+markers", line=dict(color=SERIES[0], width=2), marker=dict(size=8),
                                       customdata=[[x["label"], x["mode"]] for x in stt],
                                       hovertemplate="%{customdata[0]}<br>%{y}% · %{customdata[1]}<extra></extra>"))
            _by_index(fig, [x["label"] for x in stt])
            fig.add_hline(y=70, line_dash="dash", line_color=MUTED, annotation_text="confident",
                          annotation_font_color=MUTED)
            st.plotly_chart(_layout(fig, 230, yaxis_range=[0, 100]), use_container_width=True)
        else:
            _empty("Your confidence trend appears after your first recording.", "/app/speech")
    with c2:
        st.markdown("#### Interview readiness")
        it = d["interview_trend"]
        if it:
            fig = go.Figure(go.Bar(
                x=list(range(len(it))), y=[x["readiness"] for x in it], marker_color=SERIES[0],
                marker_cornerradius=4, width=min(0.6, 0.15 * max(len(it), 2)),
                customdata=[[x["label"], x["content"] or 0, x["delivery"] or 0, x["presence"] or 0] for x in it],
                hovertemplate="%{customdata[0]}<br>%{y:.0f}% · content %{customdata[1]:.0f} · delivery "
                              "%{customdata[2]:.0f} · presence %{customdata[3]:.0f}<extra></extra>"))
            _by_index(fig, [x["label"] for x in it])
            st.plotly_chart(_layout(fig, 230, yaxis_range=[0, 100]), use_container_width=True)
        else:
            _empty("Answer a mock-interview question to track your readiness.", "/app/interview")

    # ---------------- recent + explore
    left, right = st.columns([2, 1])
    with left:
        st.markdown("#### Recent activity")
        if d["recent"]:
            rows = "".join(
                f"<div class='feed-row'><span style='font-size:1.3rem'>{r['icon']}</span><div class='t'>"
                f"<b>{html.escape(r['title'])}</b><small>{html.escape(r.get('detail') or '')}</small></div>"
                f"<div class='sc'><b>{r['score']}%</b><small>{r['score_label']} · {_ago(r['when'])}</small></div></div>"
                for r in d["recent"])
            st.markdown(rows, unsafe_allow_html=True)
        else:
            _empty("Nothing yet — your sessions and practice show up here.")
    with right:
        st.markdown("#### Explore")
        for path, icon, title, text in PAGES.values():
            st.page_link(path, label=f"{title} — {text}", icon=icon)

    st.write("")
    render_coach_chat()
