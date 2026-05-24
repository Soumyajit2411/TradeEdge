"""Fetch AI prompt templates from the Supabase ai_prompts table, with Redis caching."""

import logging
from string import Template
from typing import Optional

log = logging.getLogger(__name__)

_CACHE_PREFIX = "prompt:"
_CACHE_TTL = 300  # 5 min — prompts change rarely


def get_template(key: str) -> Template:
    """Return a string.Template for `key`. Hits Redis first, then Supabase."""
    from services import redis_cache

    cache_key = f"{_CACHE_PREFIX}{key}"
    cached = redis_cache.get(cache_key)
    if cached is not None:
        return Template(cached)

    text = _fetch(key)
    if text is None:
        raise RuntimeError(f"No active prompt template found for key='{key}'")

    redis_cache.set(cache_key, text, ttl=_CACHE_TTL)
    return Template(text)


def _fetch(key: str) -> Optional[str]:
    from services import supabase_client

    try:
        rows = supabase_client.get_rows(
            "ai_prompts",
            {
                "select": "template",
                "key": f"eq.{key}",
                "is_active": "eq.true",
                "order": "version.desc",
                "limit": "1",
            },
        )
        if rows:
            return rows[0]["template"]
        return None
    except Exception as exc:
        log.error("prompt_store fetch key=%s failed: %s", key, exc)
        return None
