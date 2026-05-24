"""Delta Exchange routes — /api/delta/*"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query

from middleware.auth import UserContext, require_auth
from services import delta_fills, redis_cache

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/delta/fills")
def route_fills(auth: UserContext = Depends(require_auth)):
    if not auth.api_key or not auth.api_secret:
        log.warning("[fills] user=%s — no Delta credentials configured", auth.user_id)
        raise HTTPException(
            status_code=503,
            detail="Delta API credentials not configured. Please add them in Settings.",
        )

    cache_key = f"fills:{auth.user_id}"
    cached = redis_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        fills = delta_fills.fetch_all(api_key=auth.api_key, api_secret=auth.api_secret)
        trades = delta_fills.process(fills)
        redis_cache.set(cache_key, trades, ttl=30)
        return trades
    except Exception as exc:
        log.error("[fills] user=%s — fetch failed: %s", auth.user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch fills from Delta Exchange")


@router.get("/api/delta/candles/{symbol}")
def route_candles(symbol: str, resolution: str = Query(default="1h")):
    end = int(time.time())
    lookbacks = {"1m": 14400, "5m": 86400, "15m": 259200, "1h": 604800, "1d": 7776000}
    if resolution not in lookbacks:
        resolution = "1h"
    start = end - lookbacks[resolution]

    cache_key = f"candles:{symbol}:{resolution}"
    cached = redis_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        result = delta_fills.fetch_candles(symbol, resolution, start, end)
        ttl = 60 if resolution in ("1m", "5m") else 300
        redis_cache.set(cache_key, result, ttl=ttl)
        return result
    except Exception as exc:
        log.error("[candles] symbol=%s resolution=%s — failed: %s", symbol, resolution, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch candles")


@router.get("/api/delta/tickers")
def route_tickers():
    try:
        cached = redis_cache.get("tickers")
        if cached:
            return cached

        rows = delta_fills.fetch_live_tickers()
        redis_cache.set("tickers", rows, ttl=5)
        return rows
    except Exception as exc:
        log.error("[tickers] fetch failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load market data")
