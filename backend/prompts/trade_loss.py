"""Prompt builder for the post-loss trade coaching analysis."""

from typing import Any

from utils import signed, to_float
from services.prompt_store import get_template


def _hold_duration(entry_time: str, exit_time: str) -> str:
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

    exit_block = (
        f"- Exit:      {exit_price}\n- Hold Time: {hold_dur}\n"
        if exit_price != "?" and exit_price != entry_price else ""
    )

    recent_losses = context.get("recentSymbolLosses", [])
    loss_count    = len(recent_losses)
    loss_rows = "\n".join(
        f"  {l.get('entry_time', '')[:16]} | "
        f"{str(l.get('direction', '')).upper()} | "
        f"size: {l.get('quantity', '?')} | "
        f"{to_float(l.get('pnl')):+.4f} USDT"
        for l in recent_losses[:5]
    ) or "  No recent loss data"

    ctx = {
        "symbol":     symbol,
        "direction":  direction,
        "entry_price": entry_price,
        "exit_block": exit_block,
        "qty":        qty,
        "pnl":        signed(pnl),
        "win_rate":   f"{to_float(context.get('winRate')):.1f}",
        "total_pnl":  signed(to_float(context.get("totalPnl"))),
        "drawdown":   f"{to_float(context.get('maxDrawdown')):.2f}",
        "loss_count": loss_count,
        "loss_rows":  loss_rows,
    }

    return get_template("trade_loss").substitute(ctx)
