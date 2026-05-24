"""Supabase Realtime Channel Broadcast — pushes ticker snapshots via WebSocket."""

import asyncio
import logging
import threading

import config
from services import ticker_cache

log = logging.getLogger(__name__)

_CHANNEL = "tickers"
_EVENT = "ticker_update"
_INTERVAL = 1.0
_RECONNECT_DELAY = 5.0

_started = False
_lock = threading.Lock()


async def _run() -> None:
    from supabase import create_async_client

    while True:
        try:
            supabase = await create_async_client(
                config.SUPABASE_URL,
                config.SUPABASE_SERVICE_ROLE_KEY,
            )
            channel = supabase.channel(_CHANNEL)
            await channel.subscribe()

            last_ts = 0.0
            while True:
                await asyncio.sleep(_INTERVAL)
                ts, rows = ticker_cache.snapshot()
                if ts > last_ts and rows:
                    await channel.send_broadcast(_EVENT, {"tickers": rows})
                    last_ts = ts

        except Exception as exc:
            log.warning("Channel error: %s — reconnecting in %.0fs", exc, _RECONNECT_DELAY)
            await asyncio.sleep(_RECONNECT_DELAY)


def _thread_main() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_run())


def start() -> None:
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_thread_main, daemon=True, name="supabase-realtime").start()
