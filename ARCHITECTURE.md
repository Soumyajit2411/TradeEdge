# Architecture

## Overview

TradeEdge is a trading journal and analytics platform for Delta Exchange India. Users connect their Delta Exchange API credentials, and the platform surfaces trade history, live market data, AI-generated insights, and email alerts.

The system has three runtime environments:

| Environment | Entrypoint | Responsibility |
|---|---|---|
| **Vercel** | Next.js (`frontend/`) | UI, auth, Supabase Realtime subscription |
| **Google Cloud Run** | `cloudrun_app.py` | Stateless REST APIs |
| **Oracle VPS** | `app.py` | WebSocket listener, Supabase broadcast, email scheduler |

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Next.js (Vercel)                                     │
│   - Supabase Auth (JWT)                                         │
│   - REST calls → Cloud Run (NEXT_PUBLIC_CLOUDRUN_URL)           │
│   - Realtime tickers → Supabase channel subscription            │
└────────────────┬─────────────────────────┬──────────────────────┘
                 │ HTTPS                    │ Supabase Realtime WS
                 ▼                          ▼
┌───────────────────────┐     ┌─────────────────────────────────┐
│  Cloud Run            │     │  Supabase                       │
│  cloudrun_app.py      │     │  - Auth (JWT)                   │
│  gunicorn + gevent    │     │  - user_credentials table       │
│  2 workers / 512 Mi   │     │  - ai_prompts table             │
│                       │     │  - Realtime channel "tickers"   │
│  REST routes:         │     └──────────────┬──────────────────┘
│  /api/delta/*         │                    │ broadcast
│  /api/ai/*            │                    │
│  /api/news/*          │     ┌──────────────▼──────────────────┐
│  /api/notify/*        │     │  Oracle VPS (Docker)            │
│  /api/users/*         │     │  app.py · gunicorn + gevent     │
│                       │     │  1 worker                       │
│       ▲               │     │                                 │
│       │ Redis          │     │  ┌─────────────────────────┐  │
│       │               │     │  │ Delta WS listener        │  │
└───────┼───────────────┘     │  │ (websocket.py)           │  │
        │                     │  └────────────┬────────────┘  │
┌───────▼───────────┐         │               │               │
│  Redis (Upstash   │         │  ┌────────────▼────────────┐  │
│  or self-hosted)  │         │  │ ticker_cache            │  │
│                   │         │  │ (in-memory, thread-safe)│  │
│  - auth token     │         │  └────────────┬────────────┘  │
│  - user creds     │         │               │               │
│  - fills cache    │         │  ┌────────────▼────────────┐  │
│  - candle cache   │         │  │ supabase_realtime.py    │  │
│  - ticker cache   │         │  │ broadcasts every 1s     │  │
│  - rate limits    │         │  └─────────────────────────┘  │
│  - prompt cache   │         │                               │
│  - news cache     │         │  ┌─────────────────────────┐  │
│  - notified fills │         │  │ scheduler.py            │  │
└───────────────────┘         │  │ daily digest email      │  │
                              │  └─────────────────────────┘  │
                              └─────────────────────────────────┘
                                           │
                              ┌────────────▼────────────────────┐
                              │  Delta Exchange India           │
                              │  - REST API (fills, candles,    │
                              │    tickers, credentials check)  │
                              │  - WebSocket (v2/ticker)        │
                              └─────────────────────────────────┘
```

---

## Backend

### Entry Points

**`app.py`** — Oracle VPS only. Uses FastAPI's `lifespan` context manager to start three background daemons, then exposes a `/health` endpoint.

```
lifespan → scheduler.start()          → email-scheduler thread
         → websocket.ensure_started() → delta-ws thread
         → supabase_realtime.start()  → supabase-realtime thread
```

**`cloudrun_app.py`** — Cloud Run only. Pure FastAPI app; registers all REST routers. No background threads. Includes a custom `HTTPException` handler that preserves the `{"error": "..."}` response format expected by the frontend.

### Routes (Cloud Run)

| Router | Prefix | Endpoints |
|---|---|---|
| `routes/delta.py` | `/api/delta` | `GET /fills`, `GET /candles/{symbol}`, `GET /tickers` |
| `routes/ai.py` | `/api/ai` | `POST /analyze`, `POST /trade-replay` |
| `routes/news.py` | `/api/news` | `GET /tomorrow-impact` |
| `routes/notify.py` | `/api/notify` | `POST /trade-loss` |
| `routes/users.py` | `/api/users` | `GET /credentials/status`, `POST /credentials`, `DELETE /credentials` |

All endpoints except `GET /tickers` and `GET /candles/{symbol}` require a valid Supabase Bearer token (`Depends(require_auth)`).

### Services

| Module | Role |
|---|---|
| `services/delta_fills.py` | Delta REST client — paginated fills fetch, incremental PnL calculation, candle fetch, live ticker snapshot |
| `services/ai_service.py` | Gemini API wrapper — `call_gemini_raw` (standard), `call_gemini_with_search` (Google Search grounding), `call_gemini` (full analysis prompt) |
| `services/supabase_client.py` | JWT verification, `user_credentials` CRUD, generic `get_rows` helper |
| `services/supabase_realtime.py` | Async loop that reads `ticker_cache` every 1s and broadcasts to Supabase channel `"tickers"` |
| `services/websocket.py` | Delta Exchange WebSocket listener (v2/ticker, all symbols); HMAC auth + auto-reconnect; feeds `ticker_cache` |
| `services/ticker_cache.py` | Thread-safe in-memory dict keyed by symbol; shared between WS listener and HTTP routes |
| `services/redis_cache.py` | Optional Redis wrapper (get/set/delete); fails gracefully — returns `None`/`False` when Redis is down, retries after `REDIS_RETRY_AFTER_SECS` |
| `services/email_service.py` | Resend-backed email delivery — loss trade alert and daily morning digest; deduplicates via Redis key `notified:fill:<id>` |
| `services/scheduler.py` | Background thread that runs the daily digest job at `DAILY_EMAIL_TIME` (UTC) |
| `services/prompt_store.py` | Fetches prompt templates from Supabase `ai_prompts` table (keyed by `key`, filtered by `is_active=true`, versioned); cached in Redis for 5 min |

### Middleware

**`middleware/auth.py`** — `require_auth` FastAPI dependency (used via `Depends(require_auth)`):
1. Reads `Authorization: Bearer <token>` via `HTTPBearer(auto_error=False)`.
2. SHA-256-hashes the token and checks Redis (`auth:token:<hash>`, TTL 60s) for `user_id`.
3. On cache miss, calls `supabase_client.verify_token` → caches result.
4. Checks Redis (`auth:creds:<user_id>`, TTL 300s) for Delta credentials.
5. On cache miss, calls `supabase_client.get_user_credentials` → caches result.
6. Returns a `UserContext(user_id, api_key, api_secret)` injected into route handlers.

**`middleware/rate_limit.py`** — `check(user_id, max_calls, window_secs)`:
- Redis-backed sliding-window using a sorted set (`ratelimit:<user_id>:<max>:<window>`).
- Falls back to an in-memory dict when Redis is unavailable.
- Used in `routes/ai.py`: `/analyze` → 5 req/60s, `/trade-replay` → 10 req/60s.

### Prompts Package

`prompts/` exports five builder functions:

| Function | Used by |
|---|---|
| `build_prompt(payload)` | `/api/ai/analyze` |
| `build_trade_replay_prompt(trade, context)` | `/api/ai/trade-replay` |
| `build_trade_loss_prompt(trade, context)` | `/api/notify/trade-loss` |
| `build_market_news_prompt(coins, date_key)` | `/api/news/tomorrow-impact` |
| `build_daily_digest_prompt(gainers, losers, date_key, fetched_at)` | `scheduler._send_digest` |

Each builder fetches its template from the Supabase `ai_prompts` table via `prompt_store.get_template(key)`, substitutes variables, and returns a rendered string.

### Configuration (`config.py`)

All configuration is read from environment variables via `_env()` / `_env_first()` (strips whitespace and accidental quotes). Key groups:

| Group | Variables |
|---|---|
| Delta Exchange | `DELTA_EXCHANGE_BASE_URL`, `DELTA_EXCHANGE_API_KEY`, `DELTA_EXCHANGE_API_SECRET`, `DELTA_WEBSOCKET_URL`, `DELTA_LOOKBACK_DAYS` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Redis | `REDIS_URL`, `REDIS_RETRY_AFTER_SECS` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO`, `DAILY_EMAIL_TIME` |
| Server | `PORT`, `CORS_ALLOW_ORIGIN` |
| News | `NEWS_CACHE_TTL`, `NEWS_CACHE_KEY`, `NEWS_MAX_ITEMS` |

`config.validate()` logs warnings for missing required vars and an insecure wildcard CORS origin.

### Dockerfiles

| File | Target | Server |
|---|---|---|
| `Dockerfile` | Oracle VPS | `gunicorn app:app --worker-class uvicorn.workers.UvicornWorker --workers 1 --timeout 60` |
| `Dockerfile.cloudrun` | Cloud Run | `gunicorn cloudrun_app:app --worker-class uvicorn.workers.UvicornWorker --workers 2 --timeout 120` |

Both use `python:3.12-slim`. Cloud Run image exposes `${PORT:-8080}`.

---

## Frontend

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase JS (`@supabase/ssr`).

**Backend stack:** FastAPI + Uvicorn workers (via Gunicorn), Python 3.12.

### Pages

| Route | File | Description |
|---|---|---|
| `/` | `app/page.tsx` | Landing page |
| `/login` | `app/login/page.tsx` | Supabase email/password sign-in |
| `/signup` | `app/signup/page.tsx` | New account registration |
| `/onboarding` | `app/onboarding/page.tsx` | Delta API credential entry |
| `/dashboard` | `app/dashboard/page.tsx` | Main trading journal — five tabs |
| `/markets` | `app/markets/page.tsx` | Live market feed (all Delta contracts) |

### Dashboard Tabs

| Tab key | Component | Data source |
|---|---|---|
| `overview` | StatsCards, EquityDrawdownChart, TimeAnalysis, TradeTable | `/api/delta/fills` (polled) |
| `coins` | CoinGrid | fills + Supabase Realtime tickers |
| `ai` | AiInsights | fills + `/api/ai/analyze` |
| `copilot` | Copilot | fills + `/api/ai/trade-replay` |
| `news` | MarketNews | `/api/news/tomorrow-impact` |

### API Client (`lib/api.ts`)

All HTTP calls go to Cloud Run via `NEXT_PUBLIC_CLOUDRUN_URL`:

- `fetchJson(path)` — unauthenticated JSON GET/POST.
- `authFetch(path, options)` — attaches `Authorization: Bearer <supabase_access_token>`.
- `authFetchJson(path, options)` — `authFetch` + JSON parsing + error unwrapping.

Session expiry (`refresh_token_not_found`) triggers `signOut()` and a redirect to `/login`.

### Real-time Tickers

Both `/dashboard` and `/markets` subscribe to the Supabase channel `"tickers"` and listen for `ticker_update` broadcast events. The Oracle VPS pushes a full ticker snapshot every second via `supabase_realtime.py`. `/markets` also seeds its initial state with a REST snapshot from `/api/delta/tickers` on mount.

### Supabase Client (`lib/supabase.ts`)

Singleton browser client created with `@supabase/ssr`. An `onAuthStateChange` listener redirects to `/login` on `SIGNED_OUT` (except on auth pages).

### Analytics Libraries (`lib/`)

| Module | Purpose |
|---|---|
| `stats.ts` | Extended trade stats, drawdown series, symbol/hour/day breakdowns, bias detection |
| `bias-analysis.ts` | Global bias report (overtrading, revenge trading, time-of-day bias, etc.) |
| `bias-colors.ts` | Color helpers for bias severity |
| `copilot-analysis.ts` | Per-trade context builder for the Copilot prompt |
| `fmt.ts` | Number and date formatters |
| `user-service.ts` | `getCredentialsStatus()` — checks whether Delta credentials are saved |

---

## Data Flows

### Live Ticker Pipeline

```
Delta Exchange WS (wss://socket.india.delta.exchange)
  → websocket.py (Oracle VPS, delta-ws thread)
  → ticker_cache.update()          [in-memory, ~1s latency]
  → supabase_realtime.py           [reads snapshot every 1s]
  → Supabase channel "tickers"     [broadcast]
  → Browser Supabase subscription  [setLiveTickers / setRows]
```

### Trade Fill Pipeline

```
Browser poll (every FILL_POLL_INTERVAL_MS)
  → authFetchJson('/api/delta/fills')
  → Cloud Run: routes/delta.py
    → Redis cache check (fills:<user_id>, TTL 30s)
    → delta_fills.fetch_all()      [Delta REST API, paginated]
    → delta_fills.process()        [incremental PnL per product]
  → Dashboard state (trades[])
  → notifyLoss() for new losses    → POST /api/notify/trade-loss
```

### Loss Notification Flow

```
notifyLoss() (browser, on new loss fill)
  → POST /api/notify/trade-loss    [Cloud Run]
  → email_service.is_notified()   [Redis dedup]
  → threading.Thread(_process_loss)
    → ai_service.call_gemini_raw(build_trade_loss_prompt)
    → email_service.send_loss_alert()  [Resend]
```

### Daily Digest Flow

```
scheduler._run_loop() (Oracle VPS, checks every 30s)
  → at DAILY_EMAIL_TIME UTC:
    → ticker_cache.get_sorted()    [top gainers/losers]
    → ai_service.call_gemini_raw(build_daily_digest_prompt)
    → email_service.send_daily_digest()  [Resend]
```

### AI News Flow

```
GET /api/news/tomorrow-impact      [Cloud Run]
  → Redis cache check (NEWS_CACHE_KEY, TTL NEWS_CACHE_TTL = 1800s)
  → ticker_cache / delta REST      [top 40 coins by turnover]
  → build_market_news_prompt()
  → ai_service.call_gemini_with_search()  [Gemini + Google Search grounding]
  → JSON parsing + validation
  → Redis cache set
```

---

## CI/CD (`.github/workflows/deploy.yml`)

Triggered on push to `master`. Two parallel jobs:

**`deploy-cloudrun`**
1. Authenticate to GCP via service account key.
2. Build `backend/Dockerfile.cloudrun` → push to Artifact Registry.
3. `gcloud run deploy tradiary-api` with env vars injected from GitHub secrets.

**`deploy-oracle`**
1. SSH into Oracle VPS via `appleboy/ssh-action`.
2. `git pull origin master && docker compose up -d --build` in `~/tradiary/backend`.

---

## Key Design Decisions

**Split backend**: Long-running stateful services (WebSocket listener, Supabase broadcast loop, cron scheduler) live on an always-on Oracle VPS. Stateless REST APIs run on Cloud Run and scale to zero between requests.

**Redis as an optional layer**: `redis_cache.py` fails gracefully — a missing or unavailable Redis does not break any route; it just disables caching, rate limiting falls back to in-memory, and email dedup falls back to a process-level set.

**Auth caching**: Two-tier Redis cache (token hash → user_id at 60s TTL, user_id → Delta credentials at 300s TTL) reduces Supabase round-trips on hot paths. `invalidate_creds()` is called explicitly after credential save/delete.

**Prompt versioning in Supabase**: Prompt templates are stored in the `ai_prompts` table (columns: `key`, `template`, `version`, `is_active`) rather than hardcoded in Python. The prompt_store fetches the latest active version per key and caches it in Redis for 5 minutes, allowing prompt iteration without a redeploy.

**Incremental PnL**: Delta fills report cumulative `realized_pnl` per position. `delta_fills.process()` computes incremental PnL by differencing consecutive fills for the same `product_id`, resetting to zero when position size reaches zero.

**Supabase Realtime as a push bus**: Rather than polling the backend for live prices, the frontend subscribes to a Supabase channel. The Oracle VPS is the sole publisher, broadcasting a full ticker snapshot each second. This avoids polling the Cloud Run REST endpoint at high frequency and keeps live data delivery decoupled from the stateless API tier.
