"""AI analysis routes — /api/ai/*"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends
from fastapi.responses import PlainTextResponse

from middleware.auth import UserContext, require_auth
from middleware.rate_limit import check as rate_check
from services import ai_service

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/ai/analyze", response_class=PlainTextResponse)
def route_analyze(
    auth: UserContext = Depends(require_auth),
    body: Optional[dict[str, Any]] = Body(default=None),
):
    if not rate_check(auth.user_id, max_calls=5, window_secs=60):
        return PlainTextResponse(
            "Rate limit exceeded. Please wait before generating another report.",
            status_code=429,
        )
    try:
        output = ai_service.call_gemini(body or {})
        return PlainTextResponse(output)
    except RuntimeError as exc:
        status = 503 if "not set" in str(exc) else 502
        log.warning("[ai/analyze] user=%s — Gemini error (%s)", auth.user_id, status)
        return PlainTextResponse(
            "AI service temporarily unavailable. Please try again.", status_code=status
        )
    except Exception as exc:
        log.error("[ai/analyze] user=%s — unexpected error: %s", auth.user_id, exc)
        return PlainTextResponse("Unexpected error. Please try again.", status_code=500)


@router.post("/api/ai/trade-replay", response_class=PlainTextResponse)
def route_trade_replay(
    auth: UserContext = Depends(require_auth),
    body: Optional[dict[str, Any]] = Body(default=None),
):
    if not rate_check(auth.user_id, max_calls=10, window_secs=60):
        return PlainTextResponse(
            "Rate limit exceeded. Please wait before replaying another trade.",
            status_code=429,
        )
    try:
        payload = body or {}
        trade = payload.get("trade") or {}
        context = payload.get("context") or {}

        if not isinstance(trade, dict) or not trade.get("id"):
            log.warning("[ai/trade-replay] user=%s — missing trade payload", auth.user_id)
            return PlainTextResponse("Missing required 'trade' payload", status_code=400)

        output = ai_service.call_gemini_raw(
            ai_service.build_trade_replay_prompt(trade, context),
            max_tokens=900,
        )
        return PlainTextResponse(output)
    except RuntimeError as exc:
        status = 503 if "not set" in str(exc) else 502
        log.warning("[ai/trade-replay] user=%s — Gemini error (%s)", auth.user_id, status)
        return PlainTextResponse(
            "AI service temporarily unavailable. Please try again.", status_code=status
        )
    except Exception as exc:
        log.error("[ai/trade-replay] user=%s — unexpected error: %s", auth.user_id, exc)
        return PlainTextResponse("Unexpected error. Please try again.", status_code=500)
