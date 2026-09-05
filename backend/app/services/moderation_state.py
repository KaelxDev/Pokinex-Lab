"""Ephemeral state owned by the moderation subsystem.

The state is intentionally separate from PokiBot's conversational behavior so
moderation policy can be tested and evolved without depending on bot response
logic. It remains in-process for now and can later move behind a repository
or distributed state adapter when multi-instance deployment requires it.
"""

from collections import defaultdict, deque
import time


class ModerationState:
    """Bounded in-memory moderation state for a single application instance."""

    VIOLATION_WINDOW_SECONDS = 120.0
    BOT_REPLY_COOLDOWN_SECONDS = 3.0
    MEMORY_MAX_TURNS = 6
    FLOOD_WINDOW_SECONDS = 8.0
    DUPLICATE_WINDOW_SECONDS = 20.0

    def __init__(self) -> None:
        self._muted_until: dict[str, float] = {}
        self._violation_times: dict[str, deque[float]] = defaultdict(deque)
        self._last_bot_reply_at: dict[str, float] = {}
        self._conversation_memory: dict[str, deque[tuple[str, str]]] = defaultdict(
            lambda: deque(maxlen=self.MEMORY_MAX_TURNS)
        )
        self._categories: dict[str, int] = defaultdict(int)
        self._total_checked = 0
        self._total_blocked = 0
        self._message_times: dict[str, deque[float]] = defaultdict(deque)
        self._duplicate_history: dict[str, list[tuple[float, str, str | None]]] = defaultdict(list)
        self.started_at = time.time()

    def record_checked(self) -> None:
        self._total_checked += 1

    def record_blocked(self, category: str) -> None:
        self._total_blocked += 1
        self._categories[category] += 1

    def register_violation(self, user_id: int | None) -> tuple[int, int]:
        if user_id is None:
            return 1, 0

        key = str(user_id)
        now = time.time()
        violations = self._violation_times[key]
        while violations and now - violations[0] > self.VIOLATION_WINDOW_SECONDS:
            violations.popleft()
        violations.append(now)

        strike = len(violations)
        mute_minutes = {1: 0, 2: 1, 3: 5}.get(strike, 15)
        return strike, mute_minutes

    def can_bot_reply(self, user_id: int | None, *, is_follow_up: bool = False) -> bool:
        if user_id is None or is_follow_up:
            return True
        key = str(user_id)
        return time.time() - self._last_bot_reply_at.get(key, 0.0) >= self.BOT_REPLY_COOLDOWN_SECONDS

    def mark_bot_reply(self, user_id: int | None) -> None:
        if user_id is not None:
            self._last_bot_reply_at[str(user_id)] = time.time()

    def remember_turn(self, user_id: int | None, role: str, text: str) -> None:
        if user_id is None or not text:
            return
        self._conversation_memory[str(user_id)].append((role, text))

    def recent_user_turns(self, user_id: int | None, limit: int = 3) -> list[str]:
        if user_id is None:
            return []
        turns = self._conversation_memory.get(str(user_id), ())
        return [text for role, text in turns if role == "user"][-limit:]

    def record_message_time(self, user_id: int, now: float) -> int:
        timestamps = self._message_times[str(user_id)]
        while timestamps and now - timestamps[0] > self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()
        timestamps.append(now)
        return len(timestamps)

    def duplicate_count(self, user_id: int, normalized: str, message_id: str | None, now: float) -> tuple[int, tuple[str, ...]]:
        key = str(user_id)
        history = self._duplicate_history[key]
        history[:] = [
            entry
            for entry in history
            if now - entry[0] <= self.DUPLICATE_WINDOW_SECONDS
            and entry[1] == normalized
        ]

        count = len(history) + 1
        if count >= 5:
            cleanup_ids = tuple(entry[2] for entry in history[-4:] if entry[2])
            history.clear()
            return count, cleanup_ids

        history.append((now, normalized, message_id))
        return count, ()

    def clear_duplicate_history(self, user_id: int) -> None:
        self._duplicate_history[str(user_id)].clear()

    def mute(self, user_id: int, minutes: int) -> None:
        self._muted_until[str(user_id)] = time.time() + (minutes * 60)

    def unmute(self, user_id: int) -> None:
        self._muted_until.pop(str(user_id), None)

    def is_muted(self, user_id: int) -> bool:
        key = str(user_id)
        expires = self._muted_until.get(key)
        if expires is None:
            return False
        if time.time() >= expires:
            self._muted_until.pop(key, None)
            return False
        return True

    def remaining_mute_seconds(self, user_id: int) -> int:
        expires = self._muted_until.get(str(user_id))
        if expires is None:
            return 0
        remaining = max(0, int(expires - time.time() + 0.999))
        if remaining == 0:
            self._muted_until.pop(str(user_id), None)
        return remaining

    def status_snapshot(self) -> tuple[int, int, dict[str, int], int]:
        uptime = max(0, int(time.time() - self.started_at))
        return uptime, self._total_checked, dict(self._categories), self._total_blocked
