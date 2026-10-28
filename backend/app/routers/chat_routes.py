"""Rooms, message history, NLP insights and the real-time WebSocket endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import decode_token, get_current_user
from app.database import SessionLocal, get_db
from app.models import Message, Room, User
from app.schemas import MessageCreate, MessageOut, RoomCreate, RoomOut, RoomUpdate
from app.services import nlp_service
from app.websocket_manager import manager

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


def own_room(room_id: int, user: User, db: Session) -> Room:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.created_by != user.id:
        raise HTTPException(403, "Only the room's creator can change it")
    return room


@router.patch("/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: int, data: RoomUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = own_room(room_id, user, db)
    if data.name and data.name != room.name:
        if db.scalar(select(Room).where(Room.name == data.name)):
            raise HTTPException(400, "Room name already exists")
        room.name = data.name
    if data.description is not None:
        room.description = data.description
    db.commit()
    db.refresh(room)
    return room


@router.delete("/rooms/{room_id}")
def delete_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a room you created, with its messages."""
    db.delete(own_room(room_id, user, db))
    db.commit()
    return {"ok": True}


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


def own_message(room_id: int, message_id: int, user: User, db: Session) -> Message:
    msg = db.get(Message, message_id)
    if not msg or msg.room_id != room_id:
        raise HTTPException(404, "Message not found")
    if msg.user_id != user.id:
        raise HTTPException(403, "You can only change your own messages")
    return msg


@router.patch("/rooms/{room_id}/messages/{message_id}")
async def edit_message(room_id: int, message_id: int, data: MessageCreate, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """Edit your message; sentiment, toxicity and keywords are re-analysed."""
    msg = own_message(room_id, message_id, user, db)
    nlp = nlp_service.analyze_message(data.content)
    msg.content = data.content
    msg.sentiment_label, msg.sentiment_score = nlp["sentiment_label"], nlp["sentiment_score"]
    msg.is_toxic, msg.keywords = nlp["is_toxic"], ",".join(nlp["keywords"])
    db.commit()
    db.refresh(msg)
    out = to_out(msg)
    await manager.broadcast(room_id, {"type": "edited", **out})
    return out


@router.delete("/rooms/{room_id}/messages/{message_id}")
async def delete_message(room_id: int, message_id: int, user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    db.delete(own_message(room_id, message_id, user, db))
    db.commit()
    await manager.broadcast(room_id, {"type": "deleted", "id": message_id})
    return {"ok": True}


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
