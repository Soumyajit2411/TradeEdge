"""Delta Exchange REST client — fills fetching, processing, and live tickers."""

import time
from typing import Any, Optional

from delta_rest_client import DeltaRestClient

import config
from services import ticker_cache
from utils import to_float


def _client(api_key: Optional[str] = None, api_secret: Optional[str] = None) -> DeltaRestClient:
    return DeltaRestClient(
        base_url=config.DELTA_BASE_URL,
        api_key=api_key or config.DELTA_API_KEY,
        api_secret=api_secret or config.DELTA_API_SECRET,
    )


# ── Fills ─────────────────────────────────────────────────────────────────────


def fetch_all(
    lookback_days: int = config.DELTA_LOOKBACK,
    max_pages: int = 20,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Fetch all fills for the configured lookback window, paginating as needed."""
    start_time = int(time.time()) - lookback_days * 86_400
    client = _client(api_key, api_secret)
    fills: list[dict[str, Any]] = []
    after: Optional[str] = None

    for _ in range(max_pages):
        data = client.fills(query={"start_time": start_time}, page_size=100, after=after)
        if not isinstance(data, dict):
            raise RuntimeError("Delta fills API: unexpected response shape")
        if data.get("success") is False:
            raise RuntimeError("Delta fills API: success=false")

        page = data.get("result", [])
        meta = data.get("meta", {})
        fills.extend(page)

        if not meta.get("after") or len(page) < 100:
            break
        after = str(meta["after"])

    return list(reversed(fills))


def _map_fill(fill: dict[str, Any], incremental_pnl: float) -> dict[str, Any]:
    price = to_float(fill.get("price"))
    size = to_float(fill.get("size"))
    notional = to_float(fill.get("notional"))

    meta_data = fill.get("meta_data") or {}
    product = fill.get("product") or {}
    s_asset = product.get("settling_asset") or {}

    order_type = str(meta_data.get("order_type") or fill.get("fill_type") or "").replace("_", " ")
    currency = fill.get("settling_asset_symbol") or s_asset.get("symbol") or "USD"
    pnl_pct = (incremental_pnl / notional * 100) if notional > 0 else 0.0

    return {
        "id": fill.get("id"),
        "user_id": "delta",
        "symbol": fill.get("product_symbol"),
        "direction": "long" if fill.get("side") == "buy" else "short",
        "entry_price": price,
        "exit_price": price,
        "quantity": size,
        "entry_time": fill.get("created_at"),
        "exit_time": fill.get("created_at"),
        "pnl": round(incremental_pnl, 4),
        "pnl_percent": round(pnl_pct, 2),
        "setup": "other",
        "emotion": "confident",
        "notes": f"{order_type} · {fill.get('role')} · {currency}",
        "tags": [],
        "created_at": fill.get("created_at"),
        "commission": to_float(fill.get("commission")),
    }


def process(fills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert raw fills to trade records with incremental realized PnL per product."""
    last_pnl: dict[int, float] = {}
    trades = []

    for fill in fills:
        pid = int(fill.get("product_id") or 0)
        meta = fill.get("meta_data") or {}
        new_pos = meta.get("new_position") or {}
        raw_pnl = new_pos.get("realized_pnl")
        new_sz = new_pos.get("size")

        incremental = 0.0
        if raw_pnl is not None:
            curr = to_float(raw_pnl)
            incremental = round(curr - last_pnl.get(pid, 0.0), 4)
            last_pnl[pid] = 0.0 if to_float(new_sz) == 0 else curr

        trades.append(_map_fill(fill, incremental))

    return trades


# ── Candles ───────────────────────────────────────────────────────────────────


def fetch_candles(symbol: str, resolution: str, start: int, end: int) -> list[dict[str, Any]]:
    raw = _client().get_candles(symbol=symbol, resolution=resolution, start=start, end=end)
    candles = raw if isinstance(raw, list) else (raw.get("result") if isinstance(raw, dict) else [])
    return [
        {
            "time": c.get("time") or c.get("t"),
            "open": float(c.get("open") or c.get("o") or 0),
            "high": float(c.get("high") or c.get("h") or 0),
            "low": float(c.get("low") or c.get("l") or 0),
            "close": float(c.get("close") or c.get("c") or 0),
            "volume": float(c.get("volume") or c.get("v") or 0),
        }
        for c in (candles or [])
        if c
    ]


# ── Live tickers ──────────────────────────────────────────────────────────────


def fetch_live_tickers() -> list[dict[str, Any]]:
    data = _client().get_tickers(auth=False)
    if not isinstance(data, list):
        raise RuntimeError("Delta tickers API: unexpected response shape")

    tickers = [r for r in (ticker_cache.normalize(item) for item in data) if r]
    ticker_cache.update(tickers)
    tickers.sort(key=lambda r: r["turnover_24h"], reverse=True)
    return tickers
