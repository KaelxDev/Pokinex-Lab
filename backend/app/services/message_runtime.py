"""Ephemeral runtime state used by the public message transport."""

from collections import deque

MAX_PROCESSED_MESSAGE_IDS = 10_000
MAX_MESSAGE_OWNERS = 4_096


class MessageRuntimeState:
    """Bounded in-memory state for deduplication and message ownership."""

    def __init__(self):
        self.processed_message_ids = set()
        self._processed_message_order = deque()
        self.message_owners = {}
        self._message_owner_order = deque()

    def remember_processed_message(self, message_id):
        if message_id in self.processed_message_ids:
            return

        self.processed_message_ids.add(message_id)
        self._processed_message_order.append(message_id)

        while len(self._processed_message_order) > MAX_PROCESSED_MESSAGE_IDS:
            expired_id = self._processed_message_order.popleft()
            self.processed_message_ids.discard(expired_id)

    def forget_processed_message(self, message_id):
        self.processed_message_ids.discard(message_id)
        try:
            self._processed_message_order.remove(message_id)
        except ValueError:
            pass

    def cache_message_owner(self, message_id, owner_id):
        if message_id not in self.message_owners:
            self._message_owner_order.append(message_id)

        self.message_owners[message_id] = owner_id

        while len(self._message_owner_order) > MAX_MESSAGE_OWNERS:
            expired_id = self._message_owner_order.popleft()
            self.message_owners.pop(expired_id, None)

    def forget_message_owner(self, message_id):
        self.message_owners.pop(message_id, None)
        try:
            self._message_owner_order.remove(message_id)
        except ValueError:
            pass
