"""Small in-process rate limiter for abuse-sensitive endpoints."""

import threading
import time
from collections import defaultdict, deque

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LOCK = threading.Lock()


def allow_request(key: str, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _LOCK:
        bucket = _BUCKETS[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def client_key(request) -> str:
    return request.client.host if request.client else "unknown"
