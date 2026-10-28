"""Home page: sign in / sign up with email + mobile OTP, or — once signed in — the dashboard.

Routed by app.py (run from frontend/streamlit/: streamlit run app.py).
"""
import re

import streamlit as st

from utils import api_client as api
from utils.dashboard import render_dashboard
from utils.ui import APP_NAME, HIDE_SIDEBAR, LOGO_SVG, setup, sidebar_user

setup("Dashboard", "🎯")

COUNTRY_CODES = {
    "🇮🇳 India (+91)": "+91", "🇺🇸 USA / Canada (+1)": "+1", "🇬🇧 United Kingdom (+44)": "+44",
    "🇦🇪 UAE (+971)": "+971", "🇸🇦 Saudi Arabia (+966)": "+966", "🇸🇬 Singapore (+65)": "+65",
    "🇦🇺 Australia (+61)": "+61", "🇩🇪 Germany (+49)": "+49", "🇵🇰 Pakistan (+92)": "+92",
    "🇧🇩 Bangladesh (+880)": "+880", "🇳🇵 Nepal (+977)": "+977", "🇱🇰 Sri Lanka (+94)": "+94",
    "🇧🇹 Bhutan (+975)": "+975", "🇲🇾 Malaysia (+60)": "+60", "🇮🇩 Indonesia (+62)": "+62",
    "🇹🇭 Thailand (+66)": "+66", "🇻🇳 Vietnam (+84)": "+84",
    "🇯🇵 Japan (+81)": "+81", "🇰🇷 South Korea (+82)": "+82", "🇨🇳 China (+86)":  "+86",
    
}


def _signed_in(auth: dict):
    st.session_state["token"] = auth["access_token"]
    st.session_state["user"] = auth["user"]
    for k in ("pending", "otp_login_for", "reset_for"):
        st.session_state.pop(k, None)
    st.rerun()


def _mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}{'•' * max(len(name) - 2, 1)}@{domain}"


def _mask_phone(phone: str) -> str:
    return f"{phone[:3]} ••••• {phone[-3:]}" if phone else ""


def _dev_hint(codes: dict | None):
    if codes:
        shown = " · ".join(f"{'Email' if k == 'email' else 'SMS'}: <b>{v}</b>" for k, v in codes.items())
        st.markdown(f"<div class='fl-otp-dev'>🧪 Dev mode — AWS SES/SNS not configured, so codes are shown here "
                    f"instead of being sent. {shown}</div>", unsafe_allow_html=True)


def _start_verification(info: dict, dev_codes: dict | None = None):
    st.session_state["pending"] = {**info, "dev_codes": dev_codes or {}}
    st.rerun()


# ======================================================================= signed in
if st.session_state.get("token"):
    user = st.session_state["user"]
    sidebar_user()
    render_dashboard(user)
    st.stop()

# ======================================================================= signed out
st.markdown(HIDE_SIDEBAR, unsafe_allow_html=True)
hero, panel = st.columns([1.1, 1], gap="large")

with hero:
    st.markdown(f"""
<div class='fl-hero'>
  <div class='fl-brand'>{LOGO_SVG}{APP_NAME}</div>
  <span class='fl-pill'>Computer vision · NLP · Speech AI · Machine learning</span>
  <h1>Stay focused.<br><span>Speak with confidence.</span></h1>
  <p class='lead'>Real-time distraction &amp; drowsiness detection from your webcam, an AI speech coach,
     fatigue prediction and focus-aware conversations — in one place.</p>
  <ul>
    <li>🎥 Live focus %, blink rate, yawns, head pose &amp; gaze</li>
    <li>🗣️ Pronunciation, pace, filler words &amp; confidence coaching</li>
    <li>🧠 Machine-learning fatigue risk that learns from you</li>
    <li>💬 Chat rooms with live focus, sentiment &amp; confidence analysis</li>
    <li>🔐 Email + mobile OTP verification · data on AWS RDS &amp; S3</li>
  </ul>
</div>""", unsafe_allow_html=True)

