from datetime import datetime, timezone
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, dict] = {}
        self.processed_message_ids: set[str] = set()

    async def connect(self, websocket: WebSocket, user: dict):
        await websocket.accept()
        self.active_connections[websocket] = user
        await self.broadcast({
            "type": "system",
            "event": "user_joined",
            "username": user["username"],
            "message": f"{user['username']} entrou no chat.",
            "timestamp": self.get_timestamp(),
        })
        await self.send_users()

    def disconnect(self, websocket: WebSocket):
        user = self.active_connections.pop(websocket, None)
        return user

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
        users = []
        for user in self.active_connections.values():
            users.append({
                "id": user["id"],
                "username": user["username"],
                "displayName": user["displayName"],
                "avatar": user["avatar"],
                "status": user["status"],
                "online": True,
            })
        data = {"type": "users", "users": users, "timestamp": self.get_timestamp()}
        await self.broadcast(data)

    async def send_message(self, user: dict, message: str, message_id: str | None = None, sender: WebSocket | None = None):
        if message_id and message_id in self.processed_message_ids:
            if sender:
                await sender.send_json({"type": "ack", "messageId": message_id})
            return
        if message_id:
            self.processed_message_ids.add(message_id)

        data = {
            "type": "message",
            "messageId": message_id,
            "userId": user["id"],
            "username": user["username"],
            "displayName": user["displayName"],
            "avatar": user["avatar"],
            "status": user["status"],
            "message": message,
            "timestamp": self.get_timestamp(),
        }
        await self.broadcast(data)
        if sender and message_id:
            await sender.send_json({"type": "ack", "messageId": message_id})

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
