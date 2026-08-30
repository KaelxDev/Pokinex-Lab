from datetime import datetime, timezone
from fastapi import WebSocket


class ConnectionManager:

    def __init__(self):
        self.active_connections: dict[WebSocket, str] = {}


    async def connect(
        self,
        websocket: WebSocket,
        username: str
    ):
        await websocket.accept()

        self.active_connections[websocket] = username

        await self.broadcast({
            "type": "system",
            "event": "user_joined",
            "username": username,
            "message": f"{username} entrou no chat.",
            "timestamp": self.get_timestamp(),
        })

        await self.send_users()


    def disconnect(self, websocket: WebSocket):
        username = self.active_connections.pop(
            websocket,
            None
        )

        return username


    async def broadcast(self, data: dict):
        disconnected = []

        for websocket in self.active_connections:

            try:
                await websocket.send_json(data)

            except Exception:
                disconnected.append(websocket)


        for websocket in disconnected:
            self.active_connections.pop(
                websocket,
                None
            )


    async def send_users(self):

        users = list(
            self.active_connections.values()
        )

        data = {
            "type": "users",
            "users": users,
            "timestamp": self.get_timestamp(),
        }

        for websocket in self.active_connections:

            try:
                await websocket.send_json(data)

            except Exception:
                pass


    async def send_message(
        self,
        username: str,
        message: str
    ):

        data = {
            "type": "message",
            "username": username,
            "message": message,
            "timestamp": self.get_timestamp(),
        }

        await self.broadcast(data)


    @staticmethod
    def get_timestamp():

        return datetime.now(
            timezone.utc
        ).isoformat()


manager = ConnectionManager()