"""Notification routes — /api/notify/*"""

import logging
import threading
from typing import Any

from flask import Blueprint, Response, g, jsonify, request

from middleware.auth import require_auth
from services import ai_service, email_service

log = logging.getLogger(__name__)
bp = Blueprint("notify", __name__)


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


@bp.post("/api/notify/trade-loss")
@require_auth
def route_trade_loss() -> Response:
    body    = request.get_json(silent=True) or {}
    trade   = body.get("trade", {})
    context = body.get("context", {})

    try:
        pnl = float(trade.get("pnl", 0))
    except (TypeError, ValueError):
        pnl = 0.0
    if not trade or pnl >= 0:
        log.warning("[notify/trade-loss] user=%s — rejected non-loss payload (pnl=%.4f)", g.user_id, pnl)
        return jsonify({"ok": False, "error": "Not a losing trade"}), 400

    fill_id = str(trade.get("id", ""))
    if email_service.is_notified(fill_id):
        return jsonify({"ok": True, "skipped": True})

    threading.Thread(
        target=_process_loss,
        args=(trade, context, g.user_id),
        daemon=True,
        name=f"loss-notify-{fill_id or 'unknown'}",
    ).start()

    return jsonify({"ok": True}), 202
