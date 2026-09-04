"""Package-level compatibility hooks for the Pokinex moderation engine."""

import re
import time

from fastapi import WebSocket

from .auth import get_user_from_token
from .moderation_bot import ModerationBot, moderation_bot


# Laughter such as "kkkkkkkk" is normal chat behavior. We only collapse very
# long laughter runs before the existing repetition detector sees the message.
# Other repeated characters (for example "!!!!!!!!!!" or "zzzzzzzzzz") keep the
# stricter moderation behavior.
_LAUGHTER_RUN = re.compile(r"([kha])\1{8,}", re.IGNORECASE)
_original_moderate = ModerationBot.moderate


def _moderate_with_laughter_tolerance(self, message, user_id=None):
    safe_message = _LAUGHTER_RUN.sub(
        lambda match: match.group(1) * 4,
        message,
    )
    return _original_moderate(self, safe_message, user_id)


ModerationBot.moderate = _moderate_with_laughter_tolerance


def _remaining_mute_seconds(self, user_id) -> int:
    expires = self._muted_until.get(str(user_id))
    if expires is None:
        return 0
    remaining = max(0, int(expires - time.time() + 0.999))
    if remaining == 0:
        self._muted_until.pop(str(user_id), None)
    return remaining


ModerationBot.remaining_mute_seconds = _remaining_mute_seconds


_original_send_json = WebSocket.send_json


async def _send_json_with_moderation_countdown(self, data, *args, **kwargs):
    if isinstance(data, dict) and data.get("type") == "moderation":
        action = data.get("action")
        if action in {"blocked", "duplicate", "flood", "muted"}:
            token = self.cookies.get("session")
            user = get_user_from_token(token) if token else None
            if user:
                remaining = moderation_bot.remaining_mute_seconds(user["id"])
                if remaining > 0:
                    data = {**data, "muteRemainingSeconds": remaining}
    await _original_send_json(self, data, *args, **kwargs)


WebSocket.send_json = _send_json_with_moderation_countdown
