"""Thread-safe in-memory ticker cache shared between the WebSocket listener and HTTP routes."""

import threading
import time
from typing import Any, Optional

from utils import to_float

_cache: dict[str, dict[str, Any]] = {}
_cache_ts = 0.0
_lock = threading.Lock()


def normalize(item: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Normalise a raw ticker dict from REST or WebSocket into a consistent shape."""
    symbol = str(item.get("symbol") or item.get("product_symbol") or "").strip()
    if not symbol:
        return None

    mark = to_float(item.get("mark_price"), to_float(item.get("close")))
    spot = to_float(item.get("spot_price"))
    open_ = to_float(item.get("open"))
    close = to_float(item.get("close"), mark) or mark

    change = ((close - open_) / open_) * 100 if open_ > 0 else to_float(item.get("change_24h"))

    return {
        "symbol": symbol,
        "mark_price": round(mark, 8),
        "spot_price": round(spot, 8),
        "open": round(open_, 8),
        "close": round(close, 8),
        "change_24h": round(change, 4),
        "volume_24h": to_float(item.get("volume_24h"), to_float(item.get("volume"))),
        "turnover_24h": to_float(item.get("turnover_24h"), to_float(item.get("turnover"))),
        "contract_type": item.get("contract_type"),
        "underlying_asset_symbol": item.get("underlying_asset_symbol"),
        "quote_asset_symbol": item.get("quote_asset_symbol") or item.get("quoting_asset_symbol"),
    }


def update(entries: list[dict[str, Any]]) -> None:
    global _cache_ts
    with _lock:
        for e in entries:
            sym = str(e.get("symbol") or "").strip()
            if sym:
                _cache[sym] = e
        _cache_ts = time.time()


def get_sorted() -> list[dict[str, Any]]:
    with _lock:
        rows = list(_cache.values())
    rows.sort(key=lambda r: to_float(r.get("turnover_24h")), reverse=True)
    return rows


def snapshot() -> tuple[float, list[dict[str, Any]]]:
    """Return (updated_at_timestamp, rows) atomically."""
    with _lock:
        return _cache_ts, list(_cache.values())
