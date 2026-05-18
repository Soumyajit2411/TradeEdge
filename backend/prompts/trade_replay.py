"""Prompt builder for the trade replay coaching session."""

from typing import Any

from utils import signed, to_float

# Grade scale used by the quality scorer.
_GRADE_SCALE = "A=85–100 (excellent), B=70–84 (good), C=50–69 (average), D=30–49 (poor), F=0–29 (very poor)"


def build_trade_replay_prompt(trade: dict[str, Any], context: dict[str, Any]) -> str:
    symbol    = trade.get("symbol", "Unknown")
    direction = str(trade.get("direction", "")).upper()
    pnl       = to_float(trade.get("pnl"))
    pnl_pct   = to_float(trade.get("pnl_percent"))
    price     = trade.get("entry_price", "?")
    qty       = trade.get("quantity", "?")
    entry_t   = str(trade.get("entry_time", ""))[:16]
    outcome   = "WIN" if pnl >= 0 else "LOSS"

    quality   = context.get("quality", {})
    score     = quality.get("score", "?")
    grade     = quality.get("grade", "?")
    factors   = quality.get("factors", [])
    factor_lines = "\n".join(
        f"  {f.get('label','')}: {to_float(f.get('delta', 0)):+.0f} pts"
        for f in factors
    ) or "  No factor data"

    recent = context.get("recentTrades", [])
    recent_rows = "\n".join(
        f"  {str(r.get('entry_time',''))[:16]} | "
        f"{str(r.get('direction','')).upper()} {r.get('symbol','')} | "
        f"size: {r.get('quantity', '?')} | "
        f"{to_float(r.get('pnl')):+.4f} USDT"
        for r in recent[:5]
    ) or "  No recent trades"

    return f"""You are a professional trading coach replaying a completed trade with a \
Delta Exchange India futures trader. Assess the decision quality on its own merits, \
then read the emotional context from the prior trades.

Only reference data explicitly shown below. Do not invent market conditions or assume \
information not present.

## Trade Being Replayed
- Symbol:    {symbol}
- Direction: {direction}
- Entry:     {price}  ({entry_t} UTC)
- Size:      {qty}
- PnL:       {signed(pnl)} USDT ({pnl_pct:+.2f}%)
- Outcome:   {outcome}

## Trade Quality Score: {score}/100 (Grade {grade})
Grade scale: {_GRADE_SCALE}
Each factor below contributes positively or negatively to the 100-point score:
{factor_lines}

## 5 Trades Before This One
{recent_rows}

---

Write a focused replay in exactly 3 sections. Total response under 300 words. \
Be specific, coach-like, and honest.

**Decision Quality** — Was this a sound trade decision regardless of outcome? \
Reference the quality score, grade, and the 2–3 factor scores that had the most impact.

**Context Read** — Given the 5 prior trades above, assess the trader's mental state. \
Flag any revenge trading (short gap after a loss), overtrading (rapid sequence), \
or size escalation (increasing size after losses). Cite specific rows if a pattern exists.

**One Key Takeaway** — A single concrete lesson from this trade for the next time \
the trader sees a similar {symbol} setup. Make it actionable and specific to the score."""
