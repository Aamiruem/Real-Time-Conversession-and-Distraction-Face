"""Rooms, message history, NLP insights and the real-time WebSocket endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import decode_token, get_current_user
from backend.database import SessionLocal, get_db
from backend.models import Message, Room, User
from backend.schemas import MessageCreate, MessageOut, RoomCreate, RoomOut
from backend.services import nlp_service
from backend.websocket_manager import manager

router = APIRouter(tags=["chat"])


def to_out(m: Message) -> dict:
    return MessageOut(
        id=m.id,
        room_id=m.room_id,
        username=m.user.username,
        content=m.content,
        sentiment_label=m.sentiment_label,
        sentiment_score=m.sentiment_score,
        is_toxic=m.is_toxic,
        keywords=[k for k in m.keywords.split(",") if k],
        sender_focus=m.sender_focus,
        created_at=m.created_at,
    ).model_dump(mode="json")


def store_message(db: Session, room_id: int, user: User, content: str) -> dict:
    nlp = nlp_service.analyze_message(content)
    msg = Message(
        room_id=room_id,
        user_id=user.id,
        content=content,
        sentiment_label=nlp["sentiment_label"],
        sentiment_score=nlp["sentiment_score"],
        is_toxic=nlp["is_toxic"],
        keywords=",".join(nlp["keywords"]),
        sender_focus=manager.focus.get(user.id, {}).get("focus_pct"),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return to_out(msg)


@router.get("/rooms", response_model=list[RoomOut])
def list_rooms(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Room).order_by(Room.created_at)))


@router.post("/rooms", response_model=RoomOut)
def create_room(data: RoomCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.scalar(select(Room).where(Room.name == data.name)):
        raise HTTPException(400, "Room name already exists")
    room = Room(name=data.name, description=data.description, created_by=user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.get("/rooms/{room_id}/messages")
def history(room_id: int, limit: int = 100, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Message).where(Message.room_id == room_id).order_by(Message.created_at.desc()).limit(limit)
    )
    return [to_out(m) for m in reversed(list(rows))]


@router.post("/rooms/{room_id}/messages")
async def post_message(
    room_id: int, data: MessageCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """REST fallback for sending a message; it is still broadcast live over WebSocket."""
    if not db.get(Room, room_id):
        raise HTTPException(404, "Room not found")
    out = store_message(db, room_id, user, data.content)
    await manager.broadcast(room_id, {"type": "chat", **out})
    return out


@router.get("/rooms/{room_id}/participants")
def participants(room_id: int, _: User = Depends(get_current_user)):
    return manager.participants(room_id)


@router.get("/rooms/{room_id}/insights")
def insights(room_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Message).where(Message.room_id == room_id).order_by(Message.created_at))
    return nlp_service.conversation_insights([to_out(m) for m in rows])


@router.websocket("/ws/rooms/{room_id}")
async def room_socket(ws: WebSocket, room_id: int, token: str = Query(...)):
    db = SessionLocal()
    try:
        user_id = decode_token(token)
        user = db.get(User, user_id) if user_id else None
        if not user or not db.get(Room, room_id):
            await ws.close(code=4401)
            return

        await manager.connect(room_id, ws, user.id, user.username)
        try:
            while True:
                data = await ws.receive_json()
                kind = data.get("type")
                if kind == "chat" and str(data.get("content", "")).strip():
                    out = store_message(db, room_id, user, str(data["content"]).strip()[:2000])
                    await manager.broadcast(room_id, {"type": "chat", **out})
                elif kind == "typing":
                    await manager.broadcast(room_id, {"type": "typing", "username": user.username})
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(room_id, ws)
    finally:
        db.close()
