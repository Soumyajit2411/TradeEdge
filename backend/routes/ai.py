"""AI analysis routes — /api/ai/*"""

import logging

from flask import Blueprint, Response, g, request

from middleware.auth import require_auth
from middleware.rate_limit import check as rate_check
from services import ai_service

log = logging.getLogger(__name__)
bp = Blueprint("ai", __name__)


@bp.post("/api/ai/analyze")
@require_auth
def route_analyze() -> Response:
    if not rate_check(g.user_id, max_calls=5, window_secs=60):
        return Response("Rate limit exceeded. Please wait before generating another report.", status=429, content_type="text/plain")
    try:
        body   = request.get_json(silent=True) or {}
        output = ai_service.call_gemini(body)
        return Response(output, content_type="text/plain; charset=utf-8")
    except RuntimeError as exc:
        status = 503 if "not set" in str(exc) else 502
        log.warning("[ai/analyze] user=%s — Gemini error (%s)", g.user_id, status)
        return Response("AI service temporarily unavailable. Please try again.", status=status, content_type="text/plain")
    except Exception as exc:
        log.error("[ai/analyze] user=%s — unexpected error: %s", g.user_id, exc)
        return Response("Unexpected error. Please try again.", status=500, content_type="text/plain")


@bp.post("/api/ai/trade-replay")
@require_auth
def route_trade_replay() -> Response:
    if not rate_check(g.user_id, max_calls=10, window_secs=60):
        return Response("Rate limit exceeded. Please wait before replaying another trade.", status=429, content_type="text/plain")
    try:
        body    = request.get_json(silent=True) or {}
        trade   = body.get("trade") or {}
        context = body.get("context") or {}

        if not isinstance(trade, dict) or not trade.get("id"):
            log.warning("[ai/trade-replay] user=%s — missing trade payload", g.user_id)
            return Response("Missing required 'trade' payload", status=400, content_type="text/plain")

        output = ai_service.call_gemini_raw(
            ai_service.build_trade_replay_prompt(trade, context),
            max_tokens=900,
        )
        return Response(output, content_type="text/plain; charset=utf-8")
    except RuntimeError as exc:
        status = 503 if "not set" in str(exc) else 502
        log.warning("[ai/trade-replay] user=%s — Gemini error (%s)", g.user_id, status)
        return Response("AI service temporarily unavailable. Please try again.", status=status, content_type="text/plain")
    except Exception as exc:
        log.error("[ai/trade-replay] user=%s — unexpected error: %s", g.user_id, exc)
        return Response("Unexpected error. Please try again.", status=500, content_type="text/plain")
