"""Per-user sliding-window rate limiter — Redis-backed, in-memory fallback."""

import threading
import time

# In-memory fallback (single-worker or Redis-unavailable)
_calls: dict[str, list[float]] = {}
_lock = threading.Lock()


def _check_memory(user_id: str, max_calls: int, window_secs: int) -> bool:
    now = time.time()
    with _lock:
        timestamps = [t for t in _calls.get(user_id, []) if now - t < window_secs]
        if len(timestamps) >= max_calls:
            return False
        timestamps.append(now)
        _calls[user_id] = timestamps
        return True


def check(user_id: str, max_calls: int = 5, window_secs: int = 60) -> bool:
    """Return True if the request is within the rate limit, False if exceeded."""
    from services import redis_cache

    r = redis_cache.client()
    if not r:
        return _check_memory(user_id, max_calls, window_secs)

    now = time.time()
    key = f"ratelimit:{user_id}:{max_calls}:{window_secs}"

    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_secs)
    pipe.zcard(key)
    _, count = pipe.execute()

    if count >= max_calls:
        return False

    pipe = r.pipeline()
    pipe.zadd(key, {f"{now:.6f}": now})
    pipe.expire(key, window_secs + 1)
    pipe.execute()
    return True
