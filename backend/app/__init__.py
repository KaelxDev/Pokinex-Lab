"""Package-level compatibility hooks for the Pokinex moderation engine."""

from contextvars import ContextVar
import re
import time

from fastapi import WebSocket

from .auth import get_user_from_token
from .moderation_bot import ModerationBot, ModerationResult, moderation_bot
from .websocket.chat import manager
from .websocket.schemas import ChatMessageEvent


_LAUGHTER_RUN = re.compile(r"([kha])\1{8,}", re.IGNORECASE)
_current_message_id = ContextVar("pokinex_current_message_id", default=None)
_pending_cleanup_ids = ContextVar("pokinex_pending_cleanup_ids", default=None)
_original_moderate = ModerationBot.moderate


def _moderate_with_pokinex_rules(self, message, user_id=None):
    safe_message = _LAUGHTER_RUN.sub(lambda match: match.group(1) * 4, message)
    current_message_id = _current_message_id.get()
    _pending_cleanup_ids.set([])

    history = getattr(self, "_duplicate_burst_history", None)
    if history is None:
        history = {}
        self._duplicate_burst_history = history

    key = str(user_id) if user_id is not None else None
    normalized = self.normalize_for_moderation(message).casefold()
    now = time.time()
    window = getattr(self, "DUPLICATE_WINDOW_SECONDS", 20.0)
    threshold = 5

    if key is not None and normalized:
        entries = history.setdefault(key, [])
        entries[:] = [
            entry for entry in entries
            if now - entry[0] <= window and entry[1] == normalized
        ]

        if entries:
            count = len(entries) + 1
            if count >= threshold:
                cleanup_ids = [
                    entry[2] for entry in entries[-4:] if entry[2]
                ]
                _pending_cleanup_ids.set(cleanup_ids)
                entries.clear()
                return ModerationResult(
                    False,
                    "A mesma mensagem foi enviada 5 vezes seguidas. Uma ocorrência foi registrada.",
                    "🔁 Ocorrência registrada por repetição excessiva. As 4 mensagens anteriores foram removidas e esta tentativa foi bloqueada.",
                    "duplicate_burst",
                    "duplicate_burst",
                    "medium",
                    0,
                )

            internal_message = (
                f"{safe_message} [pokinex-duplicate-check-"
                f"{count}-{current_message_id or now}]"
            )
            result = _original_moderate(self, internal_message, user_id)
            if result.allowed:
                entries.append((now, normalized, current_message_id))
            return result

        result = _original_moderate(self, safe_message, user_id)
        if result.allowed:
            entries.append((now, normalized, current_message_id))
        return result

    return _original_moderate(self, safe_message, user_id)


ModerationBot.moderate = _moderate_with_pokinex_rules


def _remaining_mute_seconds(self, user_id) -> int:
    expires = self._muted_until.get(str(user_id))
    if expires is None:
        return 0
    remaining = max(0, int(expires - time.time() + 0.999))
    if remaining == 0:
        self._muted_until.pop(str(user_id), None)
    return remaining


ModerationBot.remaining_mute_seconds = _remaining_mute_seconds


async def _purge_repeated_messages(websocket: WebSocket, user, message_ids: list[str]):
    for message_id in message_ids:
        try:
            await manager.delete_message(user, message_id, websocket)
        except Exception:
            continue


_original_send_json = WebSocket.send_json


async def _send_json_with_moderation_countdown(self, data, *args, **kwargs):
    cleanup_ids = []
    if isinstance(data, dict) and data.get("type") == "moderation":
        action = data.get("action")

        if action == "duplicate_burst":
            cleanup_ids = list(_pending_cleanup_ids.get() or [])
            if cleanup_ids:
                data = {
                    **data,
                    "removeMessageIds": cleanup_ids,
                    "cleanupCount": len(cleanup_ids),
                }
            _pending_cleanup_ids.set([])

        if action in {"blocked", "duplicate", "flood", "muted", "duplicate_burst"}:
            token = self.cookies.get("session")
            current_user = get_user_from_token(token) if token else None
            if current_user:
                remaining = moderation_bot.remaining_mute_seconds(current_user["id"])
                if remaining > 0:
                    data = {**data, "muteRemainingSeconds": remaining}

    await _original_send_json(self, data, *args, **kwargs)

    if cleanup_ids:
        token = self.cookies.get("session")
        current_user = get_user_from_token(token) if token else None
        if current_user:
            await _purge_repeated_messages(self, current_user, cleanup_ids)


WebSocket.send_json = _send_json_with_moderation_countdown


_original_chat_event_validate = ChatMessageEvent.model_validate


@classmethod
def _chat_event_model_validate(cls, obj, *args, **kwargs):
    token = _current_message_id.set(
        obj.get("messageId") if isinstance(obj, dict) else None
    )
    result = _original_chat_event_validate(obj, *args, **kwargs)
    return result


ChatMessageEvent.model_validate = _chat_event_model_validate
