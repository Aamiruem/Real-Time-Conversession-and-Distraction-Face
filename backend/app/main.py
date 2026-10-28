"""Presence AI backend.

Run (from backend/):  uvicorn app.main:app --reload --port 8010
Docs: http://localhost:8010/docs   (the public website + app is the Next.js frontend in frontend/)
MCP:  python -m app.mcp_server (stdio), or POST /mcp with  Authorization: Bearer $MCP_API_KEY
"""
from contextlib import asynccontextmanager

import app.native_preload  # noqa: F401,I001  (must come before anything that loads scikit-learn)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.database import init_db
from app.mcp_server import http_app as mcp_http_app
from app.mcp_server import mcp
from app.routers import (ai_routes, analytics_routes, attention_routes, auth_routes, chat_routes, coach_routes,
                         interview_routes, speech_routes)


mcp_app = mcp_http_app()  # None unless MCP_API_KEY is set


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if mcp_app is None:
        yield
    else:
        async with mcp.session_manager.run():  # MCP streamable-HTTP sessions
            yield


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


@app.get("/", include_in_schema=False)
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}


# Bump when the frontend starts relying on new endpoints; the React app compares it with what it needs and shows
# "backend out of date — restart it" instead of failing with 404s.
API_VERSION = 4
FEATURES = ["dashboard", "conversation", "interview", "body-language", "crud", "recommendations", "ai-coach"]


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "api_version": API_VERSION, "features": FEATURES,
            "aws": settings.AWS_ENABLED, "mcp": mcp_app is not None}


if mcp_app is not None:
    # Mounted last at "/" so every API route above matches first; the MCP app itself only answers /mcp.
    app.mount("/", mcp_app)
