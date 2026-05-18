"""Background scheduler — sends the daily market digest at the configured time."""

import logging
import threading
import time
from datetime import datetime, timezone

import config

log = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()


def _parse_hhmm(s: str) -> tuple[int, int]:
    h, m = s.strip().split(":")
    return int(h), int(m)


def _run_loop() -> None:
    target_h, target_m = _parse_hhmm(config.DAILY_EMAIL_TIME)
    log.info("Daily digest scheduler armed — fires at %02d:%02d (local server time)", target_h, target_m)

    sent_on: set[str] = set()

    while True:
        now      = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")

        if now.hour == target_h and now.minute == target_m and date_key not in sent_on:
            try:
                _send_digest(date_key)
                sent_on.add(date_key)
            except Exception:
                log.exception("Daily digest job failed")

        # Prune old entries — keep only today's key to avoid unbounded growth.
        sent_on &= {date_key}

        time.sleep(30)  # Resolution: 30 seconds


def _send_digest(date_key: str) -> None:
    """Fetch market data → build AI analysis → send email."""
    from services import ticker_cache, email_service
    from services.ai_service import build_daily_digest_prompt, call_gemini_raw

    rows = ticker_cache.get_sorted()

    if not rows:
        # Fallback to live REST fetch if WS cache is empty.
        from services.delta_fills import fetch_live_tickers
        rows = fetch_live_tickers()

    # Pick top 5 gainers and losers with non-zero price.
    priced = [r for r in rows if r.get("mark_price", 0) > 0]
    sorted_by_change = sorted(priced, key=lambda r: r.get("change_24h", 0), reverse=True)

    def _row(r: dict) -> dict:
        return {
            "symbol":       r["symbol"],
            "change":       float(r.get("change_24h", 0)),
            "price":        float(r.get("mark_price", 0)),
            "turnover_usd": float(r.get("turnover_24h", 0)),
        }

    gainers = [_row(r) for r in sorted_by_change[:5]]
    losers  = [_row(r) for r in sorted_by_change[-5:][::-1]]

    fetched_at = datetime.now(timezone.utc).strftime("%H:%M")
    prompt     = build_daily_digest_prompt(gainers, losers, date_key, fetched_at=fetched_at)
    analysis   = call_gemini_raw(prompt, caller="daily_digest")

    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    email_service.send_daily_digest(date_str, analysis, gainers, losers)


def start() -> None:
    """Start the scheduler daemon thread exactly once."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_run_loop, daemon=True, name="email-scheduler").start()
    log.info("Email scheduler started")
