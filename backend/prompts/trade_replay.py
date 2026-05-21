"""Prompt builder for the trade replay coaching session."""

from typing import Any

from utils import signed, to_float
from services.prompt_store import get_template


def build_trade_replay_prompt(trade: dict[str, Any], context: dict[str, Any]) -> str:
    symbol    = trade.get("symbol", "Unknown")
    direction = str(trade.get("direction", "")).upper()
    pnl       = to_float(trade.get("pnl"))
    pnl_pct   = to_float(trade.get("pnl_percent"))
    price     = trade.get("entry_price", "?")
    qty       = trade.get("quantity", "?")
    entry_t   = str(trade.get("entry_time", ""))[:16]
    outcome   = "WIN" if pnl >= 0 else "LOSS"

    quality      = context.get("quality", {})
    score        = quality.get("score", "?")
    grade        = quality.get("grade", "?")
    factors      = quality.get("factors", [])
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

    ctx = {
        "symbol":       symbol,
        "direction":    direction,
        "price":        price,
        "entry_t":      entry_t,
        "qty":          qty,
        "pnl":          signed(pnl),
        "pnl_pct":      f"{pnl_pct:+.2f}",
        "outcome":      outcome,
        "score":        score,
        "grade":        grade,
        "factor_lines": factor_lines,
        "recent_rows":  recent_rows,
    }

    return get_template("trade_replay").substitute(ctx)
