"""User management routes — /api/users/*"""

import logging
import time

from flask import Blueprint, Response, g, jsonify, request

import config
from middleware.auth import require_auth
from services import redis_cache, supabase_client
from delta_rest_client import DeltaRestClient

log = logging.getLogger(__name__)
bp = Blueprint("users", __name__)


@bp.get("/api/users/credentials/status")
@require_auth
def credentials_status() -> Response:
    creds = supabase_client.get_user_credentials(g.user_id)
    return jsonify({"has_credentials": bool(creds)})


@bp.post("/api/users/credentials")
@require_auth
def save_credentials() -> Response:
    body = request.get_json(silent=True) or {}
    api_key = str(body.get("api_key", "")).strip()
    api_secret = str(body.get("api_secret", "")).strip()

    if not api_key or not api_secret:
        log.warning(
            "[users/credentials] user=%s — missing api_key or api_secret in request body", g.user_id
        )
        return jsonify({"error": "api_key and api_secret are required"}), 400

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
                g.user_id,
                err or "no detail",
            )
            return jsonify({"error": msg}), 400

    except Exception as exc:
        log.error("[users/credentials] user=%s — Delta validation exception: %s", g.user_id, exc)
        return (
            jsonify(
                {"error": "Credential validation failed. Please check your API key and secret."}
            ),
            400,
        )

    ok, detail = supabase_client.save_user_credentials(g.user_id, api_key, api_secret)
    if not ok:
        log.error("[users/credentials] user=%s — Supabase save failed: %s", g.user_id, detail)
        return jsonify({"error": "Failed to save credentials. Please try again."}), 500

    redis_cache.delete(f"fills:{g.user_id}")
    return jsonify({"ok": True})


@bp.delete("/api/users/credentials")
@require_auth
def delete_credentials() -> Response:
    ok = supabase_client.delete_user_credentials(g.user_id)
    if not ok:
        log.warning(
            "[users/credentials] user=%s — delete failed or Supabase not configured", g.user_id
        )
    redis_cache.delete(f"fills:{g.user_id}")
    return jsonify({"ok": True})
