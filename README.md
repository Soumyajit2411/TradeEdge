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

## Project Structure

```
tradiary/
├── frontend/          # Next.js 14 app
│   ├── app/           # Pages (App Router)
│   ├── components/    # UI components
│   ├── lib/           # API client, analytics, Supabase
│   └── types/         # Shared TypeScript types
│
├── backend/           # Flask API
│   ├── routes/        # API route blueprints
│   ├── services/      # Business logic (Delta, AI, Redis, Supabase, email)
│   ├── middleware/     # @require_auth decorator
│   └── app.py         # Application entry point
│
├── supabase/          # DB migrations
├── FLOW.md            # Detailed Mermaid flow diagrams
├── frontend/ARCHITECTURE.md
└── backend/ARCHITECTURE.md
```

---

## Local Development

### Prerequisites

- Python 3.9+
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Delta Exchange India](https://www.india.delta.exchange) account with a read-only API key
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
PORT=5001
DELTA_EXCHANGE_BASE_URL=https://api.india.delta.exchange
DELTA_LOOKBACK_DAYS=365
CORS_ALLOW_ORIGIN=http://localhost:3000

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

REDIS_URL=redis://localhost:6379   # or Upstash rediss:// URL

# Optional — email alerts
RESEND_API_KEY=your_resend_key
EMAIL_FROM=onboarding@resend.dev
EMAIL_TO=you@example.com
DAILY_EMAIL_TIME=03:45
```

```bash
python app.py
# → http://localhost:5001
```

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
```

```bash
npm run dev
# → http://localhost:3000
```

### 3. Database

Run the migration SQL in your Supabase dashboard → **SQL Editor**:

```
supabase/migrations/001_initial.sql
```

This creates the `profiles`, `user_credentials`, and `trade_notes` tables with RLS policies.

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

---

## Deployment

### Frontend → Vercel

1. Import the repo into Vercel
2. Set **Root Directory** to `frontend`
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_BACKEND_URL=https://your-render-app.onrender.com
   ```

### Backend → Render

1. Create a new **Python Web Service**
2. Set **Root Directory** to `backend`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `gunicorn app:app`
5. Add all environment variables from the `.env` template above

A `backend/render.yaml` blueprint is included for one-click deploy.

---

## Documentation

| File | Contents |
|---|---|
| `FLOW.md` | 10 Mermaid diagrams — auth sequence, data flows, component graph, WebSocket pipeline |
| `backend/ARCHITECTURE.md` | Backend service map, request lifecycle, env vars, logging convention |
| `frontend/ARCHITECTURE.md` | Page routing, component hierarchy, analytics libraries, API patterns |
