from datetime import datetime, timezone
from fastapi import WebSocket

from app.database import delete_message, get_message, get_message_owner, save_message, update_message


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

    def disconnect(self, websocket: WebSocket): return self.active_connections.pop(websocket, None)

    def update_user(self, user: dict) -> bool:
        updated = False
        for websocket, current in list(self.active_connections.items()):
            if current["id"] == user["id"]: self.active_connections[websocket] = user; updated = True
        return updated

    def get_user(self, websocket: WebSocket) -> dict | None: return self.active_connections.get(websocket)

    async def broadcast(self, data: dict):
        disconnected = []
        for websocket in list(self.active_connections):
            try: await websocket.send_json(data)
            except Exception: disconnected.append(websocket)
        for websocket in disconnected: self.active_connections.pop(websocket, None)

    async def send_users(self):
        users = [{"id": u["id"], "username": u["username"], "displayName": u["displayName"], "avatar": u["avatar"], "status": u["status"], "online": True} for u in self.active_connections.values()]
        await self.broadcast({"type": "users", "users": users, "timestamp": self.get_timestamp()})

    async def broadcast_profile_update(self, user: dict):
        await self.broadcast({"type": "profile_updated", "user": {"id": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "status": user["status"]}, "timestamp": self.get_timestamp()})
        await self.send_users()

    async def send_message(self, user: dict, message: str, message_id: str | None = None, sender: WebSocket | None = None, reply_to_message_id: str | None = None):
        current_user = self.get_user(sender) if sender else None
        user = current_user or user
        if user is None: return
        if message_id and message_id in self.processed_message_ids:
            if sender: await sender.send_json({"type": "ack", "messageId": message_id})
            return
        reply_to = None
        if reply_to_message_id:
            original = get_message(reply_to_message_id)
            if original:
                reply_to = {
                    "messageId": original["message_id"],
                    "userId": original["user_id"],
                    "username": original["username"],
                    "displayName": original["display_name"],
                    "avatar": original["avatar"],
                    "message": "Esta mensagem foi excluída" if original["deleted_at"] else original["message"],
                    "deleted": bool(original["deleted_at"]),
                }
        timestamp = self.get_timestamp()
        if message_id:
            self.processed_message_ids.add(message_id); self.message_owners[message_id] = user["id"]
            save_message(message_id, user["id"], message, timestamp, reply_to_message_id)
        self.sequence += 1
        event = {"type": "message", "messageId": message_id, "userId": user["id"], "username": user["username"], "displayName": user["displayName"], "avatar": user["avatar"], "status": user["status"], "message": message, "timestamp": timestamp, "sequence": self.sequence}
        if reply_to: event["replyTo"] = reply_to
        await self.broadcast(event)
        if sender and message_id: await sender.send_json({"type": "ack", "messageId": message_id})

    def _owner(self, message_id: str):
        owner_id = self.message_owners.get(message_id)
        if owner_id is None:
            owner_id = get_message_owner(message_id)
            if owner_id is not None: self.message_owners[message_id] = owner_id
        return owner_id

    async def edit_message(self, user: dict, message_id: str, message: str, sender: WebSocket):
        owner_id = self._owner(message_id)
        if owner_id is None: await sender.send_json({"type":"error","action":"edit_message","messageId":message_id,"message":"Mensagem não encontrada no servidor."}); return
        if owner_id != user["id"]: await sender.send_json({"type":"error","action":"edit_message","messageId":message_id,"message":"Você só pode editar suas próprias mensagens."}); return
        edited_at = self.get_timestamp()
        if not update_message(message_id, user["id"], message, edited_at): save_message(message_id, user["id"], message, edited_at)
        self.sequence += 1
        event = {"messageId":message_id,"userId":user["id"],"username":user["username"],"displayName":user["displayName"],"avatar":user["avatar"],"status":user["status"],"message":message,"editedAt":edited_at,"edited":True,"sequence":self.sequence}
        await self.broadcast({"type":"message_edited",**event}); await self.broadcast({"type":"message",**event}); await sender.send_json({"type":"edit_ack","messageId":message_id})

    async def delete_message(self, user: dict, message_id: str, sender: WebSocket):
        owner_id = self._owner(message_id)
        if owner_id is None: await sender.send_json({"type":"error","action":"delete_message","messageId":message_id,"message":"Mensagem não encontrada no servidor."}); return
        if owner_id != user["id"]: await sender.send_json({"type":"error","action":"delete_message","messageId":message_id,"message":"Você só pode excluir suas próprias mensagens."}); return
        deleted_at = self.get_timestamp()
        if not delete_message(message_id, user["id"], deleted_at): await sender.send_json({"type":"error","action":"delete_message","messageId":message_id,"message":"Não foi possível excluir a mensagem."}); return
        self.sequence += 1
        await self.broadcast({"type":"message_deleted","messageId":message_id,"userId":user["id"],"deletedAt":deleted_at,"deleted":True,"sequence":self.sequence}); await sender.send_json({"type":"delete_ack","messageId":message_id})

    @staticmethod
    def get_timestamp(): return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()