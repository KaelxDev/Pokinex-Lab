"""WebSocket transport: connection, authentication, and event dispatch."""

import json

from anyio import to_thread
from fastapi import WebSocket, WebSocketDisconnect

from app.auth import get_user_from_token
from app.roles import has_moderator_access
from app.services.moderation import register_system_users
from app.security import is_allowed_origin
from app.websocket.chat import manager
from app.websocket.router import MAX_WEBSOCKET_PAYLOAD, dispatch_event


def websocket_token(websocket: WebSocket) -> str | None:
    return websocket.cookies.get("session")


async def validate_websocket_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if is_allowed_origin(origin):
        return True
    await websocket.close(code=1008, reason="Origin not allowed")
    return False


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
            "enabled": has_moderator_access(user),
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

            await dispatch_event(websocket, data, user)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.send_users()
