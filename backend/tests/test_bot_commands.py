import pytest

from app.moderation_bot import BOT_USER, moderation_bot
from app.services.bot_commands import handle_public_bot_command, online_user_count
from app.services import bot_commands


class FakeWebSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, data):
        self.messages.append(data)


@pytest.mark.asyncio
async def test_public_command_is_consumed_and_broadcast():
    original_connections = dict(bot_commands.manager.active_connections)
    try:
        bot_commands.manager.active_connections.clear()
        websocket = FakeWebSocket()
        bot_commands.manager.active_connections[websocket] = {
            "id": 1,
            "username": "kael1nk",
            "displayName": "Kael",
            "avatar": "",
            "status": "online",
        }

        consumed = await handle_public_bot_command("!ping", user_id=1)

        assert consumed is True
        assert websocket.messages
        assert websocket.messages[-1]["type"] == "message"
        assert websocket.messages[-1]["userId"] == BOT_USER["id"]
        assert websocket.messages[-1]["message"] == moderation_bot.PUBLIC_COMMANDS["!ping"]
    finally:
        bot_commands.manager.active_connections.clear()
        bot_commands.manager.active_connections.update(original_connections)


def test_online_user_count_excludes_pokibot():
    original_connections = dict(bot_commands.manager.active_connections)
    try:
        bot_commands.manager.active_connections.clear()
        bot_commands.manager.active_connections.update(
            {
                object(): {"id": 1},
                object(): {"id": 2},
                object(): {"id": BOT_USER["id"]},
            }
        )

        assert online_user_count() == 2
    finally:
        bot_commands.manager.active_connections.clear()
        bot_commands.manager.active_connections.update(original_connections)
