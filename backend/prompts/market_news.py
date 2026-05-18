"""Prompt builder for Gemini Search-grounded market news intelligence."""


def build_market_news_prompt(coins: list[dict], date: str) -> str:
    """
    coins: list of {"asset": "BTC", "symbol": "BTCUSD"} dicts (top coins by turnover)
    date:  today's date string YYYY-MM-DD (UTC)
    """
    coin_names    = ", ".join(c["asset"] for c in coins)
    coin_reference = "\n".join(f"  {c['asset']} → {c['symbol']}" for c in coins)

    return f"""Today is {date} UTC. You are a crypto market intelligence API.

Use Google Search to find the most impactful news from the last 24 hours for traders of \
these Delta Exchange India perpetual futures: {coin_names}

YOUR ENTIRE RESPONSE MUST BE A SINGLE JSON ARRAY AND NOTHING ELSE.
Do not write any text before or after the array. Do not use markdown or code fences.
Start your response with [ and end it with ]

Up to 15 items, sorted by impact_score desc:

[{{"title":"headline","url":"https://article-url","source":"Publisher","published_at":"2025-01-15T08:00:00Z","impact_score":75,"impact_reason":"one sentence why this matters to futures traders","market_tags":["crypto"],"impacted_coins":[{{"asset":"BTC","symbol":"BTCUSD"}}]}}]

Scoring:
71-100 = major mover (rate decisions, hacks, bans, >10% moves, large ETF flows)
45-70  = notable (macro data, protocol upgrades, funding anomalies, new listings)
5-44   = minor context

market_tags: pick from [macro, crypto, rates, inflation, equities, regulation, risk, liquidation, funding]
impacted_coins: only from this list — {coin_reference.replace(chr(10), ', ')}
url: ORIGINAL publisher URL only (e.g. https://coindesk.com/...). NEVER use vertexaisearch.cloud.google.com or any redirect URL. Use "" if original URL is unknown.
published_at: ISO-8601 UTC

OUTPUT ONLY THE JSON ARRAY. NO OTHER TEXT."""
