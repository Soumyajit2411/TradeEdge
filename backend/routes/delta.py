"""Delta Exchange routes — /api/delta/*"""

import json
import logging
import time

from flask import Blueprint, Response, g, jsonify, request, stream_with_context

from middleware.auth import require_auth
from services import delta_fills, redis_cache, ticker_cache, websocket
from utils import to_float

log = logging.getLogger(__name__)
bp = Blueprint("delta", __name__)


@bp.get("/api/delta/fills")
@require_auth
def route_fills() -> Response:
    if not g.api_key or not g.api_secret:
        log.warning("[fills] user=%s — no Delta credentials configured", g.user_id)
        return (
            jsonify(
                {"error": "Delta API credentials not configured. Please add them in Settings."}
            ),
            503,
        )

    cache_key = f"fills:{g.user_id}"
    cached = redis_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    try:
        fills = delta_fills.fetch_all(api_key=g.api_key, api_secret=g.api_secret)
        trades = delta_fills.process(fills)
        redis_cache.set(cache_key, trades, ttl=30)
        return jsonify(trades)
    except Exception as exc:
        log.error("[fills] user=%s — fetch failed: %s", g.user_id, exc)
        return jsonify({"error": "Failed to fetch fills from Delta Exchange"}), 500


@bp.get("/api/delta/candles/<symbol>")
def route_candles(symbol: str) -> Response:
    resolution = request.args.get("resolution", "1h")
    end = int(time.time())
    lookbacks = {"1m": 14400, "5m": 86400, "15m": 259200, "1h": 604800, "1d": 7776000}
    if resolution not in lookbacks:
        resolution = "1h"
    start = end - lookbacks[resolution]

    cache_key = f"candles:{symbol}:{resolution}"
    cached = redis_cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    try:
        result = delta_fills.fetch_candles(symbol, resolution, start, end)
        ttl = 60 if resolution in ("1m", "5m") else 300
        redis_cache.set(cache_key, result, ttl=ttl)
        return jsonify(result)
    except Exception as exc:
        log.error("[candles] symbol=%s resolution=%s — failed: %s", symbol, resolution, exc)
        return jsonify({"error": "Failed to fetch candles"}), 500


@bp.get("/api/delta/tickers")
def route_tickers() -> Response:
    try:
        cached = redis_cache.get("tickers")
        if cached:
            return jsonify(cached)

        websocket.ensure_started()
        rows = ticker_cache.get_sorted()
        if not rows:
            rows = delta_fills.fetch_live_tickers()

        redis_cache.set("tickers", rows, ttl=5)
        return jsonify(rows)
    except Exception as exc:
        log.error("[tickers] fetch failed: %s", exc)
        return jsonify({"error": "Failed to load market data"}), 500


@bp.get("/api/delta/tickers/stream")
def route_tickers_stream() -> Response:
    websocket.ensure_started()

    def event_stream():
        last_seen = 0.0
        while True:
            ts, rows = ticker_cache.snapshot()
            rows.sort(key=lambda r: to_float(r.get("turnover_24h")), reverse=True)

            if ts > last_seen and rows:
                yield f"data: {json.dumps(rows, separators=(',', ':'))}\n\n"
                last_seen = ts
            else:
                yield ": keepalive\n\n"
            time.sleep(1)

    return Response(
        stream_with_context(event_stream()),
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
