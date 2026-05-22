"""Auth decorator — verifies Supabase JWT and loads user credentials into Flask g."""

import logging
from functools import wraps

from flask import g, jsonify, request

import config
from services import supabase_client

log = logging.getLogger(__name__)


def require_auth(f):
    """Validate Bearer token, set g.user_id / g.api_key / g.api_secret."""

    @wraps(f)
    def _decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            log.warning("[auth] %s %s — missing Authorization header", request.method, request.path)
            return jsonify({"error": "Authorization header required"}), 401

        token = auth[7:]
        user = supabase_client.verify_token(token)
        if not user:
            log.warning("[auth] %s %s — token verification failed", request.method, request.path)
            return jsonify({"error": "Invalid or expired token"}), 401

        g.user_id = user.get("id") or user.get("sub", "")

        creds = supabase_client.get_user_credentials(g.user_id) or {}
        g.api_key = creds.get("api_key") or config.DELTA_API_KEY
        g.api_secret = creds.get("api_secret") or config.DELTA_API_SECRET

        return f(*args, **kwargs)

    return _decorated
