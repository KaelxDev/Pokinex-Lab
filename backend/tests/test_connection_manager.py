import pytest

from app.websocket.chat import (
    MAX_MESSAGE_OWNERS,
    MAX_PROCESSED_MESSAGE_IDS,
    ConnectionManager,
)


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.messages = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        self.messages.append(data)


@pytest.fixture
def user():
    return {
        "id": 1,
        "username": "kael",
        "displayName": "Kael",
        "avatar": "",
        "status": "online",
    }


@pytest.mark.asyncio
async def test_connect_and_disconnect_tracks_presence(user):
    manager = ConnectionManager()
    websocket = FakeWebSocket()

    await manager.connect(websocket, user)

    assert websocket.accepted is True
    assert manager.get_user(websocket) == user
    assert manager.disconnect(websocket) == user
    assert manager.get_user(websocket) is None


@pytest.mark.asyncio
async def test_same_user_on_two_connections_is_not_duplicated_in_presence(user):
    manager = ConnectionManager()
    first = FakeWebSocket()
    second = FakeWebSocket()

    await manager.connect(first, user)
    await manager.connect(second, user)

    users_events = [event for event in second.messages if event.get("type") == "users"]
    assert users_events
    assert len(users_events[-1]["users"]) == 1

    assert manager.disconnect(first) is None
    assert manager.disconnect(second) == user


def test_processed_message_cache_is_bounded():
    manager = ConnectionManager()

    for index in range(MAX_PROCESSED_MESSAGE_IDS + 250):
        manager._remember_processed_message(f"message-{index}")

    assert len(manager.processed_message_ids) == MAX_PROCESSED_MESSAGE_IDS
    assert "message-0" not in manager.processed_message_ids
    assert f"message-{MAX_PROCESSED_MESSAGE_IDS + 249}" in manager.processed_message_ids


def test_message_owner_cache_is_bounded():
    manager = ConnectionManager()

    for index in range(MAX_MESSAGE_OWNERS + 250):
        manager._cache_message_owner(f"message-{index}", index)

    assert len(manager.message_owners) == MAX_MESSAGE_OWNERS
    assert "message-0" not in manager.message_owners
    assert manager.message_owners[f"message-{MAX_MESSAGE_OWNERS + 249}"] == MAX_MESSAGE_OWNERS + 249
