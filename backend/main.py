"""FocusLink AI backend.

Run:  uvicorn backend.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import init_db
from backend.routers import analytics_routes, attention_routes, auth_routes, chat_routes, speech_routes


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(auth_routes.router)
app.include_router(attention_routes.router)
app.include_router(chat_routes.router)
app.include_router(analytics_routes.router)
app.include_router(speech_routes.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "aws": settings.AWS_ENABLED}
