"""Prompt builder for the post-loss trade coaching analysis."""

from typing import Any

from utils import signed, to_float


def _hold_duration(entry_time: str, exit_time: str) -> str:
    """Return a human-readable hold duration, or '?' if times are unavailable/identical."""
    try:
        from datetime import datetime, timezone
        et = datetime.fromisoformat(entry_time.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        xt = datetime.fromisoformat(exit_time.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        secs = int((xt - et).total_seconds())
        if secs <= 0:
            return "?"
        if secs < 60:
            return f"{secs}s"
        if secs < 3600:
            return f"{secs // 60}m"
        return f"{secs // 3600}h {(secs % 3600) // 60}m"
    except Exception:
        return "?"


def build_trade_loss_prompt(trade: dict[str, Any], context: dict[str, Any]) -> str:
    symbol      = trade.get("symbol", "Unknown")
    direction   = str(trade.get("direction", "")).upper()
    pnl         = to_float(trade.get("pnl"))
    entry_price = trade.get("entry_price", "?")
    exit_price  = trade.get("exit_price", "?")
    qty         = trade.get("quantity", "?")
    entry_time  = str(trade.get("entry_time", ""))
    exit_time   = str(trade.get("exit_time", ""))
    hold_dur    = _hold_duration(entry_time, exit_time)

    win_rate  = to_float(context.get("winRate"))
    total_pnl = to_float(context.get("totalPnl"))
    drawdown  = to_float(context.get("maxDrawdown"))

    recent_losses = context.get("recentSymbolLosses", [])
    loss_count    = len(recent_losses)
    loss_rows = "\n".join(
        f"  {l.get('entry_time', '')[:16]} | "
        f"{str(l.get('direction', '')).upper()} | "
        f"size: {l.get('quantity', '?')} | "
        f"{to_float(l.get('pnl')):+.4f} USDT"
        for l in recent_losses[:5]
    ) or "  No recent loss data"

    exit_line = (
        f"- Exit:      {exit_price}\n- Hold Time: {hold_dur}\n"
        if exit_price != "?" and exit_price != entry_price else ""
    )

    return f"""You are a trading coach reviewing a losing trade for a Delta Exchange India futures trader.
Only reference data explicitly shown below. Do not invent statistics or assume market conditions.

## The Losing Trade
- Symbol:    {symbol}
- Direction: {direction}
- Entry:     {entry_price}
{exit_line}- Size:      {qty}
- PnL:       {signed(pnl)} USDT

## Trader Context
- Overall Win Rate:  {win_rate:.1f}%
- Total PnL:         {signed(total_pnl)} USDT
- Max Drawdown:      {drawdown:.2f}%

## Recent Losses on {symbol} ({loss_count} shown)
{loss_rows}

---

Write a tight 3-section analysis. Total response must be under 150 words. \
Be direct and constructive — do not repeat the trade data back, analyze it.

**What Went Wrong** — What does the entry price, size, and outcome suggest about the decision? \
Was this likely a setup failure, sizing error, or poor timing?

**Pattern Check** — Do the {loss_count} recent {symbol} losses above show a directional bias, \
size escalation, or clustering at certain times? Name the pattern if one exists, or state clearly \
that no pattern is visible.

**Immediate Action** — One specific, concrete rule the trader should apply before their next \
{symbol} trade. Make it measurable."""
