from collections import deque
from datetime import datetime, timezone

from app.services.public_messages import (
    delete_message as delete_message_operation,
    edit_message as edit_message_operation,
    public_user_payload,
    send_message as send_message_operation,
    toggle_reaction as toggle_reaction_operation,
)

MAX_PROCESSED_MESSAGE_IDS = 10_000
MAX_MESSAGE_OWNERS = 4_096


class ConnectionManager:
    def __init__(self):
        self.active_connections = {}
        self.presence_users = {}
        self.processed_message_ids = set()
        self._processed_message_order = deque()
        self.message_owners = {}
        self._message_owner_order = deque()
        self.sequence = 0

    def register_presence_user(self, user) -> None:
        self.presence_users[user["id"]] = dict(user)

    def unregister_presence_user(self, user_id) -> None:
        self.presence_users.pop(user_id, None)

    def _has_user(self, user_id, exclude=None):
        return any(
            current["id"] == user_id and ws is not exclude
            for ws, current in self.active_connections.items()
        )

    def remember_processed_message(self, message_id):
        if message_id in self.processed_message_ids:
            return

        self.processed_message_ids.add(message_id)
        self._processed_message_order.append(message_id)

        while len(self._processed_message_order) > MAX_PROCESSED_MESSAGE_IDS:
            expired_id = self._processed_message_order.popleft()
            self.processed_message_ids.discard(expired_id)

    _remember_processed_message = remember_processed_message

    def forget_processed_message(self, message_id):
        self.processed_message_ids.discard(message_id)
        try:
            self._processed_message_order.remove(message_id)
        except ValueError:
            pass

    _forget_processed_message = forget_processed_message

    def cache_message_owner(self, message_id, owner_id):
        if message_id not in self.message_owners:
            self._message_owner_order.append(message_id)

        self.message_owners[message_id] = owner_id

        while len(self._message_owner_order) > MAX_MESSAGE_OWNERS:
            expired_id = self._message_owner_order.popleft()
            self.message_owners.pop(expired_id, None)

    _cache_message_owner = cache_message_owner

    def forget_message_owner(self, message_id):
        self.message_owners.pop(message_id, None)
        try:
            self._message_owner_order.remove(message_id)
        except ValueError:
            pass

    _forget_message_owner = forget_message_owner

    async def connect(self, websocket, user):
        await websocket.accept()
        already_online = self._has_user(user["id"])
        self.active_connections[websocket] = user

        if not already_online:
            await self.broadcast(
                {
                    "type": "system",
                    "event": "user_joined",
                    **public_user_payload(user, online=True),
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

        for user in self.presence_users.values():
            if user["id"] in seen:
                continue
            seen.add(user["id"])
            users.append(public_user_payload(user, online=True))

        for user in self.active_connections.values():
            if user["id"] in seen:
                continue
            seen.add(user["id"])
            users.append(public_user_payload(user, online=True))

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
                "user": public_user_payload(user),
                "timestamp": self.get_timestamp(),
            }
        )
        await self.send_users()

    async def send_message(self, user, message, message_id=None, sender=None, reply_to_message_id=None):
        return await send_message_operation(
            self,
            user,
            message,
            message_id,
            sender,
            reply_to_message_id,
        )

    async def toggle_reaction(self, user, message_id, reaction, sender):
        return await toggle_reaction_operation(self, user, message_id, reaction, sender)

    async def resolve_message_owner(self, message_id):
        owner_id = self.message_owners.get(message_id)
        if owner_id is not None:
            return owner_id

        from anyio import to_thread
        from app.database import get_message_owner

        owner_id = await to_thread.run_sync(get_message_owner, message_id)
        if owner_id is not None:
            self.cache_message_owner(message_id, owner_id)
        return owner_id

    async def _owner(self, message_id):
        return await self.resolve_message_owner(message_id)

    async def edit_message(self, user, message_id, message, sender):
        return await edit_message_operation(self, user, message_id, message, sender)

    async def delete_message(self, user, message_id, sender):
        return await delete_message_operation(self, user, message_id, sender)

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
