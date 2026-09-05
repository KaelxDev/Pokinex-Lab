import pytest

from app.websocket.chat import ConnectionManager


@pytest.mark.asyncio
async def test_connection_manager_publishes_through_realtime_bus():
    manager = ConnectionManager()
    received = []

    async def sink(event):
        received.append(event)
        return False

    manager.realtime_bus.subscribe(sink)

    await manager.broadcast({"type": "system", "message": "ok"})

    assert received == [{"type": "system", "message": "ok"}]
