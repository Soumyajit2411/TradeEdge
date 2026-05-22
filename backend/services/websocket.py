"""Delta Exchange WebSocket listener — streams v2/ticker updates into the ticker cache."""

import hashlib
import hmac
import json
import logging
import threading
import time
from typing import Any

import websocket

import config
from services import ticker_cache

log = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


# ── Internal helpers ──────────────────────────────────────────────────────────


def _signature() -> tuple[str, str]:
    ts = str(int(time.time()))
    sig = hmac.new(
        config.DELTA_API_SECRET.encode(),
        f"GET{ts}/live".encode(),
        hashlib.sha256,
    ).hexdigest()
    return ts, sig


def _extract_candidates(payload: Any) -> list[dict[str, Any]]:
    """Recursively walk a WS message to find ticker-shaped dicts."""
    out: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        if payload.get("symbol") or payload.get("product_symbol"):
            out.append(payload)
        for key in ("data", "result", "payload", "tickers", "items", "updates"):
            out.extend(_extract_candidates(payload.get(key)))
    elif isinstance(payload, list):
        for item in payload:
            out.extend(_extract_candidates(item))
    return out


# ── WS runner ─────────────────────────────────────────────────────────────────


def _run() -> None:
    def _subscribe(ws: websocket.WebSocketApp) -> None:
        ws.send(
            json.dumps(
                {
                    "type": "subscribe",
                    "payload": {"channels": [{"name": "v2/ticker", "symbols": ["all"]}]},
                }
            )
        )

    def on_open(ws: websocket.WebSocketApp) -> None:
        if config.DELTA_API_KEY and config.DELTA_API_SECRET:
            ts, sig = _signature()
            ws.send(
                json.dumps(
                    {
                        "type": "key-auth",
                        "payload": {
                            "api-key": config.DELTA_API_KEY,
                            "signature": sig,
                            "timestamp": ts,
                        },
                    }
                )
            )
        else:
            _subscribe(ws)

    def on_message(ws: websocket.WebSocketApp, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except Exception:
            return

        if str(msg.get("type")) == "key-auth":
            if msg.get("success"):
                _subscribe(ws)
            return

        rows = [r for r in (ticker_cache.normalize(c) for c in _extract_candidates(msg)) if r]
        if rows:
            ticker_cache.update(rows)

    def on_error(_ws: websocket.WebSocketApp, err: Any) -> None:
        log.warning("Delta WS error: %s", err)

    def on_close(_ws: websocket.WebSocketApp, code: Any, msg: Any) -> None:
        log.info("Delta WS closed: %s %s", code, msg)

    ws = websocket.WebSocketApp(
        config.DELTA_WS_URL,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    ws.run_forever(ping_interval=20, ping_timeout=10, reconnect=5)


# ── Public API ────────────────────────────────────────────────────────────────


def ensure_started() -> None:
    """Start the WS listener daemon thread exactly once (thread-safe)."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_run, daemon=True, name="delta-ws").start()
    log.info("Delta WebSocket listener started")
