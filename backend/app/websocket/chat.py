from datetime import datetime, timezone
from fastapi import WebSocket

from app.database import get_message_owner, save_message, update_message


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, dict] = {}
        self.processed_message_ids: set[str] = set()
        self.message_owners: dict[str, int] = {}
        self.sequence = 0

    async def connect(self, websocket: WebSocket, user: dict):
        await websocket.accept()
        self.active_connections[websocket] = user
        await self.broadcast({"type": "system", "event": "user_joined", "userId": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "message": f"{user['username']} entrou no chat.", "timestamp": self.get_timestamp()})
        await self.send_users()

    def disconnect(self, websocket: WebSocket):
        return self.active_connections.pop(websocket, None)

    def update_user(self, user: dict) -> bool:
        updated = False
        for websocket, current in list(self.active_connections.items()):
            if current["id"] == user["id"]:
                self.active_connections[websocket] = user
                updated = True
        return updated

    def get_user(self, websocket: WebSocket) -> dict | None:
        return self.active_connections.get(websocket)

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
        users = [{"id": u["id"], "username": u["username"], "displayName": u["displayName"], "avatar": u["avatar"], "status": u["status"], "online": True} for u in self.active_connections.values()]
        await self.broadcast({"type": "users", "users": users, "timestamp": self.get_timestamp()})

    async def broadcast_profile_update(self, user: dict):
        await self.broadcast({"type": "profile_updated", "user": {"id": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "status": user["status"]}, "timestamp": self.get_timestamp()})
        await self.send_users()

    async def send_message(self, user: dict, message: str, message_id: str | None = None, sender: WebSocket | None = None):
        current_user = self.get_user(sender) if sender else None
        user = current_user or user
        if user is None:
            return
        if message_id and message_id in self.processed_message_ids:
            if sender:
                await sender.send_json({"type": "ack", "messageId": message_id})
            return

        timestamp = self.get_timestamp()
        if message_id:
            self.processed_message_ids.add(message_id)
            self.message_owners[message_id] = user["id"]
            save_message(message_id, user["id"], message, timestamp)

        self.sequence += 1
        await self.broadcast({"type": "message", "messageId": message_id, "userId": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "status": user["status"], "message": message, "timestamp": timestamp, "sequence": self.sequence})
        if sender and message_id:
            await sender.send_json({"type": "ack", "messageId": message_id})

    async def edit_message(self, user: dict, message_id: str, message: str, sender: WebSocket):
        owner_id = self.message_owners.get(message_id)
        if owner_id is None:
            owner_id = get_message_owner(message_id)
            if owner_id is not None:
                self.message_owners[message_id] = owner_id
        if owner_id is None:
            await sender.send_json({"type": "error", "action": "edit_message", "messageId": message_id, "message": "Mensagem não encontrada no servidor."})
            return
        if owner_id != user["id"]:
            await sender.send_json({"type": "error", "action": "edit_message", "messageId": message_id, "message": "Você só pode editar suas próprias mensagens."})
            return

        edited_at = self.get_timestamp()
        persisted = update_message(message_id, user["id"], message, edited_at)
        if not persisted:
            save_message(message_id, user["id"], message, edited_at)

        await self.broadcast({"type": "message_edited", "messageId": message_id, "userId": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "status": user["status"], "message": message, "editedAt": edited_at, "edited": True})
        await sender.send_json({"type": "edit_ack", "messageId": message_id})

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
