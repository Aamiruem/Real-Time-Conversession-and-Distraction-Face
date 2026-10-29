"""Camera recordings: upload, list, play back and delete.

The details (duration, quality, focus timeline...) are a row in the SQL database (SQLite locally, PostgreSQL on
AWS RDS), which the MongoDB mirror copies like every other table. The video itself goes to S3 when AWS_ENABLED,
otherwise to RECORDINGS_DIR on the backend's disk.
"""
import json
import logging
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import mongo
from app.auth import get_current_user
from app.config import settings
from app.database import describe, get_db
from app.models import Recording, User
from app.services.aws_service import s3

router = APIRouter(prefix="/recordings", tags=["recordings"])
log = logging.getLogger("presence.recordings")

QUALITIES = {"low", "medium", "high"}
SPEEDS = {"eco", "balanced", "realtime"}
TYPES = {"video/webm": "webm", "video/mp4": "mp4"}
CHUNK = 1024 * 1024


class RecordingOut(BaseModel):
    id: int
    room_id: int | None
    title: str
    source: str
    mime_type: str
    size_bytes: int
    duration_sec: float
    quality: str
    speed: str
    avg_focus: float | None
    focused_pct: float | None
    storage: str
    created_at: datetime
    timeline: list[dict] | None = None
    saved_to: list[str] | None = None


def to_out(r: Recording, with_timeline: bool = False) -> RecordingOut:
    fields = {k: getattr(r, k) for k in RecordingOut.model_fields if k not in ("timeline", "saved_to")}
    return RecordingOut(**fields, timeline=json.loads(r.timeline) if with_timeline else None)


def saved_to(r: Recording) -> list[str]:
    """Where this recording now lives, e.g. ["postgresql (aws-rds)", "mongodb", "s3"]."""
    db = describe()
    where = [db["engine"] if db["location"] == "local" else f"{db['engine']} ({db['location']})"]
    if mongo.enabled():
        where.append("mongodb")
    where.append("s3" if r.storage == "s3" else "disk")
    return where


def _local_path(key: str) -> Path:
    path = (settings.RECORDINGS_DIR / key).resolve()
    if settings.RECORDINGS_DIR.resolve() not in path.parents:
        raise HTTPException(404, "Recording file not found")
    return path


def _parse_timeline(raw: str) -> list[dict]:
    try:
        items = json.loads(raw or "[]")
    except ValueError as exc:
        raise HTTPException(422, "timeline must be a JSON list") from exc
    if not isinstance(items, list):
        raise HTTPException(422, "timeline must be a JSON list")
    out = []
    for s in items[:36_000]:  # 10 hours of one-a-second samples
        if isinstance(s, dict) and isinstance(s.get("focus"), int | float):
            out.append({"t": float(s.get("t", 0)), "focus": round(float(s["focus"]), 1),
                        "state": str(s.get("state", ""))[:20]})
    return out


