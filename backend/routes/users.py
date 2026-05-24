"""User management routes — /api/users/*"""

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

import config
from middleware.auth import UserContext, invalidate_creds, require_auth
from services import redis_cache, supabase_client
from delta_rest_client import DeltaRestClient

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/users/credentials/status")
def credentials_status(auth: UserContext = Depends(require_auth)):
    creds = supabase_client.get_user_credentials(auth.user_id)
    return {"has_credentials": bool(creds)}


@router.post("/api/users/credentials")
def save_credentials(
    auth: UserContext = Depends(require_auth),
    body: Optional[dict[str, Any]] = Body(default=None),
):
    payload = body or {}
    api_key = str(payload.get("api_key", "")).strip()
    api_secret = str(payload.get("api_secret", "")).strip()

    if not api_key or not api_secret:
        log.warning(
            "[users/credentials] user=%s — missing api_key or api_secret in request body",
            auth.user_id,
        )
        raise HTTPException(status_code=400, detail="api_key and api_secret are required")

    # Validate credentials against Delta Exchange.
    try:
        client = DeltaRestClient(
            base_url=config.DELTA_BASE_URL,
            api_key=api_key,
            api_secret=api_secret,
        )
        start_time = int(time.time()) - 30 * 86_400
        data = client.fills(query={"start_time": start_time}, page_size=1)

        if isinstance(data, dict) and data.get("success") is False:
            err = str(data.get("error") or data.get("result") or "").strip()
            msg = "Delta Exchange rejected these credentials. Check that they have read permission."
            if err:
                msg = f"{msg} ({err})"
            log.warning(
                "[users/credentials] user=%s — Delta validation rejected: %s",
                auth.user_id,
                err or "no detail",
            )
            raise HTTPException(status_code=400, detail=msg)

    except HTTPException:
        raise
    except Exception as exc:
        log.error(
            "[users/credentials] user=%s — Delta validation exception: %s", auth.user_id, exc
        )
        raise HTTPException(
            status_code=400,
            detail="Credential validation failed. Please check your API key and secret.",
        )

    ok, detail = supabase_client.save_user_credentials(auth.user_id, api_key, api_secret)
    if not ok:
        log.error(
            "[users/credentials] user=%s — Supabase save failed: %s", auth.user_id, detail
        )
        raise HTTPException(status_code=500, detail="Failed to save credentials. Please try again.")

    redis_cache.delete(f"fills:{auth.user_id}")
    invalidate_creds(auth.user_id)
    return {"ok": True}


@router.delete("/api/users/credentials")
def delete_credentials(auth: UserContext = Depends(require_auth)):
    ok = supabase_client.delete_user_credentials(auth.user_id)
    if not ok:
        log.warning(
            "[users/credentials] user=%s — delete failed or Supabase not configured", auth.user_id
        )
    redis_cache.delete(f"fills:{auth.user_id}")
    invalidate_creds(auth.user_id)
    return {"ok": True}
