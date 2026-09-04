from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BaseWebSocketEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ChatMessageEvent(BaseWebSocketEvent):
    type: Literal["message"] = "message"
    messageId: str | None = Field(default=None, max_length=128)
    message: str = Field(..., min_length=1, max_length=1000)
    replyTo: str | None = Field(default=None, max_length=128)


class DirectMessageEvent(BaseWebSocketEvent):
    type: Literal["direct_message"] = "direct_message"
    messageId: str | None = Field(default=None, max_length=128)
    recipientId: int = Field(..., gt=0)
    message: str = Field(..., min_length=1, max_length=1000)
    replyTo: str | None = Field(default=None, max_length=128)


class DirectMessageEditEvent(BaseWebSocketEvent):
    type: Literal["direct_message_edit"] = "direct_message_edit"
    messageId: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=1000)


class DirectMessageDeleteEvent(BaseWebSocketEvent):
    type: Literal["direct_message_delete"] = "direct_message_delete"
    messageId: str = Field(..., min_length=1, max_length=128)


class DirectMessageReactionEvent(BaseWebSocketEvent):
    type: Literal["direct_message_reaction"] = "direct_message_reaction"
    messageId: str = Field(..., min_length=1, max_length=128)
    reaction: Literal["❤️", "😂", "😮", "😢", "😡", "👍"]


class EditMessageEvent(BaseWebSocketEvent):
    type: Literal["edit_message"] = "edit_message"
    messageId: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=1000)


class DeleteMessageEvent(BaseWebSocketEvent):
    type: Literal["delete_message"] = "delete_message"
    messageId: str = Field(..., min_length=1, max_length=128)


class ReactionEvent(BaseWebSocketEvent):
    type: Literal["reaction"] = "reaction"
    messageId: str = Field(..., min_length=1, max_length=128)
    reaction: Literal["❤️", "😂", "😮", "😢", "😡", "👍"]