@router.post("", response_model=RecordingOut)
def upload(
    video: UploadFile = File(..., description="The recording: webm or mp4"),
    title: str = Form(""),
    source: str = Form("rooms"),
    room_id: int | None = Form(None),
    duration_sec: float = Form(0, ge=0),
    quality: str = Form("medium"),
    speed: str = Form("realtime"),
    timeline: str = Form("[]", description='JSON list of {"t": seconds, "focus": 0-100, "state": "Focused"}'),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a camera recording and its focus timeline."""
    mime = (video.content_type or "").split(";")[0].strip()
    if mime not in TYPES:
        raise HTTPException(415, "Upload a webm or mp4 video")
    samples = _parse_timeline(timeline)
    limit = settings.RECORDING_MAX_MB * CHUNK

    # spool to a temp file first: checks the size without holding a large video in memory
    with tempfile.SpooledTemporaryFile(max_size=8 * CHUNK) as tmp:
        size = 0
        while chunk := video.file.read(CHUNK):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, f"Recording is larger than {settings.RECORDING_MAX_MB} MB")
            tmp.write(chunk)
        if not size:
            raise HTTPException(400, "The recording is empty")
        tmp.seek(0)

        key = f"user_{user.id}/{uuid.uuid4().hex}.{TYPES[mime]}"
        storage, client = "local", s3()
        if client is not None:
            try:
                client.upload_fileobj(tmp, settings.S3_BUCKET, f"recordings/{key}", ExtraArgs={"ContentType": mime})
                storage = "s3"
            except Exception as exc:  # noqa: BLE001 - S3 down / no permission: keep the video on disk instead
                log.warning("S3 upload failed, saving the recording locally: %s", exc)
                tmp.seek(0)
        if storage == "local":
            path = _local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("wb") as f:
                shutil.copyfileobj(tmp, f, CHUNK)

    focus = [s["focus"] for s in samples]
    rec = Recording(
        user_id=user.id, room_id=room_id, title=title.strip()[:120] or "Camera recording", source=source[:20],
        mime_type=mime, size_bytes=size, duration_sec=round(duration_sec, 1),
        quality=quality if quality in QUALITIES else "medium", speed=speed if speed in SPEEDS else "realtime",
        avg_focus=round(sum(focus) / len(focus), 1) if focus else None,
        focused_pct=round(100 * sum(s["state"] == "Focused" for s in samples) / len(samples), 1) if samples else None,
        timeline=json.dumps(samples), storage=storage, storage_key=key,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    out = to_out(rec)
    out.saved_to = saved_to(rec)
    return out


@router.get("", response_model=list[RecordingOut])
def list_recordings(limit: int = 50, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Your recordings, newest first."""
    rows = db.scalars(select(Recording).where(Recording.user_id == user.id)
                      .order_by(Recording.created_at.desc()).limit(min(max(limit, 1), 200)))
    return [to_out(r) for r in rows]


def _own(rec_id: int, user: User, db: Session) -> Recording:
    rec = db.get(Recording, rec_id)
    if rec is None or rec.user_id != user.id:
        raise HTTPException(404, "Recording not found")
    return rec


@router.get("/{rec_id}", response_model=RecordingOut)
def get_recording(rec_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One recording with its focus timeline."""
    rec = _own(rec_id, user, db)
    out = to_out(rec, with_timeline=True)
    out.saved_to = saved_to(rec)
    return out


@router.get("/{rec_id}/file")
def download(rec_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The video file (streamed through the API, so S3 needs no public access or CORS rules)."""
    rec = _own(rec_id, user, db)
    name = f"{rec.title} {rec.created_at:%Y-%m-%d %H-%M}.{TYPES.get(rec.mime_type, 'webm')}"
    if rec.storage == "s3":
        client = s3()
        if client is None:
            raise HTTPException(503, "This recording is stored in S3, but AWS is turned off (AWS_ENABLED)")
        try:
            obj = client.get_object(Bucket=settings.S3_BUCKET, Key=f"recordings/{rec.storage_key}")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(404, "Recording file not found in S3") from exc
        return StreamingResponse(obj["Body"].iter_chunks(CHUNK), media_type=rec.mime_type,
                                 headers={"Content-Disposition": f'attachment; filename="{name}"'})
    path = _local_path(rec.storage_key)
    if not path.is_file():
        raise HTTPException(404, "Recording file not found")
    return FileResponse(path, media_type=rec.mime_type, filename=name)


def remove_files(recordings: list[Recording]):
    """Delete the video files behind these recordings (S3 or disk); missing files are fine."""
    for rec in recordings:
        try:
            if rec.storage == "s3":
                if client := s3():
                    client.delete_object(Bucket=settings.S3_BUCKET, Key=f"recordings/{rec.storage_key}")
            else:
                _local_path(rec.storage_key).unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001 - the row still goes; a stray file is harmless
            log.warning("Could not delete recording file %s: %s", rec.storage_key, exc)


@router.delete("/{rec_id}")
def delete_recording(rec_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = _own(rec_id, user, db)
    remove_files([rec])
    db.delete(rec)
    db.commit()
    return {"ok": True}
