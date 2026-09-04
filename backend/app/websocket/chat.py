from collections import deque
from datetime import datetime, timezone

from anyio import to_thread

from app.database import (
    delete_message as delete_message_record,
    get_message,
    get_message_owner,
    save_message,
    toggle_reaction as toggle_reaction_record,
    update_message as update_message_record,
)

REACTIONS = ("❤️", "😂", "😮", "😢", "😡", "👍")
MAX_PROCESSED_MESSAGE_IDS = 10_000
MAX_MESSAGE_OWNERS = 4_096


class ConnectionManager:
    def __init__(self):
        self.active_connections = {}
        self.processed_message_ids = set()
        self._processed_message_order = deque()
        self.message_owners = {}
        self._message_owner_order = deque()
        self.sequence = 0

    def _has_user(self, user_id, exclude=None):
        return any(
            current["id"] == user_id and ws is not exclude
            for ws, current in self.active_connections.items()
        )

    def _remember_processed_message(self, message_id):
        if message_id in self.processed_message_ids:
            return

        self.processed_message_ids.add(message_id)
        self._processed_message_order.append(message_id)

        while len(self._processed_message_order) > MAX_PROCESSED_MESSAGE_IDS:
            expired_id = self._processed_message_order.popleft()
            self.processed_message_ids.discard(expired_id)

    def _forget_processed_message(self, message_id):
        self.processed_message_ids.discard(message_id)
        try:
            self._processed_message_order.remove(message_id)
        except ValueError:
            pass

    def _cache_message_owner(self, message_id, owner_id):
        if message_id not in self.message_owners:
            self._message_owner_order.append(message_id)

        self.message_owners[message_id] = owner_id

        while len(self._message_owner_order) > MAX_MESSAGE_OWNERS:
            expired_id = self._message_owner_order.popleft()
            self.message_owners.pop(expired_id, None)

    def _forget_message_owner(self, message_id):
        self.message_owners.pop(message_id, None)
        try:
            self._message_owner_order.remove(message_id)
        except ValueError:
            pass

    async def connect(self, websocket, user):
        await websocket.accept()
        already_online = self._has_user(user["id"])
        self.active_connections[websocket] = user

        if not already_online:
            await self.broadcast(
                {
                    "type": "system",
                    "event": "user_joined",
                    "userId": user["id"],
                    "username": user["username"],
                    "displayName": user["displayName"],
                    "avatar": user["avatar"],
                    "message": f"{user['username']} entrou no chat.",
                    "timestamp": self.get_timestamp(),
                }
            )

        await self.send_users()

    def disconnect(self, websocket):
        user = self.active_connections.pop(websocket, None)
        if not user:
            return None
        return user if not self._has_user(user["id"]) else None

    def update_user(self, user):
        updated = False
        for websocket, current in list(self.active_connections.items()):
            if current["id"] == user["id"]:
                self.active_connections[websocket] = user
                updated = True
        return updated

    def get_user(self, websocket):
        return self.active_connections.get(websocket)

    async def broadcast(self, data):
        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(data)
            except Exception:
                self.active_connections.pop(websocket, None)

    async def send_users(self):
        users = []
        seen = set()

        for user in self.active_connections.values():
            if user["id"] in seen:
                continue
            seen.add(user["id"])
            users.append(
                {
                    "id": user["id"],
                    "username": user["username"],
                    "displayName": user["displayName"],
                    "avatar": user["avatar"],
                    "status": user["status"],
                    "online": True,
                }
            )

        await self.broadcast(
            {
                "type": "users",
                "users": users,
                "timestamp": self.get_timestamp(),
            }
        )

    async def broadcast_profile_update(self, user):
        await self.broadcast(
            {
                "type": "profile_updated",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "displayName": user["displayName"],
                    "avatar": user["avatar"],
                    "status": user["status"],
                },
                "timestamp": self.get_timestamp(),
            }
        )
        await self.send_users()

    async def send_message(
        self,
        user,
        message,
        message_id=None,
        sender=None,
        reply_to_message_id=None,
    ):
        user = self.get_user(sender) if sender else user
        if not user:
            return

        if message_id and message_id in self.processed_message_ids:
            if sender:
                await sender.send_json({"type": "ack", "messageId": message_id})
            return

        reply = None
        if reply_to_message_id:
            original = await to_thread.run_sync(get_message, reply_to_message_id)
            if original:
                reply = {
                    "messageId": original["message_id"],
                    "userId": original["user_id"],
                    "username": original["username"],
                    "displayName": original["display_name"],
                    "avatar": original["avatar"],
                    "message": (
                        "Esta mensagem foi excluída"
                        if original["deleted_at"]
                        else original["message"]
                    ),
                    "deleted": bool(original["deleted_at"]),
                }

        timestamp = self.get_timestamp()
        if message_id:
            self._remember_processed_message(message_id)
            try:
                await to_thread.run_sync(
                    save_message,
                    message_id,
                    user["id"],
                    message,
                    timestamp,
                    reply_to_message_id,
                )
            except Exception:
                self._forget_processed_message(message_id)
                self._forget_message_owner(message_id)
                raise
            self._cache_message_owner(message_id, user["id"])

        self.sequence += 1
        event = {
            "type": "message",
            "messageId": message_id,
            "userId": user["id"],
            "username": user["username"],
            "displayName": user["displayName"],
            "avatar": user["avatar"],
            "status": user["status"],
            "message": message,
            "timestamp": timestamp,
            "sequence": self.sequence,
        }
        if reply:
            event["replyTo"] = reply

        await self.broadcast(event)
        if sender and message_id:
            await sender.send_json({"type": "ack", "messageId": message_id})

    async def toggle_reaction(self, user, message_id, reaction, sender):
        if reaction not in REACTIONS:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "reaction",
                    "messageId": message_id,
                    "message": "Reação não permitida.",
                }
            )
            return

        original = await to_thread.run_sync(get_message, message_id)
        if not original:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "reaction",
                    "messageId": message_id,
                    "message": "Mensagem não encontrada.",
                }
            )
            return

        if original["deleted_at"]:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "reaction",
                    "messageId": message_id,
                    "message": "Não é possível reagir a uma mensagem excluída.",
                }
            )
            return

        active, reactions = await to_thread.run_sync(
            toggle_reaction_record,
            message_id,
            user["id"],
            reaction,
            self.get_timestamp(),
        )
        self.sequence += 1
        await self.broadcast(
            {
                "type": "message_reaction",
                "messageId": message_id,
                "reaction": reaction,
                "userId": user["id"],
                "active": active,
                "reactions": reactions,
                "sequence": self.sequence,
            }
        )

    async def _owner(self, message_id):
        owner_id = self.message_owners.get(message_id)
        if owner_id is not None:
            return owner_id

        owner_id = await to_thread.run_sync(get_message_owner, message_id)
        if owner_id is not None:
            self._cache_message_owner(message_id, owner_id)
        return owner_id

    async def edit_message(self, user, message_id, message, sender):
        owner_id = await self._owner(message_id)
        if owner_id is None:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "edit_message",
                    "messageId": message_id,
                    "message": "Mensagem não encontrada no servidor.",
                }
            )
            return

        if owner_id != user["id"]:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "edit_message",
                    "messageId": message_id,
                    "message": "Você só pode editar suas próprias mensagens.",
                }
            )
            return

        edited_at = self.get_timestamp()
        updated = await to_thread.run_sync(
            update_message_record,
            message_id,
            user["id"],
            message,
            edited_at,
        )
        if not updated:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "edit_message",
                    "messageId": message_id,
                    "message": "Não foi possível editar a mensagem.",
                }
            )
            return

        self.sequence += 1
        event = {
            "messageId": message_id,
            "userId": user["id"],
            "username": user["username"],
            "displayName": user["displayName"],
            "avatar": user["avatar"],
            "status": user["status"],
            "message": message,
            "editedAt": edited_at,
            "edited": True,
            "sequence": self.sequence,
        }
        await self.broadcast({"type": "message_edited", **event})
        await self.broadcast({"type": "message", **event})
        await sender.send_json({"type": "edit_ack", "messageId": message_id})

    async def delete_message(self, user, message_id, sender):
        owner_id = await self._owner(message_id)
        if owner_id is None:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "delete_message",
                    "messageId": message_id,
                    "message": "Mensagem não encontrada no servidor.",
                }
            )
            return

        if owner_id != user["id"]:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "delete_message",
                    "messageId": message_id,
                    "message": "Você só pode excluir suas próprias mensagens.",
                }
            )
            return

        deleted_at = self.get_timestamp()
        deleted = await to_thread.run_sync(
            delete_message_record,
            message_id,
            user["id"],
            deleted_at,
        )
        if not deleted:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "delete_message",
                    "messageId": message_id,
                    "message": "Não foi possível excluir a mensagem.",
                }
            )
            return

        self._forget_message_owner(message_id)

        self.sequence += 1
        await self.broadcast(
            {
                "type": "message_deleted",
                "messageId": message_id,
                "userId": user["id"],
                "deletedAt": deleted_at,
                "deleted": True,
                "sequence": self.sequence,
            }
        )
        await sender.send_json({"type": "delete_ack", "messageId": message_id})

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
