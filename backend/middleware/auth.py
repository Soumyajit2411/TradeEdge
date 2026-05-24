"""Auth dependency — verifies Supabase JWT and returns a UserContext for injection."""

import hashlib
import logging
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config
from services import redis_cache, supabase_client

log = logging.getLogger(__name__)

_TOKEN_TTL = 60   # seconds — token → user_id
_CREDS_TTL = 300  # seconds — user_id → Delta credentials

_security = HTTPBearer(auto_error=False)


def _token_key(token: str) -> str:
    return "auth:token:" + hashlib.sha256(token.encode()).hexdigest()[:24]


def _creds_key(user_id: str) -> str:
    return f"auth:creds:{user_id}"


def invalidate_creds(user_id: str) -> None:
    """Evict the credentials cache. Call after saving or deleting Delta API keys."""
    redis_cache.delete(_creds_key(user_id))


class UserContext:
    """Authenticated user context injected by require_auth."""

    def __init__(self, user_id: str, api_key: str, api_secret: str) -> None:
        self.user_id = user_id
        self.api_key = api_key
        self.api_secret = api_secret


def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> UserContext:
    """FastAPI dependency: validate Bearer token, return UserContext."""
    if credentials is None:
        log.warning("[auth] missing Authorization header")
        raise HTTPException(status_code=401, detail="Authorization header required")

    token = credentials.credentials

    # Cache token → user_id to avoid a Supabase round-trip on every request.
    user_id = redis_cache.get(_token_key(token))
    if user_id is None:
        user = supabase_client.verify_token(token)
        if not user:
            log.warning("[auth] token verification failed")
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user_id = user.get("id") or user.get("sub", "")
        redis_cache.set(_token_key(token), user_id, ttl=_TOKEN_TTL)

    # Cache credentials per user_id — invalidated on save/delete.
    creds = redis_cache.get(_creds_key(user_id))
    if creds is None:
        creds = supabase_client.get_user_credentials(user_id) or {}
        redis_cache.set(_creds_key(user_id), creds, ttl=_CREDS_TTL)

    return UserContext(
        user_id=user_id,
        api_key=creds.get("api_key") or config.DELTA_API_KEY,
        api_secret=creds.get("api_secret") or config.DELTA_API_SECRET,
    )
