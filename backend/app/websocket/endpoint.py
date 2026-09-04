"""WebSocket transport for public and direct messaging."""

import json

from anyio import to_thread
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import get_user_from_token
from app.moderation_bot import is_moderator
from app.security import is_allowed_origin
from app.services.moderation import handle_public_message, register_system_users
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


def websocket_token(websocket: WebSocket) -> str | None:
    return websocket.cookies.get("session")


async def validate_websocket_origin(websocket: WebSocket) -> bool:
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
    messages = {
        "string_too_long": "Um dos campos excedeu o limite permitido.",
        "string_too_short": "Um dos campos é muito curto.",
        "literal_error": "Valor não permitido.",
        "missing": "Campo obrigatório ausente.",
        "string_type": "Campo de texto inválido.",
        "greater_than": "Identificador inválido.",
    }
    await websocket.send_json(
        {
            "type": "error",
            "action": action,
            "message": messages.get(
                first_error.get("type"),
                "Dados do evento inválidos.",
            ),
        }
    )


async def websocket_endpoint(websocket: WebSocket) -> None:
    register_system_users()

    if not await validate_websocket_origin(websocket):
        return

    user = await to_thread.run_sync(
        get_user_from_token,
        websocket_token(websocket),
    )
    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await manager.connect(websocket, user)
    await websocket.send_json(
        {
            "type": "moderator_session",
            "enabled": is_moderator(user),
        }
    )

    try:
        while True:
            raw_data = await websocket.receive_text()
            if len(raw_data.encode("utf-8")) > MAX_WEBSOCKET_PAYLOAD:
                await websocket.send_json(
                    {
                        "type": "error",
                        "action": "payload",
                        "message": "Evento muito grande.",
                    }
                )
                continue

            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "action": "payload",
                        "message": "JSON inválido.",
                    }
                )
                continue

            if not isinstance(data, dict):
                await websocket.send_json(
                    {
                        "type": "error",
                        "action": "payload",
                        "message": "O evento deve ser um objeto JSON.",
                    }
                )
                continue

            event_type = data.get("type", "message")

            if event_type == "message":
                try:
                    event = ChatMessageEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(websocket, "message", error)
                    continue
                await handle_public_message(websocket, user, event)
                continue

            if event_type == "direct_message":
                try:
                    event = DirectMessageEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(websocket, "direct_message", error)
                    continue
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
                continue

            if event_type == "direct_message_edit":
                try:
                    event = DirectMessageEditEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(
                        websocket,
                        "direct_message_edit",
                        error,
                    )
                    continue
                message = event.message.strip()
                if message:
                    await edit_direct(
                        manager,
                        user,
                        event.messageId,
                        message,
                        websocket,
                    )
                continue

            if event_type == "direct_message_delete":
                try:
                    event = DirectMessageDeleteEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(
                        websocket,
                        "direct_message_delete",
                        error,
                    )
                    continue
                await delete_direct(
                    manager,
                    user,
                    event.messageId,
                    websocket,
                )
                continue

            if event_type == "direct_message_reaction":
                try:
                    event = DirectMessageReactionEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(
                        websocket,
                        "direct_message_reaction",
                        error,
                    )
                    continue
                await react_direct(
                    manager,
                    user,
                    event.messageId,
                    event.reaction,
                    websocket,
                )
                continue

            if event_type == "edit_message":
                try:
                    event = EditMessageEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(websocket, "edit_message", error)
                    continue
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
                    continue
                await manager.edit_message(
                    user,
                    event.messageId,
                    message,
                    websocket,
                )
                continue

            if event_type == "delete_message":
                try:
                    event = DeleteMessageEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(
                        websocket,
                        "delete_message",
                        error,
                    )
                    continue
                await manager.delete_message(
                    user,
                    event.messageId,
                    websocket,
                )
                continue

            if event_type == "reaction":
                try:
                    event = ReactionEvent.model_validate(data)
                except ValidationError as error:
                    await send_validation_error(websocket, "reaction", error)
                    continue
                await manager.toggle_reaction(
                    user,
                    event.messageId,
                    event.reaction,
                    websocket,
                )
                continue

            await websocket.send_json(
                {
                    "type": "error",
                    "action": "payload",
                    "message": "Tipo de evento não reconhecido.",
                }
            )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.send_users()
