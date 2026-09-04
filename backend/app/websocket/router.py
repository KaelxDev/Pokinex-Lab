"""Route validated WebSocket events to the public/DM handlers."""

import json
from collections.abc import Awaitable, Callable

from fastapi import WebSocket
from pydantic import BaseModel, ValidationError

from app.auth import get_user_from_token
from app.moderation_bot import is_moderator
from app.services.moderation import handle_public_message
from app.websocket.chat import manager
from app.websocket.direct_message_features import (
    delete_direct,
    edit_direct,
    react_direct,
    send_direct_message,
)
from app.websocket.schemas import (
    ChatMessageEvent,
    DeleteMessageEvent,
    DirectMessageDeleteEvent,
    DirectMessageEditEvent,
    DirectMessageEvent,
    DirectMessageReactionEvent,
    EditMessageEvent,
    ReactionEvent,
)

MAX_WEBSOCKET_PAYLOAD = 16 * 1024

_VALIDATION_MESSAGES = {
    "string_too_long": "Um dos campos excedeu o limite permitido.",
    "string_too_short": "Um dos campos é muito curto.",
    "literal_error": "Valor não permitido.",
    "missing": "Campo obrigatório ausente.",
    "string_type": "Campo de texto inválido.",
    "greater_than": "Identificador inválido.",
}

EventHandler = Callable[[WebSocket, dict, object], Awaitable[None]]


def websocket_token(websocket: WebSocket) -> str | None:
    return websocket.cookies.get("session")


async def validate_websocket_origin(websocket: WebSocket, is_allowed_origin) -> bool:
    origin = websocket.headers.get("origin")
    if is_allowed_origin(origin):
        return True
    await websocket.close(code=1008, reason="Origin not allowed")
    return False


async def send_validation_error(
    websocket: WebSocket,
    action: str,
    error: ValidationError,
) -> None:
    first_error = error.errors()[0] if error.errors() else {}
    await websocket.send_json(
        {
            "type": "error",
            "action": action,
            "message": _VALIDATION_MESSAGES.get(
                first_error.get("type"),
                "Dados do evento inválidos.",
            ),
        }
    )


def validate_event(model: type[BaseModel], data: dict) -> BaseModel | None:
    return model.model_validate(data)


async def handle_message(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(ChatMessageEvent, data)
    await handle_public_message(websocket, user, event)


async def handle_direct_message_event(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(DirectMessageEvent, data)
    message = event.message.strip()
    if message:
        await send_direct_message(
            manager,
            user,
            event.recipientId,
            message,
            event.messageId,
            websocket,
            event.replyTo,
        )


async def handle_direct_message_edit(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(DirectMessageEditEvent, data)
    message = event.message.strip()
    if message:
        await edit_direct(manager, user, event.messageId, message, websocket)


async def handle_direct_message_delete(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(DirectMessageDeleteEvent, data)
    await delete_direct(manager, user, event.messageId, websocket)


async def handle_direct_message_reaction(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(DirectMessageReactionEvent, data)
    await react_direct(manager, user, event.messageId, event.reaction, websocket)


async def handle_edit_message(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(EditMessageEvent, data)
    message = event.message.strip()
    if not message:
        await websocket.send_json(
            {
                "type": "error",
                "action": "edit_message",
                "messageId": event.messageId,
                "message": "A mensagem não pode ficar vazia.",
            }
        )
        return
    await manager.edit_message(user, event.messageId, message, websocket)


async def handle_delete_message(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(DeleteMessageEvent, data)
    await manager.delete_message(user, event.messageId, websocket)


async def handle_reaction(websocket: WebSocket, data: dict, user) -> None:
    event = validate_event(ReactionEvent, data)
    await manager.toggle_reaction(user, event.messageId, event.reaction, websocket)


_HANDLERS: dict[str, tuple[type[BaseModel], EventHandler]] = {
    "message": (ChatMessageEvent, handle_message),
    "direct_message": (DirectMessageEvent, handle_direct_message_event),
    "direct_message_edit": (DirectMessageEditEvent, handle_direct_message_edit),
    "direct_message_delete": (DirectMessageDeleteEvent, handle_direct_message_delete),
    "direct_message_reaction": (DirectMessageReactionEvent, handle_direct_message_reaction),
    "edit_message": (EditMessageEvent, handle_edit_message),
    "delete_message": (DeleteMessageEvent, handle_delete_message),
    "reaction": (ReactionEvent, handle_reaction),
}


async def dispatch_event(websocket: WebSocket, data: dict, user) -> bool:
    event_type = data.get("type", "message")
    handler_definition = _HANDLERS.get(event_type)
    if handler_definition is None:
        await websocket.send_json(
            {
                "type": "error",
                "action": "payload",
                "message": "Tipo de evento não reconhecido.",
            }
        )
        return False

    model, handler = handler_definition
    try:
        validated = model.model_validate(data)
    except ValidationError as error:
        await send_validation_error(websocket, event_type, error)
        return False

    if event_type == "message":
        await handler(websocket, data, user)
    else:
        await handler(websocket, data, user)
    return True
