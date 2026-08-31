from datetime import datetime, timezone
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, str] = {}
        self.processed_message_ids: set[str] = set()

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[websocket] = username
        await self.broadcast({"type": "system", "event": "user_joined", "username": username, "message": f"{username} entrou no chat.", "timestamp": self.get_timestamp()})
        await self.send_users()

    def disconnect(self, websocket: WebSocket):
        return self.active_connections.pop(websocket, None)

    async def broadcast(self, data: dict):
        disconnected = []
        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(data)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.active_connections.pop(websocket, None)

    async def send_users(self):
        data = {"type": "users", "users": list(self.active_connections.values()), "timestamp": self.get_timestamp()}
        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(data)
            except Exception:
                pass

    async def send_message(self, username: str, message: str, message_id: str | None = None, sender: WebSocket | None = None):
        if message_id and message_id in self.processed_message_ids:
            if sender:
                await sender.send_json({"type": "ack", "messageId": message_id})
            return
        if message_id:
            self.processed_message_ids.add(message_id)

        data = {"type": "message", "messageId": message_id, "username": username, "message": message, "timestamp": self.get_timestamp()}
        await self.broadcast(data)
        if sender and message_id:
            await sender.send_json({"type": "ack", "messageId": message_id})

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
