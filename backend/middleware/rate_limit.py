"""Per-user in-memory sliding-window rate limiter."""

import threading
import time

_calls: dict[str, list[float]] = {}
_lock = threading.Lock()


def check(user_id: str, max_calls: int = 5, window_secs: int = 60) -> bool:
    """Return True if the request is within the rate limit, False if exceeded."""
    now = time.time()
    with _lock:
        timestamps = [t for t in _calls.get(user_id, []) if now - t < window_secs]
        if len(timestamps) >= max_calls:
            return False
        timestamps.append(now)
        _calls[user_id] = timestamps
        return True
