# TradeEdge

**AI-powered trading journal for Delta Exchange India.**  
Sync your fills, analyze psychological biases, replay every trade with Gemini coaching, and get a live market feed — all in one place.

---

## Features

- **Live Fills** — Auto-syncs all trades from Delta Exchange India via HMAC-signed REST, cached in Redis
- **Portfolio Analytics** — Win rate, profit factor, Sharpe ratio, max drawdown, streaks, commission drain
- **Psychological Bias Detection** — Algorithmically flags revenge trading, FOMO, hesitation, emotional exits, and inconsistent execution across every coin you trade
- **AI Copilot** — Real-time behavioral warnings, daily guard, session intelligence, weekly discipline scores, P&L goals
- **AI Deep Report** — Gemini 2.5 Flash generates a 7-section narrative analysis of your entire trading history
- **Trade Replay** — Select any trade for an AI coach walkthrough: decision quality, emotional context, one key takeaway
- **Live Markets** — Realtime WebSocket feed from Delta Exchange with SSE streaming to the browser, sortable by any column
- **Market News** — Headlines ranked by estimated market impact, with Delta-listed coins flagged per article
- **Daily Email Digest** — Scheduled morning briefing with top movers and Gemini market analysis

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Python 3.9, Flask, Gunicorn |
| Auth | Supabase (email/password, JWT) |
| Database | Supabase Postgres (user credentials, profiles) |
| Cache | Upstash Redis (TLS) |
| AI | Google Gemini 2.5 Flash |
| Realtime | Delta Exchange WebSocket → SSE |
| Email | Resend API |
| Frontend deploy | Vercel |
| Backend deploy | Render |

---

## API Reference

All private endpoints require `Authorization: Bearer <supabase_jwt>`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check, starts WebSocket daemon |
| `GET` | `/api/delta/fills` | Yes | Paginated fills for the authenticated user |
| `GET` | `/api/delta/tickers` | No | Snapshot of all live Delta Exchange tickers |
| `GET` | `/api/delta/tickers/stream` | No | SSE stream of live ticker updates |
| `POST` | `/api/ai/analyze` | Yes | Full portfolio AI analysis (Gemini, streamed) |
| `POST` | `/api/ai/trade-replay` | Yes | Single-trade AI coach replay (Gemini, streamed) |
| `POST` | `/api/notify/trade-loss` | Yes | Trigger async loss alert email |
| `GET` | `/api/news/tomorrow-impact` | Yes | Impact-ranked market news with coin tagging |
| `GET` | `/api/users/credentials/status` | Yes | Check if user has saved Delta API keys |
| `POST` | `/api/users/credentials` | Yes | Save Delta API key + secret |
| `DELETE` | `/api/users/credentials` | Yes | Remove saved credentials |

