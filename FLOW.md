# TradeEdge — Complete System Flow

> All diagrams use [Mermaid](https://mermaid.js.org/) syntax. Rendered automatically on GitHub, GitLab, Notion, and most markdown viewers.

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Browser["🖥 Browser (Next.js 14)"]
        LP[Landing Page<br/>/]
        LG[Login / Signup<br/>/login  /signup]
        OB[Onboarding<br/>/onboarding]
        DB[Dashboard<br/>/dashboard]
        MK[Markets<br/>/markets]
        MW[middleware.ts<br/>Route Guard]
    end

    subgraph Backend["⚙ Flask Backend :5001"]
        direction TB
        HLTH["/health"]
        subgraph Routes
            R_FILLS["/api/delta/fills"]
            R_TICK["/api/delta/tickers"]
            R_STREAM["/api/delta/tickers/stream SSE"]
            R_AI["/api/ai/analyze<br/>/api/ai/trade-replay"]
            R_NEWS["/api/news/tomorrow-impact"]
            R_NOTIFY["/api/notify/trade-loss"]
            R_USERS["/api/users/credentials"]
        end
        AUTH["@require_auth<br/>middleware"]
        REDIS[(Redis Cache<br/>Upstash TLS)]
        TCACHE[ticker_cache<br/>in-memory]
        SCHED[Scheduler<br/>daemon thread]
    end

    subgraph External["☁ External Services"]
        SUPA[(Supabase<br/>Auth + DB)]
        DELTA_REST[Delta Exchange<br/>REST API]
        DELTA_WS[Delta Exchange<br/>WebSocket]
        GEMINI[Google Gemini<br/>2.5 Flash]
        GNEWS[Google News<br/>RSS Feed]
        RESEND[Resend<br/>Email API]
    end

    MW -->|"no session → redirect"| LG
    LG -->|"signInWithPassword"| SUPA
    LG -->|"/health check"| HLTH
    OB -->|"POST /api/users/credentials"| R_USERS
    DB -->|"authFetch (Bearer JWT)"| R_FILLS
    DB -->|"fetch (public)"| R_TICK
    DB -->|"EventSource"| R_STREAM
    DB -->|"authFetch"| R_AI
    DB -->|"authFetch"| R_NEWS
    MK -->|"fetch (public)"| R_TICK
    MK -->|"EventSource"| R_STREAM

    R_FILLS --> AUTH
    R_AI --> AUTH
    R_NEWS --> AUTH
    R_NOTIFY --> AUTH
    R_USERS --> AUTH
    AUTH -->|"verify JWT"| SUPA
    AUTH -->|"fetch credentials"| SUPA

    R_FILLS -->|"cache hit/miss"| REDIS
    R_FILLS -->|"cache miss"| DELTA_REST
    R_TICK -->|"cache hit/miss"| REDIS
    R_TICK -->|"cache miss"| TCACHE

    DELTA_WS -->|"live frames"| TCACHE
    TCACHE -->|"1s poll"| R_STREAM

    R_AI -->|"prompt + call"| GEMINI
    R_NEWS -->|"RSS fetch"| GNEWS
    R_NOTIFY -->|"prompt"| GEMINI
    R_NOTIFY -->|"send email"| RESEND
    SCHED -->|"daily"| GEMINI
    SCHED -->|"daily"| RESEND
    R_USERS -->|"read/write"| SUPA
```

---

## 2. Authentication & Login Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend<br/>(login/page.tsx)
    participant MW as middleware.ts
    participant SUPA as Supabase Auth
    participant BE as Flask Backend
    participant DB as Supabase DB<br/>(user_credentials)

    User->>FE: Enter email + password → Submit

    FE->>SUPA: signInWithPassword(email, password)
    alt Invalid credentials
        SUPA-->>FE: AuthError
        FE-->>User: Show inline error
    end
    SUPA-->>FE: session { access_token, user }

    FE->>BE: GET /health (no auth)
    alt Backend unreachable / non-200
        BE-->>FE: network error or status ≠ 200
        FE-->>User: "Servers are temporarily down. Please try again later."
    end
    BE-->>FE: { ok: true }

    FE->>BE: GET /api/users/credentials/status<br/>Authorization: Bearer <access_token>
    BE->>SUPA: GET /auth/v1/user (verify token)
    SUPA-->>BE: { id: user_id, ... }
    BE->>DB: GET user_credentials WHERE user_id = ?
    DB-->>BE: row or empty
    BE-->>FE: { has_credentials: true/false }

    alt No credentials saved
        FE->>FE: router.replace('/onboarding')
    else Credentials exist
        FE->>FE: router.replace('/dashboard')
    end

    Note over MW: Every subsequent navigation
    MW->>SUPA: getUser() from cookie
    alt No session
        MW->>FE: redirect → /login
    end
```

---

## 3. Per-Request Auth Middleware (Backend)

```mermaid
flowchart TD
    REQ[Incoming Request] --> HDR{Authorization<br/>header present?}
    HDR -- No --> E401A[401 Authorization header required]
    HDR -- Yes --> EXT[Extract Bearer token]
    EXT --> VFY[GET /auth/v1/user<br/>Supabase]
    VFY -- "4xx / network fail" --> E401B[401 Invalid or expired token]
    VFY -- 200 --> UID[Set g.user_id]
    UID --> CRED[GET user_credentials<br/>service role key]
    CRED -- row found --> SET1[g.api_key = row.api_key<br/>g.api_secret = row.api_secret]
    CRED -- not found --> SET2[g.api_key = env DELTA_API_KEY<br/>g.api_secret = env DELTA_API_SECRET]
    SET1 --> ROUTE[Route Handler]
    SET2 --> ROUTE
```

---

## 4. Fills Data Flow

```mermaid
flowchart LR
    FE[Dashboard\nfetchFills\nevery 30s]

    FE -->|"GET /api/delta/fills\nBearer JWT"| AUTH[@require_auth]
    AUTH --> CREDS{g.api_key\nset?}
    CREDS -- No --> E503[503 No credentials]
    CREDS -- Yes --> REDIS{Redis\nfills:user_id\nhit?}
    REDIS -- Hit --> CACHED[Return cached JSON]
    REDIS -- Miss --> DELTA[delta_fills.fetch_all\nHMAC-signed pagination\nLast 365 days]
    DELTA -->|"GET /v2/fills\n(paginated)"| DEXCH[(Delta Exchange\nREST API)]
    DEXCH --> PROC[delta_fills.process\nnormalise → Trade]
    PROC --> SAVE[redis_cache.set\nTTL 30s]
    SAVE --> RESP[Return JSON\nlist of Trade]
    CACHED --> FE
    RESP --> FE

    FE -->|"setState\ntrades"| UI[Dashboard\nUI re-render]
```

---

## 5. Realtime Ticker Flow

```mermaid
flowchart TD
    subgraph DaemonThread["WebSocket Daemon Thread (started on /health)"]
        WS[Delta Exchange\nWebSocket\nwss://socket.india.delta.exchange]
        WS -->|"subscribe: v2/ticker\nlive frames ~1s"| HANDLER[ws_message_handler]
        HANDLER -->|"parse + write"| TC[ticker_cache\nin-memory dict\nthread-safe lock]
    end

    subgraph SnapshotEndpoint["GET /api/delta/tickers"]
        SNAP_R[Redis hit?]
        SNAP_R -- Hit --> SNAP_RET[Return cached]
        SNAP_R -- Miss --> TC2[ticker_cache.get_sorted]
        TC2 -- empty --> FALLBACK[fetch_live_tickers\nREST fallback]
        TC2 -- has rows --> SNAP_SAVE[redis_cache.set TTL 5s]
        SNAP_SAVE --> SNAP_RET
    end

    subgraph SSEEndpoint["GET /api/delta/tickers/stream (SSE)"]
        LOOP[Poll loop\nevery 1s]
        LOOP -->|"ticker_cache.snapshot()\ncompare timestamp"| CHANGED{New data?}
        CHANGED -- Yes --> EMIT["data: JSON array\n\n"]
        CHANGED -- No --> KA[": keepalive\n\n"]
        EMIT --> LOOP
        KA --> LOOP
    end

    subgraph Frontend["Dashboard (page.tsx)"]
        ESRC[EventSource\nSSE client]
        POLL[setInterval 30s\nfetch snapshot]
        STATE[liveTickers state]
    end

    TC -->|"1s"| LOOP
    EMIT -->|"stream"| ESRC
    ESRC --> STATE
    SNAP_RET --> POLL
    POLL --> STATE
    STATE -->|props| CG[CoinGrid]
    STATE -->|props| MK[Markets Page]
```

---

## 6. AI Analysis Flow

```mermaid
sequenceDiagram
    participant User
    participant AI as AiInsights.tsx
    participant BE as Flask /api/ai/analyze
    participant GEM as Google Gemini API

    User->>AI: Click "Generate Report"

    Note over AI: Assembles payload:<br/>stats + symbolStats + hourStats<br/>+ recentTrades (200) + biasReport

    AI->>BE: POST /api/ai/analyze<br/>Authorization: Bearer JWT<br/>Body: { stats, symbolStats, ... }

    BE->>BE: build_prompt(payload)<br/>7-section structured prompt<br/>~2000 tokens input

    BE->>GEM: POST /generateContent<br/>temperature: 0.3<br/>maxOutputTokens: 3000
    GEM-->>BE: { candidates: [ { content: { parts: [...] } } ] }

    BE-->>AI: 200 text/plain stream<br/>(full response, not chunked by Gemini)

    loop Read stream chunks
        AI->>AI: reader.read() → decode → setAnalysis(acc)
        AI->>User: Render partial markdown in real-time
    end

    Note over AI: MarkdownSection splits on "## "<br/>renders as headed bullet sections
```

---

## 7. Trade Replay Flow (Copilot)

```mermaid
flowchart TD
    USER[User clicks a trade\nin the Replay list]
    USER --> QS[scoreTradeQuality\nclient-side\nA–F grade]
    QS --> DISP[Display quality card\nimmediately]

    USER --> CALL["POST /api/ai/trade-replay\n{ trade, context }"]
    CALL --> AUTH[@require_auth]
    AUTH --> PROMPT[build_trade_replay_prompt\n3 sections, max 250 words]
    PROMPT --> GEM[Gemini API\nmaxTokens: 900]
    GEM --> STREAM[Stream response\nback to browser]
    STREAM --> RENDER[Render line-by-line\nin analysis panel]

    subgraph Context sent to Gemini
        C1[Trade details: symbol, dir, price, size, PnL]
        C2[Quality score + factor breakdown]
        C3[5 trades prior to this one]
        C4[Overall account stats: WR, drawdown, avgWin]
    end
```

---

## 8. Market News Flow

```mermaid
flowchart TD
    FE[MarketNews.tsx\nonMount fetch]
    FE -->|"GET /api/news/tomorrow-impact\nBearer JWT"| BE

    subgraph BE["Flask /api/news/tomorrow-impact"]
        Q1["Query 1: Fed CPI inflation\nbond yield Nasdaq crypto"]
        Q2["Query 2: Bitcoin ETF\nregulation SEC macro"]
        Q3["Query 3: Oil OPEC\ngeopolitics risk equities"]

        Q1 & Q2 & Q3 -->|"sequential RSS fetch\ntimeout 12s each"| GRSS[Google News\nRSS Feed]
        GRSS --> DEDUP[De-duplicate by URL + title]
        DEDUP --> ENRICH[For each article]

        subgraph ENRICH["Enrich each article"]
            IMPACT[_impact_assessment\nkeyword scoring + recency bonus\nmax 100 pts]
            COINS[_match_impacted_coins\nmatch against COIN_KEYWORDS\nfilter to Delta-listed only]
        end

        ENRICH --> SORT[Sort by impact_score desc]
        SORT --> TOP25[Top 25 items]
    end

    TOP25 --> FE

    subgraph FE_RENDER["MarketNews.tsx renders"]
        CARD[News card per item]
        CARD --> BADGE[Impact score badge\nred ≥70 / amber ≥45 / green]
        CARD --> COINS_UI[Coin chips\nviolet badges — Delta-listed only]
        CARD --> TAGS[Market tags: rates / inflation / crypto ...]
    end
```

---

## 9. Frontend Component Data Flow (Dashboard)

```mermaid
flowchart TD
    PAGE[dashboard/page.tsx\nState owner]

    subgraph State["State fetched by shell"]
        T[trades: Trade\nfills every 30s]
        LT[liveTickers: LiveTicker\nSSE stream + 30s poll]
        HC[hasCredentials: bool\nonce on mount]
        UE[userEmail: string\nonce on mount]
    end

    PAGE --> OV[Overview Tab]
    PAGE --> CO[Coins Tab]
    PAGE --> AI[AI Insights Tab]
    PAGE --> CP[Copilot Tab]
    PAGE --> NW[Market News Tab]

    subgraph OV["Overview Tab"]
        SC[StatsCards\nstats]
        ED[EquityDrawdownChart\ndrawdownData]
        TA[TimeAnalysis\nhourStats + dayStats]
        TT[TradeTable\nlast 50 trades]
    end

    subgraph CO["Coins Tab"]
        CG[CoinGrid\nsymbolStats + trades\n+ liveTickers]
    end

    subgraph AI["AI Insights Tab"]
        BIAS[Bias bars + health ring\nclient-side from trades]
        CAL[30-Day P&L Calendar\nclient-side from trades]
        COM[Commission Impact\nclient-side from stats]
        BEST[Best Setups\nclient-side from trades]
        GEN[Generate Report button\n→ POST /api/ai/analyze]
    end

    subgraph CP["Copilot Tab"]
        WARN[Live Warnings\ncomputeWarnings]
        RISK[Risk Tab\nDailyGuard + concentration]
        SESS[Session Tab\nhourly heatmap]
        DISC[Discipline Tab\nweekly scores]
        GOALS[Goals Tab\nlocalStorage targets]
        REPLAY[Trade Replay\n→ POST /api/ai/trade-replay]
    end

    subgraph NW["Market News Tab"]
        NEWS[MarketNews\nfetches independently\nonce on mount]
    end

    T --> SC & ED & TA & TT
    T & LT --> CG
    T --> BIAS & CAL & COM & BEST
    T --> WARN & RISK & SESS & DISC & GOALS & REPLAY
```

---

## 10. Onboarding & Credential Storage Flow

```mermaid
sequenceDiagram
    actor User
    participant OB as Onboarding Page
    participant BE as Flask /api/users/credentials
    participant DELTA as Delta Exchange API
    participant SUPA as Supabase DB

    User->>OB: Enter API key + secret → Save

    OB->>BE: POST /api/users/credentials<br/>{ api_key, api_secret }

    BE->>DELTA: GET /v2/profile<br/>HMAC-signed with provided keys
    alt Keys invalid / wrong permissions
        DELTA-->>BE: 401 / error
        BE-->>OB: 400 { error: "Invalid API credentials..." }
        OB-->>User: Show error inline
    end
    DELTA-->>BE: 200 { result: { ... } }

    BE->>SUPA: UPSERT user_credentials<br/>{ user_id, api_key, api_secret }<br/>using service role key (bypasses RLS)
    SUPA-->>BE: 200/201

    BE->>BE: redis_cache.delete("fills:{user_id}")

    BE-->>OB: 200 { ok: true }
    OB->>OB: router.replace('/dashboard')

    Note over SUPA: user_credentials table<br/>RLS: users can only read their own row<br/>Service role key used by backend to write
```
