"""Prompt builder for the daily morning market digest email."""


def build_daily_digest_prompt(
    gainers: list,
    losers: list,
    date_key: str,
    fetched_at: str = "",
) -> str:
    def _fmt(items: list) -> str:
        rows = []
        for r in items:
            turnover = r.get("turnover_usd", 0)
            t_str = f"${turnover / 1_000_000:.1f}M" if turnover >= 1_000_000 else (
                f"${turnover / 1_000:.0f}K" if turnover > 0 else "N/A"
            )
            rows.append(
                f"  {r['symbol']:<22} {r['change']:+.2f}%  @ {r['price']:.4f}  vol: {t_str}"
            )
        return "\n".join(rows)

    snapshot_time = f" (data as of {fetched_at} UTC)" if fetched_at else ""

    return f"""You are a senior crypto derivatives analyst writing a morning briefing for a \
Delta Exchange India perpetual futures trader. Today is {date_key}{snapshot_time}.

IMPORTANT: For specific price moves and percentages, only reference the instruments listed below. \
Use your general knowledge only for broad macro context (rate policy, risk-on/off regimes) — \
do not cite specific recent news events or prices not shown in this data.

## Live Market Snapshot — Delta Exchange India Perpetual Futures{snapshot_time}
Ranked by 24h turnover (higher turnover = more liquid, more reliable signal).

Top 5 Gainers (24h):
{_fmt(gainers) or '  No data'}

Top 5 Losers (24h):
{_fmt(losers) or '  No data'}

---

Write a concise morning briefing in the 4 sections below. \
Keep each section to 2–3 sentences. Total under 300 words.

**Market Sentiment** (2–3 sentences) — Based solely on the movers above, is the market \
risk-on or risk-off? What does the spread between gainers and losers, and their turnover, suggest \
about conviction?

**Contracts to Watch** (2–3 sentences) — Name 2 specific perpetual contracts from the data above \
that have a directional setup potential today. State the direction and the reason from the data \
(momentum + volume, not general opinion).

**Key Risks Today** (2–3 sentences) — What structural futures-market risks are elevated right now: \
funding rate reversals, thin liquidity on losers, liquidation cascade potential? \
Use general derivatives knowledge, not fabricated news.

**Trader's Edge Today** (2 sentences) — One tactical suggestion for a Delta Exchange India \
leveraged futures trader given this morning's data: which side of the book looks more dangerous \
and why."""
