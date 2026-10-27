"""Thin REST client for the FastAPI backend."""
import os

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
BACKEND_WS_URL = os.getenv("BACKEND_WS_URL", BACKEND_URL.replace("http", "ws", 1)).rstrip("/")


class APIError(Exception):
    pass


def _headers(token: str | None = None) -> dict:
    token = token or st.session_state.get("token")
    return {"Authorization": f"Bearer {token}"} if token else {}


def _request(method: str, path: str, token: str | None = None, **kwargs):
    try:
        r = requests.request(method, f"{BACKEND_URL}{path}", headers=_headers(token), timeout=10, **kwargs)
    except requests.ConnectionError as exc:
        raise APIError(f"Backend not reachable at {BACKEND_URL}. Is it running?") from exc
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail")
        except ValueError:
            detail = r.text
        raise APIError(detail if isinstance(detail, str) else str(detail))
    return r.json()


# ---- auth
def register(username, email, password):
    return _request("POST", "/auth/register", json={"username": username, "email": email, "password": password})


def login(username, password):
    return _request("POST", "/auth/login", json={"username": username, "password": password})


# ---- attention
def push_focus(metrics: dict, token: str | None = None):
    return _request("POST", "/attention/update", token=token, json=metrics)


def save_session(payload: dict):
    return _request("POST", "/attention/sessions", json=payload)


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
