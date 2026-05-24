"""Supabase REST client — JWT verification and credential storage.

Uses the Supabase REST API directly via `requests` so no additional
Python package is required beyond what's already installed.
"""

import logging
from typing import Any, Optional

import requests

import config

log = logging.getLogger(__name__)

# Reuse a single requests.Session for connection pooling.
_session = requests.Session()


def _headers(*, service: bool = False) -> dict[str, str]:
    key = config.SUPABASE_SERVICE_ROLE_KEY if service else config.SUPABASE_ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def verify_token(token: str) -> Optional[dict[str, Any]]:
    """Verify a Supabase JWT and return the user payload or None."""
    if not config.SUPABASE_URL or not config.SUPABASE_ANON_KEY:
        return None
    try:
        res = _session.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": config.SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=5,
        )
        if res.status_code == 200:
            return res.json()
        return None
    except Exception as exc:
        log.warning("Token verification failed: %s", exc)
        return None


def get_user_credentials(user_id: str) -> Optional[dict[str, str]]:
    """Return {api_key, api_secret} for a user, or None if not set."""
    if not config.SUPABASE_URL or not _service_key_valid():
        return None
    try:
        res = _session.get(
            f"{config.SUPABASE_URL}/rest/v1/user_credentials",
            params={"select": "api_key,api_secret", "user_id": f"eq.{user_id}"},
            headers=_headers(service=True),
            timeout=5,
        )
        if res.status_code == 200:
            rows = res.json()
            return rows[0] if rows else None
        return None
    except Exception as exc:
        log.warning("get_user_credentials failed: %s", exc)
        return None


def _service_key_valid() -> bool:
    """Return False if the service role key is missing, a placeholder, or too short."""
    k = config.SUPABASE_SERVICE_ROLE_KEY
    return bool(k) and len(k) > 40 and not k.startswith("your-")


def save_user_credentials(user_id: str, api_key: str, api_secret: str) -> tuple[bool, str]:
    """Upsert Delta Exchange credentials. Returns (success, error_detail)."""
    if not config.SUPABASE_URL:
        return False, "SUPABASE_URL is not set in backend .env"
    if not _service_key_valid():
        return (
            False,
            "SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder — add it from Supabase dashboard → Settings → API → service_role",
        )
    try:
        h = _headers(service=True)
        h["Prefer"] = "resolution=merge-duplicates,return=minimal"
        res = _session.post(
            f"{config.SUPABASE_URL}/rest/v1/user_credentials",
            json={"user_id": user_id, "api_key": api_key, "api_secret": api_secret},
            headers=h,
            timeout=5,
        )
        if res.status_code in (200, 201):
            return True, ""
        log.warning("save_user_credentials HTTP %s: %s", res.status_code, res.text[:300])
        return False, f"Supabase returned {res.status_code}: {res.text[:200]}"
    except Exception as exc:
        log.warning("save_user_credentials failed: %s", exc)
        return False, str(exc)


def get_rows(table: str, params: dict) -> "list | None":
    """SELECT rows from a Supabase table using the service role key."""
    if not config.SUPABASE_URL or not _service_key_valid():
        return None
    try:
        res = _session.get(
            f"{config.SUPABASE_URL}/rest/v1/{table}",
            params=params,
            headers=_headers(service=True),
            timeout=5,
        )
        if res.status_code == 200:
            return res.json()
        log.warning("get_rows %s HTTP %s: %s", table, res.status_code, res.text[:200])
        return None
    except Exception as exc:
        log.warning("get_rows %s failed: %s", table, exc)
        return None


def delete_user_credentials(user_id: str) -> bool:
    """Remove Delta credentials for a user."""
    if not config.SUPABASE_URL or not _service_key_valid():
        return False
    try:
        res = _session.delete(
            f"{config.SUPABASE_URL}/rest/v1/user_credentials",
            params={"user_id": f"eq.{user_id}"},
            headers=_headers(service=True),
            timeout=5,
        )
        return res.status_code in (200, 204)
    except Exception as exc:
        log.warning("delete_user_credentials failed: %s", exc)
        return False
