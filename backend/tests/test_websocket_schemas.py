import pytest
from pydantic import ValidationError

from app.websocket.schemas import (
    ChatMessageEvent,
    DeleteMessageEvent,
    EditMessageEvent,
    ReactionEvent,
)


def test_chat_message_event_accepts_valid_payload():
    event = ChatMessageEvent.model_validate(
        {
            "type": "message",
            "messageId": "msg-1",
            "message": "Olá!",
            "replyTo": "msg-0",
        }
    )

    assert event.type == "message"
    assert event.messageId == "msg-1"
    assert event.replyTo == "msg-0"


def test_chat_message_event_rejects_oversized_message():
    with pytest.raises(ValidationError):
        ChatMessageEvent.model_validate(
            {
                "type": "message",
                "message": "x" * 1001,
            }
        )


def test_message_event_schemas_validate_types():
    assert EditMessageEvent.model_validate(
        {"type": "edit_message", "messageId": "msg-1", "message": "Editada"}
    )
    assert DeleteMessageEvent.model_validate(
        {"type": "delete_message", "messageId": "msg-1"}
    )
    assert ReactionEvent.model_validate(
        {"type": "reaction", "messageId": "msg-1", "reaction": "❤️"}
    )


def test_reaction_event_rejects_unknown_reaction():
    with pytest.raises(ValidationError):
        ReactionEvent.model_validate(
            {"type": "reaction", "messageId": "msg-1", "reaction": "🔥"}
        )
