from pathlib import Path
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.auth import get_user_from_token
from app.database import initialize_database
from app.routes.auth import router as auth_router
from app.websocket.chat import manager
from app.websocket.schemas import (
    ChatMessageEvent,
    DeleteMessageEvent,
    EditMessageEvent,
    ReactionEvent,
)


initialize_database()

APP_DIR = Path(__file__).resolve().parent
MEDIA_DIR = APP_DIR / "uploads"
AVATAR_DIR = MEDIA_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Poknex API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
app.include_router(auth_router)


@app.get("/")
async def root():
    return {"message": "Poknex API", "status": "online"}


def _websocket_token(websocket: WebSocket) -> str | None:
    """Prefer the session cookie; keep query-token compatibility for the current client."""
    return websocket.cookies.get("session") or websocket.query_params.get("token")


async def _send_validation_error(websocket: WebSocket, action: str, error: ValidationError) -> None:
    first_error = error.errors()[0]
    error_type = first_error.get("type")

    messages = {
        "string_too_long": "Um dos campos excedeu o limite permitido.",
        "string_too_short": "Um dos campos é obrigatório.",
        "literal_error": "Valor não permitido.",
        "missing": "Campo obrigatório ausente.",
    }

    await websocket.send_json({
        "type": "error",
        "action": action,
        "message": messages.get(error_type, "Dados do evento inválidos."),
    })


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = _websocket_token(websocket)
    user = get_user_from_token(token)

    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await manager.connect(websocket, user)

    try:
        while True:
            raw_data = await websocket.receive_text()

            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "JSON inválido.",
                })
                continue

            if not isinstance(data, dict):
                await websocket.send_json({
                    "type": "error",
                    "message": "O evento deve ser um objeto JSON.",
                })
                continue

            event_type = data.get("type", "message")

            if event_type == "message":
                try:
                    event = ChatMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "message", error)
                    continue

                message = event.message.strip()
                if not message:
                    continue

                await manager.send_message(
                    user,
                    message,
                    event.messageId,
                    websocket,
                    event.replyTo,
                )
                continue

            if event_type == "edit_message":
                try:
                    event = EditMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "edit_message", error)
                    continue

                message = event.message.strip()
                if not message:
                    await websocket.send_json({
                        "type": "error",
                        "action": "edit_message",
                        "messageId": event.messageId,
                        "message": "A mensagem não pode ficar vazia.",
                    })
                    continue

                await manager.edit_message(user, event.messageId, message, websocket)
                continue

            if event_type == "delete_message":
                try:
                    event = DeleteMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "delete_message", error)
                    continue

                await manager.delete_message(user, event.messageId, websocket)
                continue

            if event_type == "reaction":
                try:
                    event = ReactionEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "reaction", error)
                    continue

                await manager.toggle_reaction(
                    user,
                    event.messageId,
                    event.reaction,
                    websocket,
                )
                continue

            await websocket.send_json({
                "type": "error",
                "action": "unknown_event",
                "message": "Tipo de evento não suportado.",
            })

    except WebSocketDisconnect:
        disconnected_user = manager.disconnect(websocket)
        if disconnected_user:
            await manager.broadcast({
                "type": "system",
                "event": "user_left",
                "userId": disconnected_user["id"],
                "username": disconnected_user["username"],
                "displayName": disconnected_user["displayName"],
                "avatar": disconnected_user["avatar"],
                "message": f"{disconnected_user['username']} saiu do chat.",
                "timestamp": manager.get_timestamp(),
            })
            await manager.send_users()
