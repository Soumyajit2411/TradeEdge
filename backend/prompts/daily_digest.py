"""Prompt builder for the daily morning market digest email."""

from services.prompt_store import get_template


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

    ctx = {
        "date_key":      date_key,
        "snapshot_time": snapshot_time,
        "gainers_table": _fmt(gainers) or "  No data",
        "losers_table":  _fmt(losers) or "  No data",
    }

    return get_template("daily_digest").substitute(ctx)
