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

from app import mongo
from app.config import settings
from app.database import describe, engine, init_db, ping
from app.mcp_server import http_app as mcp_http_app
from app.mcp_server import mcp
from app.routers import (ai_routes, analytics_routes, attention_routes, auth_routes, chat_routes, coach_routes,
                    interview_routes, meet_routes, routine_routes, speech_routes)


mcp_app = mcp_http_app()  # None unless MCP_API_KEY is set


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if mongo.enabled():
        mongo.sync_in_background(engine)  # bring the MongoDB mirror up to date with SQL
    if mcp_app is None:
        yield
    else:
        async with mcp.session_manager.run():  # MCP streamable-HTTP sessions
            yield
    mongo.flush()  # finish mirror writes before exiting


app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)
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


@app.get("/", include_in_schema=False)
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}


# Bump when the frontend starts relying on new endpoints; the React app compares it with what it needs and shows
# "backend out of date — restart it" instead of failing with 404s.
API_VERSION = 6
FEATURES = ["dashboard", "conversation", "interview", "body-language", "crud", "recommendations", "ai-coach",
            "meet", "guest", "routine"]


@app.get("/health")
def health():
    ms, mongo_ms = ping(), mongo.ping()
    db = describe()
    return {"status": "ok" if ms is not None else "degraded", "app": settings.APP_NAME, "api_version": API_VERSION,
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
