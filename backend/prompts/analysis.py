"""Prompt builder for the full trading performance analysis."""

from typing import Any

from utils import signed, to_float
from services.prompt_store import get_template


def _fmt_symbol_rows(symbol_stats: list[dict[str, Any]]) -> str:
    rows = []
    for s in symbol_stats[:8]:
        pnl = to_float(s.get("totalPnl"))
        avg = to_float(s.get("avgPnl"))
        pf  = s.get("profitFactor")
        pf_str = "∞" if pf in (None, float("inf")) else f"{to_float(pf):.2f}"
        rows.append(
            f"  {str(s.get('symbol', '')).ljust(16)} "
            f"PnL: {signed(pnl)} USDT | "
            f"WR: {to_float(s.get('winRate')):.1f}% | "
            f"Trades: {int(s.get('closedTrades') or 0)} | "
            f"PF: {pf_str} | "
            f"Avg: {signed(avg)}"
        )
    return "\n".join(rows) if rows else "  No symbol data"


def _fmt_hour_rows(hour_stats: list[dict[str, Any]]) -> tuple:
    active = sorted(
        [h for h in hour_stats if int(h.get("trades") or 0) > 0],
        key=lambda h: to_float(h.get("pnl")),
        reverse=True,
    )

    def _fmt(h: dict[str, Any]) -> str:
        pnl = to_float(h.get("pnl"))
        return f"{h.get('label')} ({signed(pnl, 2)}, {int(h.get('trades') or 0)} fills)"

    best  = ", ".join(_fmt(h) for h in active[:3])
    worst = ", ".join(_fmt(h) for h in reversed(active[-3:]))
    return best or "N/A", worst or "N/A"


def _fmt_trade_rows(trades: list[dict[str, Any]], *, best: bool) -> str:
    closed = sorted(
        [t for t in trades if to_float(t.get("pnl")) != 0],
        key=lambda t: to_float(t.get("pnl")),
        reverse=best,
    )
    rows = [
        f"  {str(t.get('entry_time', ''))[:16]} | "
        f"{t.get('symbol')} {str(t.get('direction', '')).upper()} "
        f"@ {t.get('entry_price')} | size: {t.get('quantity', '?')} | "
        f"PnL: {signed(to_float(t.get('pnl')))}"
        for t in closed[:5]
    ]
    return "\n".join(rows) if rows else "  No data"


def _fmt_bias_section(bias_report: dict[str, Any]) -> str:
    if not bias_report:
        return "  No bias data provided"

    lines = [f"Overall Psychological Health Score: {bias_report.get('overallHealthScore', '?')}/100", ""]

    for b in bias_report.get("biases", []):
        lines.append(
            f"  {b.get('label', b.get('type', ''))}: {b.get('count', 0)} instances "
            f"(severity: {b.get('severity', 'none')}, score: {b.get('score', 0)}/100)"
        )
        for inst in b.get("topInstances", [])[:3]:
            stars = "●" * int(inst.get("severity", 1)) + "○" * (3 - int(inst.get("severity", 1)))
            lines.append(f"    {stars} [{inst.get('symbol', '')}] {inst.get('reason', '')}")

    lines += ["", "Per-Symbol Psychological Health:"]
    for s in bias_report.get("symbolHealthScores", [])[:10]:
        counts_str = " | ".join(
            f"{k.replace('_', ' ')[:4]}: {v}"
            for k, v in s.get("biasCounts", {}).items() if v > 0
        )
        lines.append(
            f"  {str(s.get('symbol', '')).ljust(16)} health: {s.get('healthScore', 0)}/100"
            + (f" | {counts_str}" if counts_str else " | no biases detected")
        )

    return "\n".join(lines)


def build_prompt(payload: dict[str, Any]) -> str:
    stats        = payload.get("stats", {})
    symbol_stats = payload.get("symbolStats", [])
    hour_stats   = payload.get("hourStats", [])
    trades       = payload.get("recentTrades", [])
    bias_report  = payload.get("biasReport", {})

    streak     = stats.get("streak", {})
    cur_type   = streak.get("currentType", "none")
    streak_txt = f"{int(streak.get('currentStreak') or 0)} {cur_type + 's' if cur_type != 'none' else ''}".strip()

    pf_raw = stats.get("profitFactor")
    pf     = "∞" if pf_raw in (None, float("inf")) else f"{to_float(pf_raw):.2f}"

    closed   = int(stats.get("closedTrades") or 0)
    win_rate = to_float(stats.get("winRate"))
    wins     = round(win_rate / 100 * closed) if closed else 0

    best_hours, worst_hours = _fmt_hour_rows(hour_stats)
    has_biases = bool(bias_report.get("biases"))

    bias_section_instruction = (
        "For each bias listed in the Psychological Biases section above: which coins are worst "
        "affected, how many instances were detected, and what is the estimated P&L impact? "
        "Rank them by damage done."
        if has_biases else
        "No biases were algorithmically detected in this period. Note this positively and comment "
        "on what behavioural discipline the data suggests."
    )

    ctx = {
        "total_trades":             int(stats.get("totalTrades") or 0),
        "closed_trades":            closed,
        "total_pnl":                signed(to_float(stats.get("totalPnl"))),
        "win_rate":                 f"{win_rate:.1f}",
        "wins":                     wins,
        "losses":                   closed - wins,
        "profit_factor":            pf,
        "avg_win":                  f"{to_float(stats.get('avgWin')):.4f}",
        "avg_loss":                 f"{to_float(stats.get('avgLoss')):.4f}",
        "win_loss_ratio":           f"{to_float(stats.get('avgWinLossRatio')):.2f}",
        "max_drawdown":             f"{to_float(stats.get('maxDrawdown')):.2f}",
        "sharpe_ratio":             f"{to_float(stats.get('sharpeRatio')):.2f}",
        "total_commission":         f"{to_float(stats.get('totalCommission')):.4f}",
        "best_day":                 f"{to_float(stats.get('bestDay')):.4f}",
        "worst_day":                f"{to_float(stats.get('worstDay')):.4f}",
        "streak_txt":               streak_txt,
        "max_win_streak":           int(streak.get("maxWinStreak") or 0),
        "max_loss_streak":          int(streak.get("maxLossStreak") or 0),
        "symbol_rows":              _fmt_symbol_rows(symbol_stats),
        "best_hours":               best_hours,
        "worst_hours":              worst_hours,
        "best_trades":              _fmt_trade_rows(trades, best=True),
        "worst_trades":             _fmt_trade_rows(trades, best=False),
        "bias_section":             _fmt_bias_section(bias_report),
        "bias_section_instruction": bias_section_instruction,
    }

    return get_template("analysis").substitute(ctx)
