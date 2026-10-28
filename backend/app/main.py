"""FocusLink AI backend.

Run:  uvicorn backend.main:app --reload --port 8010
Docs: http://localhost:8010/docs   (the public website + app is the Next.js frontend in web/)
MCP:  python -m backend.mcp_server (stdio), or POST /mcp with  Authorization: Bearer $MCP_API_KEY
"""
from contextlib import asynccontextmanager

import backend.native_preload  # noqa: F401,I001  (must come before anything that loads scikit-learn)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import init_db
from backend.mcp_server import http_app as mcp_http_app
from backend.mcp_server import mcp
from backend.routers import ai_routes, analytics_routes, attention_routes, auth_routes, chat_routes, speech_routes


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

app.include_router(auth_routes.router)
app.include_router(attention_routes.router)
app.include_router(chat_routes.router)
app.include_router(analytics_routes.router)
app.include_router(speech_routes.router)
app.include_router(ai_routes.router)


@app.get("/", include_in_schema=False)
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "aws": settings.AWS_ENABLED, "mcp": mcp_app is not None}


if mcp_app is not None:
    # Mounted last at "/" so every API route above matches first; the MCP app itself only answers /mcp.
    app.mount("/", mcp_app)
