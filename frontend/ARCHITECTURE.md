# Frontend Architecture

## Overview

Next.js 14 App Router application for TradeEdge — an AI-powered trading journal for Delta Exchange India. Communicates with the Flask backend at `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:5001`).

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Supabase (`@supabase/ssr`) |
| Charts | Recharts |
| Icons | lucide-react |
| Date formatting | date-fns |

---

## Directory Structure

```
frontend/
├── app/                        # Next.js App Router pages (each folder = route)
│   ├── layout.tsx              # Root layout: fonts, metadata, globals.css
│   ├── globals.css             # Tailwind base + global resets
│   ├── page.tsx                # / — Public landing page
│   ├── login/page.tsx          # /login — Email + password sign-in
│   ├── signup/page.tsx         # /signup — New account creation
│   ├── onboarding/page.tsx     # /onboarding — Delta API key setup (protected)
│   ├── dashboard/page.tsx      # /dashboard — Main app shell (protected)
│   └── markets/page.tsx        # /markets — Public live markets feed
│
├── components/
│   ├── layout/
│   │   └── Footer.tsx          # Shared copyright footer
│   ├── dashboard/
│   │   ├── AiInsights.tsx      # AI Insights tab: bias analysis + Gemini report
│   │   ├── CoinGrid.tsx        # Coins tab: per-symbol drill-down
│   │   ├── Copilot.tsx         # Copilot tab: risk / session / discipline / goals / replay
│   │   ├── EquityDrawdownChart.tsx  # Equity curve + drawdown chart
│   │   ├── MarketNews.tsx      # Market News tab: impact-ranked headlines
│   │   ├── StatsCards.tsx      # Overview stats, bias alerts, streak badge
│   │   └── TimeAnalysis.tsx    # Hour + day of week P&L heatmaps
│   └── trades/
│       ├── AddTradeForm.tsx     # Manual trade entry form (UI present, button disabled)
│       └── TradeTable.tsx       # Sortable trade history table
│
├── lib/
│   ├── api.ts                  # backendUrl(), authFetch(), friendlyApiError()
│   ├── supabase.ts             # createClient() — browser Supabase client
│   ├── stats.ts                # Pure functions: calcExtendedStats, calcDrawdown, etc.
│   ├── bias-analysis.ts        # Psychological bias detection from trade history
│   └── copilot-analysis.ts     # Risk profile, session profile, discipline scores, trade quality
│
├── types/index.ts              # Shared TypeScript interfaces (Trade, LiveTicker, etc.)
├── middleware.ts               # Route protection + auth redirects
└── next.config.ts              # Next.js config (devIndicators: false)
```

---

## Routing & Auth

### Public routes
- `/` — Landing page (pricing, features, CTA)
- `/login` — Sign in
- `/signup` — Register
- `/markets` — Live ticker feed (no auth required)

### Protected routes (redirect to `/login` if no session)
- `/dashboard` — Main app
- `/onboarding` — API key setup

### Auth redirect rules (enforced in `middleware.ts`)
```
No session + visits /dashboard or /onboarding  →  redirect /login
Has session + visits /login or /signup          →  redirect /onboarding
```

`middleware.ts` uses `@supabase/ssr` `createServerClient` to read the session from cookies on every request. It runs on all routes except static assets.

---

## Dashboard Architecture

`app/dashboard/page.tsx` is the main shell. It owns all shared state and passes data down as props.

### State owned by the shell

| State | Source | Update frequency |
|---|---|---|
| `trades` | `GET /api/delta/fills` | Every 30s + on mount |
| `liveTickers` | `GET /api/delta/tickers` + SSE stream | Every 30s (snapshot) + realtime (stream) |
| `hasCredentials` | `GET /api/users/credentials/status` | Once on mount |
| `userEmail` | Supabase `auth.getUser()` | Once on mount |

### Tab components and their data needs

```
Tab           Component           Props received from shell
──────────────────────────────────────────────────────────
Overview      StatsCards          stats
              EquityDrawdownChart drawdownData
              TimeAnalysis        hourStats, dayStats
              TradeTable          trades (last 50)

Coins         CoinGrid            symbolStats, trades, liveTickers, liveLoading, liveError

AI Insights   AiInsights          stats, symbolStats, hourStats, trades

Copilot       Copilot             trades, stats

Market News   MarketNews          (fetches independently on mount)
```

