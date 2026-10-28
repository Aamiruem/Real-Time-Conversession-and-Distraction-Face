"""Thin REST client for the FastAPI backend."""
import os

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8010").rstrip("/")
BACKEND_WS_URL = os.getenv("BACKEND_WS_URL", BACKEND_URL.replace("http", "ws", 1)).rstrip("/")


class APIError(Exception):
    """`str(e)` is a readable message; `e.status` / `e.detail` keep the structured response."""

    def __init__(self, message: str, status: int = 0, detail=None):
        super().__init__(message)
        self.status = status
        self.detail = detail


def _message(detail) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        return detail.get("message") or str(detail)
    if isinstance(detail, list):  # pydantic validation errors
        parts = []
        for err in detail:
            field = str(err.get("loc", ["", ""])[-1]).replace("_", " ")
            msg = err.get("msg", "").removeprefix("Value error, ")
            if "pattern" in msg and field == "phone":
                msg = "enter a valid mobile number with country code"
            elif "pattern" in msg and field == "username":
                msg = "use only letters, numbers, dot, dash or underscore"
            parts.append(f"{field.capitalize()}: {msg}")
        return " · ".join(parts)
    return str(detail)


def _headers(token: str | None = None) -> dict:
    token = token or st.session_state.get("token")
    return {"Authorization": f"Bearer {token}"} if token else {}


_http = requests.Session()  # keep-alive: reuses the TCP connection to the API across calls


def _request(method: str, path: str, token: str | None = None, **kwargs):
    try:
        r = _http.request(method, f"{BACKEND_URL}{path}", headers=_headers(token),
                          timeout=kwargs.pop("timeout", 10), **kwargs)
    except requests.ConnectionError as exc:
        raise APIError(f"Backend not reachable at {BACKEND_URL}. Is it running?") from exc
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail")
        except ValueError:
            detail = r.text
        raise APIError(_message(detail), r.status_code, detail)
    return r.json()


# ---- auth
def register(username, full_name, email, phone, password):
    return _request("POST", "/auth/register", json={"username": username, "full_name": full_name, "email": email,
                                                    "phone": phone, "password": password})


def verify(user_id, channel, code):
    return _request("POST", "/auth/verify", json={"user_id": user_id, "channel": channel, "code": code})


def resend(user_id, channel):
    return _request("POST", "/auth/resend", json={"user_id": user_id, "channel": channel})


def login(identifier, password):
    return _request("POST", "/auth/login", json={"identifier": identifier, "password": password})


def request_otp(identifier, purpose="login"):
    return _request("POST", "/auth/otp/request", json={"identifier": identifier, "purpose": purpose})


def otp_login(identifier, code):
    return _request("POST", "/auth/otp/login", json={"identifier": identifier, "code": code})


def reset_password(identifier, code, new_password):
    return _request("POST", "/auth/password/reset",
                    json={"identifier": identifier, "code": code, "new_password": new_password})


def me(token):
    return _request("GET", "/auth/me", token=token)


# ---- attention
def push_focus(metrics: dict, token: str | None = None):
    return _request("POST", "/attention/update", token=token, json=metrics)


def save_session(payload: dict):
    _cached_get.clear()
    return _request("POST", "/attention/sessions", json=payload)


def session_feedback(session_id, self_fatigue: int):
    return _request("PATCH", f"/attention/sessions/{session_id}/feedback", json={"self_fatigue": self_fatigue})


def delete_session(session_id):
    return _request("DELETE", f"/attention/sessions/{session_id}")


def sessions():
    return _request("GET", "/attention/sessions")


def snapshots(limit=300):
    return _request("GET", f"/attention/snapshots?limit={limit}")


# ---- chat
def rooms():
    return _request("GET", "/rooms")


def create_room(name, description=""):
    return _request("POST", "/rooms", json={"name": name, "description": description})


def messages(room_id, limit=100):
    return _request("GET", f"/rooms/{room_id}/messages?limit={limit}")


def send_message(room_id, content):
    return _request("POST", f"/rooms/{room_id}/messages", json={"content": content})


def participants(room_id):
    return _request("GET", f"/rooms/{room_id}/participants")


def insights(room_id):
    return _request("GET", f"/rooms/{room_id}/insights")


# ---- analytics
def my_summary():
    return _request("GET", "/analytics/me")


def leaderboard():
    return _request("GET", "/analytics/leaderboard")


@st.cache_data(ttl=30, show_spinner=False)
def _cached_get(path: str, token: str):
    return _request("GET", path, token=token)


def dashboard(fresh: bool = False):
    """KPIs, goals, trends, skills, activity and next steps for the home dashboard (one call, cached 30 s)."""
    if fresh:
        _cached_get.clear()
    return _cached_get("/analytics/dashboard", st.session_state.get("token") or "")


# ---- speech coach
def save_speech(report: dict, mode: str, prompt: str):
    _cached_get.clear()  # the dashboard should show the new result straight away
    return _request("POST", "/speech/sessions", json={"report": report, "mode": mode, "prompt": prompt})


def speech_sessions():
    return _request("GET", "/speech/sessions")


def latest_speech():
    return _request("GET", "/speech/sessions/latest")


def delete_speech(session_id):
    return _request("DELETE", f"/speech/sessions/{session_id}")


# ---- AI: machine learning + NLP
def model_card():
    return _request("GET", "/ml/model")


def predict_fatigue(features: dict):
    return _request("POST", "/ml/predict", json=features)


def my_fatigue():
    return _request("GET", "/ml/fatigue/me")


def analyze_text(text: str):
    return _request("POST", "/nlp/analyze", json={"text": text})


# ---- coaching: recommendations + AI coach
def recommendations():
    return _request("GET", "/recommendations")


def coach_ask(question: str, history: list[dict] | None = None):
    return _request("POST", "/coach/ask", json={"question": question, "history": history or []}, timeout=60)


def coach_insight():
    return _request("GET", "/coach/insight")


# ---- account (CRUD)
def update_profile(full_name: str):
    return _request("PATCH", "/auth/me", json={"full_name": full_name})


def change_password(current_password: str, new_password: str):
    return _request("POST", "/auth/password", json={"current_password": current_password, "new_password": new_password})


def delete_account(password: str):
    return _request("DELETE", "/auth/me", json={"password": password})