with panel:
    pending = st.session_state.get("pending")

    # ---------------------------------------------------------------- verify step
    if pending:
        st.markdown("### ✉️ Verify your account")
        st.caption("Enter the 6-digit codes we sent to your email and your mobile number.")
        _dev_hint(pending.get("dev_codes"))
        for channel, label, target, done_key in (
            ("email", "📧 Email", _mask_email(pending["email"]), "email_verified"),
            ("sms", "📱 Mobile", _mask_phone(pending.get("phone") or ""), "phone_verified"),
        ):
            with st.container(border=True):
                if pending.get(done_key):
                    st.success(f"{label} {target} — verified")
                    continue
                st.markdown(f"**{label}** · code sent to `{target}`")
                c1, c2, c3 = st.columns([2, 1, 1])
                code = c1.text_input("Code", key=f"code_{channel}", max_chars=6, placeholder="123456",
                                     label_visibility="collapsed")
                if c2.button("Verify", key=f"verify_{channel}", type="primary", use_container_width=True):
                    try:
                        res = api.verify(pending["user_id"], channel, code)
                        pending.update(email_verified=res["email_verified"], phone_verified=res["phone_verified"])
                        if res.get("token"):
                            _signed_in(res["token"])
                        st.rerun()
                    except api.APIError as e:
                        st.error(str(e))
                if c3.button("Resend", key=f"resend_{channel}", use_container_width=True):
                    try:
                        res = api.resend(pending["user_id"], channel)
                        if res.get("dev_code"):
                            pending.setdefault("dev_codes", {})[channel] = res["dev_code"]
                        st.toast(res["message"])
                        st.rerun()
                    except api.APIError as e:
                        st.error(str(e))
        if st.button("← Back to sign in"):
            st.session_state.pop("pending", None)
            st.rerun()
        st.stop()

    t_in, t_up, t_otp, t_reset = st.tabs(["🔐 Sign in", "✨ Sign up", "📲 OTP login", "🔑 Reset password"])

    # ---------------------------------------------------------------- password sign-in
    with t_in:
        with st.form("signin"):
            ident = st.text_input("Username, email or mobile number", placeholder="you@example.com or +9198…")
            password = st.text_input("Password", type="password")
            if st.form_submit_button("Sign in", type="primary", use_container_width=True):
                try:
                    _signed_in(api.login(ident.strip(), password))
                except api.APIError as e:
                    if e.status == 403 and isinstance(e.detail, dict) and e.detail.get("code") == "unverified":
                        info, dev = e.detail, {}
                        for ch, done in (("email", info["email_verified"]), ("sms", info["phone_verified"])):
                            if not done:
                                try:
                                    code = api.resend(info["user_id"], ch).get("dev_code")
                                    if code:
                                        dev[ch] = code
                                except api.APIError:
                                    pass  # a code was sent moments ago — the user can press Resend
                        _start_verification(info, dev)
                    st.error(str(e))

    # ---------------------------------------------------------------- sign-up
    with t_up:
        with st.form("signup"):
            c1, c2 = st.columns(2)
            full_name = c1.text_input("Full name", placeholder="Neha Sharma")
            username = c2.text_input("Username", placeholder="neha_s", help="3-50 letters, numbers, . _ -")
            email = st.text_input("Email", placeholder="you@example.com")
            c1, c2 = st.columns([1.2, 2])
            country = c1.selectbox("Country code", list(COUNTRY_CODES))
            mobile = c2.text_input("Mobile number", placeholder="98765 43210")
            c1, c2 = st.columns(2)
            pw = c1.text_input("Password", type="password", help="At least 8 characters with letters and numbers")
            pw2 = c2.text_input("Confirm password", type="password")
            agree = st.checkbox("I agree to the Terms and Privacy Policy")
            if st.form_submit_button("Create account", type="primary", use_container_width=True):
                digits = re.sub(r"\D", "", mobile).lstrip("0")
                if pw != pw2:
                    st.error("Passwords do not match")
                elif not agree:
                    st.error("Please accept the Terms to continue")
                elif not digits:
                    st.error("Enter your mobile number")
                else:
                    try:
                        res = api.register(username.strip(), full_name.strip(), email.strip(),
                                           COUNTRY_CODES[country] + digits, pw)
                        _start_verification({"user_id": res["user_id"], "email": res["email"], "phone": res["phone"],
                                             "email_verified": False, "phone_verified": False}, res.get("dev_codes"))
                    except api.APIError as e:
                        st.error(str(e))

    # ---------------------------------------------------------------- OTP sign-in
    with t_otp:
        st.caption("Get a one-time code on your verified email or mobile number — no password needed.")
        target = st.session_state.get("otp_login_for")
        if not target:
            ident = st.text_input("Email or mobile number (with country code)", key="otp_ident",
                                  placeholder="you@example.com or +919876543210")
            if st.button("Send code", type="primary", use_container_width=True, key="otp_send"):
                try:
                    res = api.request_otp(ident.strip(), "login")
                    st.session_state["otp_login_for"] = {"ident": ident.strip(), "dev": res.get("dev_code")}
                    st.rerun()
                except api.APIError as e:
                    st.error(str(e))
        else:
            st.info(f"If an account exists for **{target['ident']}**, a code is on its way.")
            if target.get("dev"):
                _dev_hint({"email" if "@" in target["ident"] else "sms": target["dev"]})
            code = st.text_input("6-digit code", max_chars=6, key="otp_code")
            c1, c2 = st.columns(2)
            if c1.button("Sign in", type="primary", use_container_width=True, key="otp_signin"):
                try:
                    _signed_in(api.otp_login(target["ident"], code))
                except api.APIError as e:
                    st.error(str(e))
            if c2.button("Use a different account", use_container_width=True, key="otp_back"):
                st.session_state.pop("otp_login_for", None)
                st.rerun()

    # ---------------------------------------------------------------- password reset
    with t_reset:
        target = st.session_state.get("reset_for")
        if not target:
            st.caption("We'll send a reset code to your email or mobile number.")
            ident = st.text_input("Email or mobile number", key="reset_ident")
            if st.button("Send reset code", type="primary", use_container_width=True, key="reset_send"):
                try:
                    res = api.request_otp(ident.strip(), "reset")
                    st.session_state["reset_for"] = {"ident": ident.strip(), "dev": res.get("dev_code")}
                    st.rerun()
                except api.APIError as e:
                    st.error(str(e))
        else:
            st.info(f"If an account exists for **{target['ident']}**, a reset code is on its way.")
            if target.get("dev"):
                _dev_hint({"email" if "@" in target["ident"] else "sms": target["dev"]})
            with st.form("reset"):
                code = st.text_input("6-digit code", max_chars=6)
                new_pw = st.text_input("New password", type="password")
                if st.form_submit_button("Update password", type="primary", use_container_width=True):
                    try:
                        st.success(api.reset_password(target["ident"], code, new_pw)["message"])
                        st.session_state.pop("reset_for", None)
                    except api.APIError as e:
                        st.error(str(e))

st.markdown("<p style='text-align:center;color:#64748b;font-size:.82rem;margin-top:30px'>Video and audio are "
            "analysed live and never stored · Passwords are bcrypt-hashed · One-time codes expire in 10 minutes</p>",
            unsafe_allow_html=True)
