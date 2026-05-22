# Backend Architecture

## Overview

Flask application serving the TradeEdge API. Handles Delta Exchange data fetching, AI analysis via Gemini, market news, user credential management, and real-time ticker streaming via WebSocket. Runs on port `5001`.

## Stack

| Layer | Technology |
|---|---|
| Web framework | Flask + Flask-CORS |
| Auth | Supabase JWT verification (REST, no SDK) |
| Cache | Upstash Redis (TLS) — gracefully degrades if unavailable |
| AI | Google Gemini 2.5 Flash via REST API |
| Email | Resend API |
| Realtime data | Delta Exchange WebSocket (`wss://socket.india.delta.exchange`) |
| Scheduler | Python `threading` daemon thread |

---

## Directory Structure

```
backend/
├── app.py                  # Application factory, blueprint registration, CORS, /health
├── config.py               # All env vars in one place, loaded from .env via dotenv
├── utils.py                # Shared helpers: to_float(), signed()
│
├── middleware/
│   ├── __init__.py
│   └── auth.py             # @require_auth decorator
│
├── routes/
│   ├── __init__.py
│   ├── ai.py               # POST /api/ai/analyze, POST /api/ai/trade-replay
│   ├── delta.py            # GET /api/delta/fills, /tickers, /tickers/stream
│   ├── news.py             # GET /api/news/tomorrow-impact
│   ├── notify.py           # POST /api/notify/trade-loss
│   └── users.py            # GET/POST/DELETE /api/users/credentials(/status)
│
└── services/
    ├── __init__.py
    ├── ai_service.py       # Gemini prompt builders + call_gemini_raw()
    ├── delta_fills.py      # Delta Exchange REST client: fills + live tickers
    ├── email_service.py    # Resend wrappers: loss alerts + daily digest
    ├── redis_cache.py      # Optional Redis wrapper (get/set/delete)
    ├── scheduler.py        # Daily digest daemon thread
    ├── supabase_client.py  # Supabase REST client: auth + user_credentials table
    ├── ticker_cache.py     # In-memory snapshot of live tickers (written by WebSocket)
    └── websocket.py        # Delta Exchange WebSocket listener (daemon thread)
```

---

## Request Lifecycle

```
Browser / Frontend
      │
      ▼
Flask (app.py)
      │
      ├── CORS headers added by Flask-CORS (covers /api/* and /health)
      │
      ├── @require_auth decorator (middleware/auth.py)
      │     ├── Extracts Bearer token from Authorization header
      │     ├── Calls Supabase /auth/v1/user to verify token
      │     ├── Loads user's Delta API credentials from user_credentials table
      │     │   (falls back to env DELTA_API_KEY / DELTA_API_SECRET if not set)
      │     └── Sets g.user_id, g.api_key, g.api_secret on Flask request context
      │
      └── Route handler
            ├── Reads g.* for per-user context
            ├── Checks Redis cache first (where applicable)
            └── Returns JSON response
```

---

## Key Services

### `services/websocket.py`
Maintains a single persistent WebSocket connection to Delta Exchange. Runs as a daemon thread started on first `/health` request. Writes received ticker snapshots into `ticker_cache`. Restarts automatically on disconnect.

### `services/ticker_cache.py`
Thread-safe in-memory store. Holds the latest `{symbol → ticker}` dict and a monotonic timestamp. The SSE stream endpoint in `delta.py` polls this every second and emits only when the timestamp changes.

### `services/redis_cache.py`
Thin wrapper around `redis-py`. Sets `_unavailable = True` on first connection failure — all subsequent calls are silent no-ops. TTLs: `tickers` = 5 s, `fills:{user_id}` = 30 s.

### `services/supabase_client.py`
Direct HTTP calls to Supabase REST API (no `supabase-py` — Python 3.9 compatibility). Uses the **service role key** to bypass RLS when reading/writing `user_credentials`. Uses the **anon key** only for token verification at `/auth/v1/user`. Detects placeholder keys via `_service_key_valid()` to prevent accidental startup with unconfigured env.

### `services/ai_service.py`
Builds structured text prompts from trade data and calls the Gemini REST endpoint. Three prompt types:
- `build_prompt()` — full portfolio analysis (7 sections, used by `/api/ai/analyze`)
- `build_trade_replay_prompt()` — single-trade coach replay (used by `/api/ai/trade-replay`)
- `build_trade_loss_prompt()` — loss alert email body (used by notify route)
- `build_daily_digest_prompt()` — morning market briefing (used by scheduler)

### `services/scheduler.py`
Daemon thread that fires once daily at the configured `DAILY_EMAIL_TIME`. Fetches live tickers, picks top 5 gainers/losers, calls Gemini for a morning briefing, and sends via `email_service.send_daily_digest()`.

---

## Authentication Flow

```
1. User logs in via Supabase (frontend) → receives JWT access token
2. Frontend attaches token:  Authorization: Bearer <token>
3. @require_auth calls:      GET {SUPABASE_URL}/auth/v1/user
                             Header: Authorization: Bearer <token>
4. On 200 → extracts user.id → sets g.user_id
5. Fetches credentials:      GET {SUPABASE_URL}/rest/v1/user_credentials
                             Header: apikey: <service_role_key>
                             Filter: user_id=eq.<user_id>
6. g.api_key / g.api_secret populated (or env fallback)
```

---

## Data Flow: Fills

```
GET /api/delta/fills
      │
      ├── Redis hit? → return cached JSON
      │
      └── Redis miss
            ├── delta_fills.fetch_all(api_key, api_secret)
            │     └── HMAC-signed GET /v2/fills (paginated, up to DELTA_LOOKBACK days)
            ├── delta_fills.process(fills) → list[Trade]
            ├── redis_cache.set("fills:{user_id}", trades, ttl=30)
            └── return JSON
```

---

## Data Flow: Live Tickers

```
WebSocket thread  ──writes──▶  ticker_cache (in-memory)
                                     │
                              ┌──────┴──────────────────┐
                              ▼                          ▼
              GET /api/delta/tickers          GET /api/delta/tickers/stream
              (snapshot, 5s Redis TTL)        (SSE — polls cache every 1s,
                                               emits only on new timestamp)
```

---

## Logging Convention

All logs are failure-only:
- `log.warning` for 4xx / expected failures (bad credentials, missing payload)
- `log.error` for 5xx / unexpected exceptions

No API keys, tokens, secrets, or request bodies containing credentials are ever logged.
