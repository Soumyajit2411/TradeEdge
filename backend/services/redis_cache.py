"""Redis caching service — optional, gracefully degrades if Redis is unavailable."""

import json
import logging
from typing import Any, Optional

import config

log = logging.getLogger(__name__)
_client = None
_unavailable = False


def _get():
    global _client, _unavailable
    if _unavailable:
        return None
    if _client is not None:
        return _client
    try:
        import redis
        r = redis.from_url(config.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        r.ping()
        _client = r
        log.info("Redis connected at %s", config.REDIS_URL)
    except Exception as exc:
        log.warning("Redis unavailable (%s) — caching disabled", exc)
        _unavailable = True
    return _client


def get(key: str) -> Optional[Any]:
    r = _get()
    if not r:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        log.debug("redis get('%s') failed: %s", key, exc)
        return None


def set(key: str, value: Any, ttl: int = 30) -> bool:
    r = _get()
    if not r:
        return False
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as exc:
        log.debug("redis set('%s') failed: %s", key, exc)
        return False


def delete(key: str) -> None:
    r = _get()
    if not r:
        return
    try:
        r.delete(key)
    except Exception as exc:
        log.debug("redis delete('%s') failed: %s", key, exc)
