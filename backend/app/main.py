from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.websocket.chat import manager


app = FastAPI(title="Realtime Chat API", version="1.0.0")


@app.get("/")
async def root():
    return {"message": "Realtime Chat API", "status": "online"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    username = websocket.query_params.get("username")
    if not username:
        await websocket.close(code=1008)
        return

    username = username.strip()[:20]
    if not username:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, username)

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            message_id = data.get("messageId")

            if not isinstance(message, str):
                continue
            message = message.strip()
            if not message:
                continue
            if len(message) > 1000:
                message = message[:1000]
            if message_id is not None and not isinstance(message_id, str):
                message_id = None

            await manager.send_message(username, message, message_id, websocket)

    except WebSocketDisconnect:
        disconnected_user = manager.disconnect(websocket)
        if disconnected_user:
            await manager.broadcast({
                "type": "system",
                "event": "user_left",
                "username": disconnected_user,
                "message": f"{disconnected_user} saiu do chat.",
                "timestamp": manager.get_timestamp(),
            })
            await manager.send_users()
