from datetime import datetime, timezone

from app.infrastructure.realtime import InMemoryRealtimeBus
from app.services import message_runtime
from app.services.public_identity import public_user_payload

MessageRuntimeState = message_runtime.MessageRuntimeState
MAX_PROCESSED_MESSAGE_IDS = message_runtime.MAX_PROCESSED_MESSAGE_IDS
MAX_MESSAGE_OWNERS = message_runtime.MAX_MESSAGE_OWNERS


class ConnectionManager:
    """Manage WebSocket connections, presence and bounded runtime state.

    Outbound realtime delivery is delegated to ``RealtimeBus`` so application
    code can later switch from the in-process transport to Redis/pub-sub.
    """

    def __init__(self):
        self.active_connections = {}
        self.presence_users = {}
        self.message_runtime = MessageRuntimeState()
        self.realtime_bus = InMemoryRealtimeBus()
        self.realtime_bus.subscribe(self._broadcast_to_connections)
        self.sequence = 0

    @property
    def processed_message_ids(self):
        return self.message_runtime.processed_message_ids

    @property
    def message_owners(self):
        return self.message_runtime.message_owners

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
        self.message_runtime.remember_processed_message(message_id)

    def forget_processed_message(self, message_id):
        self.message_runtime.forget_processed_message(message_id)

    def cache_message_owner(self, message_id, owner_id):
        self.message_runtime.cache_message_owner(message_id, owner_id)

    def forget_message_owner(self, message_id):
        self.message_runtime.forget_message_owner(message_id)

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

    async def disconnect_user(
        self,
        user_id,
        *,
        code: int = 4003,
        reason: str = "Removido por um moderador",
    ) -> int:
        """Close and remove every active socket belonging to a user."""
        sockets = [
            websocket
            for websocket, user in self.active_connections.items()
            if user.get("id") == user_id
        ]

        for websocket in sockets:
            self.active_connections.pop(websocket, None)

        for websocket in sockets:
            try:
                await websocket.close(code=code, reason=reason)
            except Exception:
                pass

        return len(sockets)

    def update_user(self, user):
        updated = False
        for websocket, current in list(self.active_connections.items()):
            if current["id"] == user["id"]:
                self.active_connections[websocket] = user
                updated = True
        return updated

    def get_user(self, websocket):
        return self.active_connections.get(websocket)

    async def _broadcast_to_connections(self, data) -> bool:
        """Deliver one event to this process's active WebSocket connections."""
        failed = False
        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(data)
            except Exception:
                self.active_connections.pop(websocket, None)
                failed = True
        return failed

    async def _broadcast(self, data):
        return await self.realtime_bus.publish(data)

    async def broadcast(self, data):
        failed = await self._broadcast(data)
        if failed and data.get("type") != "users":
            await self.send_users()

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

        await self._broadcast_to_connections(
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

    @staticmethod
    def get_timestamp():
        return datetime.now(timezone.utc).isoformat()


manager = ConnectionManager()
