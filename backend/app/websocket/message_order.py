from datetime import datetime, timedelta, timezone

from app.websocket.chat import manager

_last_timestamp: datetime | None = None


def ordered_timestamp():
    global _last_timestamp
    now = datetime.now(timezone.utc)
    if _last_timestamp is not None and now <= _last_timestamp:
        now = _last_timestamp + timedelta(milliseconds=1)
    _last_timestamp = now
    return now.isoformat()


# Keep the existing manager object shared by websocket and auth routes,
# while making timestamps strictly increasing for display ordering.
manager.get_timestamp = ordered_timestamp
