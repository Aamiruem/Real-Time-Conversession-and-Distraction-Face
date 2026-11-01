"""Presence AI backend.

Run, from anywhere:   run-backend.ps1 in the project folder (stops an old backend on the port first)
          or:         python backend/app/main.py   (also works as `python main.py` inside backend/app)
          or (dev):   cd backend; uvicorn app.main:app --port 8010
Docs: http://localhost:8010/docs   (the website + app is the React frontend in frontend/)
MCP:  python -m app.mcp_server (stdio), or POST /mcp with  Authorization: Bearer $MCP_API_KEY
"""
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

if __package__ in (None, ""):  # started as a script (python main.py): make the `app` package importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.native_preload  # noqa: F401,I001  (must come before anything that loads scikit-learn)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app import mongo
from app.config import SETUP_PROBLEMS, settings
from app.database import describe, engine, init_db, ping
from app.secret_store import ensure_secret_key
from app.mcp_server import http_app as mcp_http_app
from app.mcp_server import mcp
from app.routers import (ai_routes, analytics_routes, attention_routes, auth_routes, chat_routes, coach_routes,
                    interview_routes, meet_routes, recording_routes, routine_routes, speech_routes)


mcp_app = mcp_http_app()  # None unless MCP_API_KEY is set


_prepared = False


def prepare():
    """Tables + signing key, once per process. Runs at startup, and before the first request in case a serverless
    host skips startup. A failure is reported on /health instead of crashing every request."""
    global _prepared
    if _prepared or SETUP_PROBLEMS:
        return
    try:
        init_db()
        ensure_secret_key(engine)
        _prepared = True
    except Exception as exc:  # noqa: BLE001
        SETUP_PROBLEMS.append(f"The database can't be reached ({exc.__class__.__name__}): DATABASE_URL must point to "
                              "an online PostgreSQL (Neon / Supabase), not localhost - fix it and redeploy")


@asynccontextmanager
async def lifespan(_: FastAPI):
    prepare()
    if mongo.enabled():
        mongo.sync_in_background(engine)  # bring the MongoDB mirror up to date with SQL
    if mcp_app is None:
        yield
    else:
        async with mcp.session_manager.run():  # MCP streamable-HTTP sessions
            yield
    mongo.flush()  # finish mirror writes before exiting


class StripApiPrefix:
    """Serve every route under /api too: behind Vercel services the backend gets the public path (/api/auth/me),
    while the Vite proxy, Nginx and Render send it without the prefix (/auth/me). /api is kept as root_path, so the
    docs page at /api/docs still finds /api/openapi.json."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] in ("http", "websocket") and (path == "/api" or path.startswith("/api/")):
            path = path[4:] or "/"
            scope = {**scope, "path": path, "raw_path": path.encode(),
                     "root_path": scope.get("root_path", "") + "/api"}
        await self.app(scope, receive, send)


class SetupGuard:
    """While SETUP_PROBLEMS lists something, answer 503 with the fix (except /health and CORS preflights)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            prepare()
        if SETUP_PROBLEMS and scope["type"] in ("http", "websocket") and scope.get("path") != "/health" \
                and scope.get("method") != "OPTIONS":
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1011})
                return
            await JSONResponse({"detail": "Server setup problem: " + "; ".join(SETUP_PROBLEMS)}, 503)(
                scope, receive, send)
            return
        await self.app(scope, receive, send)


app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)
app.add_middleware(SetupGuard)
app.add_middleware(StripApiPrefix)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1024)  # dashboards and question banks shrink ~5-8x

app.include_router(auth_routes.router)
app.include_router(attention_routes.router)
app.include_router(chat_routes.router)
app.include_router(analytics_routes.router)
app.include_router(speech_routes.router)
app.include_router(ai_routes.router)
app.include_router(interview_routes.router)
app.include_router(coach_routes.router)
app.include_router(meet_routes.router)
app.include_router(routine_routes.router)
app.include_router(recording_routes.router)


@app.get("/", include_in_schema=False)
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}


# Bump when the frontend starts relying on new endpoints; the React app compares it with what it needs and shows
# "backend out of date — restart it" instead of failing with 404s.
API_VERSION = 8
FEATURES = ["dashboard", "conversation", "interview", "body-language", "crud", "recommendations", "ai-coach",
            "meet", "meet-host", "guest", "routine", "recordings"]


@app.get("/health")
def health():
    ms, mongo_ms = ping(), mongo.ping()
    db = describe()
    status = "misconfigured" if SETUP_PROBLEMS else "ok" if ms is not None else "degraded"
    return {"status": status, "problems": SETUP_PROBLEMS, "app": settings.APP_NAME, "api_version": API_VERSION,
            "features": FEATURES, "aws": settings.AWS_ENABLED, "mcp": mcp_app is not None,
            # where data is stored (no host or credentials: this endpoint is public)
            "database": {"engine": db["engine"], "location": db["location"], "connected": ms is not None,
                         "latency_ms": ms},
            "mongodb": {"enabled": mongo.enabled(), "connected": mongo_ms is not None, "latency_ms": mongo_ms}}


if mcp_app is not None:
    # Mounted last at "/" so every API route above matches first; the MCP app itself only answers /mcp.
    app.mount("/", mcp_app)


if __name__ == "__main__":
    import socket

    import uvicorn

    port = int(os.getenv("PORT", "8010"))
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            sys.exit(f"Port {port} is already in use - probably an older backend. Stop it (Ctrl+C in its window, "
                     "or run run-backend.ps1 in the project folder, which does it for you), or use another port: "
                     "$env:PORT=8011")
    uvicorn.run(app, host="127.0.0.1", port=port)
