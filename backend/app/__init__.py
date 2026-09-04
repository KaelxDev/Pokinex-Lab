"""Package-level compatibility hooks for the Pokinex moderation engine."""

import re

from .moderation_bot import ModerationBot


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
