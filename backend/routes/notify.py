"""Notification routes — /api/notify/*"""

import logging
import threading
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse

from middleware.auth import UserContext, require_auth
from services import ai_service, email_service

log = logging.getLogger(__name__)
router = APIRouter()


def _process_loss(trade: dict[str, Any], context: dict[str, Any], user_id: str) -> None:
    """Background thread: generate AI analysis → send email."""
    try:
        analysis = ai_service.call_gemini_raw(
            ai_service.build_trade_loss_prompt(trade, context),
            max_tokens=800,
        )
        email_service.send_loss_alert(trade, analysis)
    except Exception as exc:
        log.error("[notify/loss-job] user=%s fill=%s — failed: %s", user_id, trade.get("id"), exc)


@router.post("/api/notify/trade-loss")
def route_trade_loss(
    auth: UserContext = Depends(require_auth),
    body: Optional[dict[str, Any]] = Body(default=None),
):
    payload = body or {}
    trade = payload.get("trade", {})
    context = payload.get("context", {})

    try:
        pnl = float(trade.get("pnl", 0))
    except (TypeError, ValueError):
        pnl = 0.0
    if not trade or pnl >= 0:
        log.warning(
            "[notify/trade-loss] user=%s — rejected non-loss payload (pnl=%.4f)",
            auth.user_id,
            pnl,
        )
        return JSONResponse(content={"ok": False, "error": "Not a losing trade"}, status_code=400)

    fill_id = str(trade.get("id", ""))
    if email_service.is_notified(fill_id):
        return {"ok": True, "skipped": True}

    threading.Thread(
        target=_process_loss,
        args=(trade, context, auth.user_id),
        daemon=True,
        name=f"loss-notify-{fill_id or 'unknown'}",
    ).start()

    return JSONResponse(content={"ok": True}, status_code=202)
