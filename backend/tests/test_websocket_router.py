import pytest
from pydantic import ValidationError

from app.websocket.router import dispatch_event


class FakeWebSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


@pytest.mark.anyio
async def test_dispatch_event_rejects_unknown_type():
    websocket = FakeWebSocket()

    handled = await dispatch_event(websocket, {"type": "unknown"}, {"id": 1})

    assert handled is False
    assert websocket.messages == [
        {
            "type": "error",
            "action": "payload",
            "message": "Tipo de evento não reconhecido.",
        }
    ]


@pytest.mark.anyio
async def test_dispatch_event_reports_validation_error(monkeypatch):
    websocket = FakeWebSocket()

    handled = await dispatch_event(
        websocket,
        {"type": "direct_message", "recipientId": 0, "message": "oi"},
        {"id": 1},
    )

    assert handled is False
    assert websocket.messages[0]["type"] == "error"
    assert websocket.messages[0]["action"] == "direct_message"
    assert websocket.messages[0]["message"] == "Identificador inválido."


@pytest.mark.anyio
async def test_dispatch_event_passes_valid_message_to_handler(monkeypatch):
    websocket = FakeWebSocket()
    captured = {}

    async def fake_handler(websocket_arg, event_arg, user_arg):
        captured["websocket"] = websocket_arg
        captured["event"] = event_arg
        captured["user"] = user_arg

    monkeypatch.setitem(__import__("app.websocket.router", fromlist=["_HANDLERS"])._HANDLERS, "message", (__import__("app.websocket.schemas", fromlist=["ChatMessageEvent"]).ChatMessageEvent, fake_handler))

    handled = await dispatch_event(
        websocket,
        {"type": "message", "messageId": "m1", "message": "Olá"},
        {"id": 7},
    )

    assert handled is True
    assert captured["event"].messageId == "m1"
    assert captured["event"].message == "Olá"
    assert captured["user"] == {"id": 7}