### Live data strategy
Two parallel data sources for tickers, both always active:
1. **SSE stream** (`/api/delta/tickers/stream`) — primary, updates on every WebSocket frame from Delta (~1s)
2. **Polling** (`/api/delta/tickers` every 30s) — fallback for initial load and stream recovery

The stream sets `liveError` on disconnect; the snapshot poll continues silently.

---

## API Communication (`lib/api.ts`)

### `backendUrl(path)`
Prepends `NEXT_PUBLIC_BACKEND_URL` to a path. Falls back to `http://localhost:5001`.

### `authFetch(path, options?)`
Wrapper around `fetch` that:
1. Reads the current Supabase session token
2. Attaches `Authorization: Bearer <token>` header
3. Throws `'Service down. Please start backend service.'` on network failure (instead of a raw fetch error)

Used for all private API calls. Public endpoints (`/api/delta/tickers`, `/health`) use plain `fetch`.

### `friendlyApiError(error, fallback)`
Converts network errors into a human-readable message. Detects `failed to fetch` / `load failed` / `networkerror` and returns `'Service down. Please start backend service.'`.

---

## Analytics Libraries (`lib/`)

### `stats.ts`
Pure stateless functions that take `Trade[]` and return computed results. No side effects.

| Function | Output |
|---|---|
| `calcExtendedStats` | Win rate, PnL, drawdown, Sharpe, streaks, commission |
| `calcDrawdown` | `DrawdownPoint[]` for equity curve chart |
| `calcSymbolStats` | Per-coin breakdown |
| `calcHourStats` / `calcDayStats` | Time-of-day heatmap data |
| `groupByDate` | Daily PnL for chart |
| `detectBiases` | Simple emotion-tag based bias strings |

All use `reduce` (not `Math.max(...array)`) to avoid stack overflow on large datasets.

### `bias-analysis.ts`
Algorithmic psychological bias detection. Analyzes trade timing, sizing, and sequences to produce:
- `GlobalBiasReport` — aggregate health score + per-bias breakdown across all coins
- `SymbolBiasReport` — per-coin health score + bias instances with timestamps

Bias types: `revenge_trading`, `fomo`, `hesitation`, `emotional_exit`, `inconsistent_execution`

### `copilot-analysis.ts`
Real-time behavioral intelligence:
- `computeWarnings` — generates active alerts (consecutive losses, overtrading, size escalation, concentration, daily drawdown limit, weak trading hour)
- `computeRiskProfile` — daily/weekly P&L, concentration, streak counts
- `computeSessionProfile` — today's performance + best/worst hours from history
- `computeWeeklyDiscipline` — weekly discipline scores (0–100) with breakdown tags
- `scoreTradeQuality` — grades a single trade (A–F) based on timing, sizing, prior context

---

## AI Insights Tab (`AiInsights.tsx`)

Sections rendered client-side (no API call):
- **Psychological health ring** — overall health score from `analyzeAllBiases`
- **Bias bars** — per-bias severity for all coins
- **30-Day P&L Calendar** — color-coded heatmap of last 30 days
- **Per-coin bias detail** — tabbed drill-down per symbol
- **Commission Impact** — gross vs net P&L, fee % of gross, monthly estimate
- **Best Setups** — top coin+direction+hour combos by win rate (≥5 samples)

Triggered by user (API call):
- **Gemini Deep Report** — streams response from `POST /api/ai/analyze`

---

## Copilot Tab (`Copilot.tsx`)

Five sub-tabs:

| Tab | What it shows |
|---|---|
| Risk | Daily Guard (trade count vs avg + progress bar), concentration, daily/weekly P&L |
| Session | Today's stats, best/worst hour, hourly P&L heatmap |
| Discipline | Weekly discipline scores, trend line chart |
| Goals | Daily + weekly P&L targets (stored in `localStorage`), progress bars, hit-rate history |
| Trade Replay | Select any trade → AI explains decision quality, context, one takeaway |

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable key |
| `NEXT_PUBLIC_BACKEND_URL` | No | Backend base URL, defaults to `http://localhost:5001` |
