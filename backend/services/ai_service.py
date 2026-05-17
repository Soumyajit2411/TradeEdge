"""AI analysis service — builds the Gemini prompt and calls the API."""

import logging
from typing import Any

import requests

import config
from utils import to_float, signed

log = logging.getLogger(__name__)


# ── Prompt formatters ─────────────────────────────────────────────────────────

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


def _fmt_hour_rows(hour_stats: list[dict[str, Any]]) -> tuple[str, str]:
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
        f"  {t.get('symbol')} {str(t.get('direction', '')).upper()} "
        f"@ {t.get('entry_price')} → PnL: {signed(to_float(t.get('pnl')))}"
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


# ── Prompt builder ────────────────────────────────────────────────────────────

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

    return f"""You are an expert crypto derivatives trading coach and performance analyst. \
Analyze this trader's fill data from Delta Exchange India and provide a deep, highly specific, data-driven analysis.

## Trading Summary
- Total Fills: {int(stats.get('totalTrades') or 0)}
- Closed Trades (realized PnL): {closed}
- Total Realized PnL: {signed(to_float(stats.get('totalPnl')))} USDT
- Win Rate: {win_rate:.1f}% ({wins}W / {closed - wins}L)
- Profit Factor: {pf}
- Avg Win: +{to_float(stats.get('avgWin')):.4f} USDT
- Avg Loss: -{to_float(stats.get('avgLoss')):.4f} USDT
- Win/Loss Ratio: {to_float(stats.get('avgWinLossRatio')):.2f}x
- Max Drawdown: {to_float(stats.get('maxDrawdown')):.2f}%
- Sharpe Ratio (annualized): {to_float(stats.get('sharpeRatio')):.2f}
- Total Commission Paid: {to_float(stats.get('totalCommission')):.4f} USDT
- Best Day: +{to_float(stats.get('bestDay')):.4f} USDT
- Worst Day: {to_float(stats.get('worstDay')):.4f} USDT
- Current Streak: {streak_txt}
- Max Win Streak: {int(streak.get('maxWinStreak') or 0)}
- Max Loss Streak: {int(streak.get('maxLossStreak') or 0)}

## Per-Symbol Performance (sorted by PnL)
{_fmt_symbol_rows(symbol_stats)}

## Time Analysis (UTC hours)
Best hours:  {best_hours}
Worst hours: {worst_hours}

## Top 5 Best Trades
{_fmt_trade_rows(trades, best=True)}

## Top 5 Worst Trades
{_fmt_trade_rows(trades, best=False)}

## Algorithmically Detected Psychological Biases
{_fmt_bias_section(bias_report)}

---

Provide a detailed performance analysis with the following sections. Use specific numbers from the data above. \
Reference the psychological bias analysis directly — name specific coins where biases are worst. Be direct and actionable.

## 1. Executive Summary
3-5 sentence overall assessment. Include the psychological health score and the single most damaging behavioral pattern.

## 2. Symbol Analysis
For each significant symbol: should they trade more, less, or stop? Reference per-symbol health scores and specific detected biases.

## 3. Psychological Bias Breakdown
For each detected bias (revenge trading, FOMO, hesitation, emotional exits, inconsistent execution): \
what does the data show, on which coins is it worst, and what is the estimated P&L impact?

## 4. Timing Edge
Which hours show a clear statistical edge? Which to avoid? Specific recommendations.

## 5. Risk Management Assessment
Evaluate drawdown profile, win/loss ratio vs win rate, position sizing consistency, commission drag.

## 6. Fee Impact Analysis
Calculate how much commission is eating into gross PnL. Is the trading frequency sustainable?

## 7. Specific Action Plan — Next 7 Days
List 5-7 concrete, measurable actions. Reference specific coins and bias types \
(e.g., "On BTCUSDT your revenge trading score is X/100 — impose a 60-minute cooldown after any loss before re-entering")."""


# ── Additional prompt builders ────────────────────────────────────────────────

def build_trade_loss_prompt(trade: dict[str, Any], context: dict[str, Any]) -> str:
    symbol    = trade.get("symbol", "Unknown")
    direction = str(trade.get("direction", "")).upper()
    pnl       = to_float(trade.get("pnl"))
    price     = trade.get("entry_price", "?")
    qty       = trade.get("quantity", "?")
    win_rate  = to_float(context.get("winRate"))
    total_pnl = to_float(context.get("totalPnl"))
    drawdown  = to_float(context.get("maxDrawdown"))

    recent_losses = context.get("recentSymbolLosses", [])
    loss_rows = "\n".join(
        f"  {l.get('entry_time', '')[:16]} → {to_float(l.get('pnl')):+.4f} USDT"
        for l in recent_losses[:5]
    ) or "  No recent loss data"

    return f"""You are a trading coach reviewing a losing trade for a Delta Exchange India futures trader.

## The Losing Trade
- Symbol:    {symbol}
- Direction: {direction}
- Entry:     {price}
- Size:      {qty}
- PnL:       {signed(pnl)} USDT

## Trader Context
- Overall Win Rate:  {win_rate:.1f}%
- Total PnL:         {signed(total_pnl)} USDT
- Max Drawdown:      {drawdown:.2f}%

## Recent Losses on {symbol}
{loss_rows}

---

Write a concise 3-section analysis for this specific losing trade. Be direct, supportive, and actionable.
Keep it short enough to read in 60 seconds.

**What Went Wrong** — Analyse the likely reason for this loss based on the trade details and context.

**Pattern Check** — Does this fit a known bias (revenge trading, FOMO, hesitation, emotional exit)? \
Are recent {symbol} losses showing a pattern?

**Immediate Action** — One concrete thing the trader should do before their next {symbol} trade."""


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
        f"  {f.get('label','')}: {'+' if to_float(f.get('delta',0)) >= 0 else ''}{to_float(f.get('delta',0)):+.0f}"
        for f in factors
    ) or "  No factor data"

    recent = context.get("recentTrades", [])
    recent_rows = "\n".join(
        f"  {str(r.get('entry_time',''))[:16]} {str(r.get('direction','')).upper()} {r.get('symbol','')} "
        f"→ {to_float(r.get('pnl')):+.4f} USDT"
        for r in recent[:5]
    ) or "  No recent trades"

    return f"""You are a professional trading coach replaying a completed trade with a Delta Exchange India futures trader.
Walk them through this trade like an experienced mentor: what the data tells us, whether the decision was sound \
independent of outcome, and one thing to improve or reinforce.

## Trade Being Replayed
- Symbol:    {symbol}
- Direction: {direction}
- Entry:     {price}  ({entry_t} UTC)
- Size:      {qty}
- PnL:       {signed(pnl)} USDT ({pnl_pct:+.2f}%)
- Outcome:   {outcome}

## Trade Quality Score: {score}/100 (Grade {grade})
Quality factor breakdown:
{factor_lines}

## 5 Trades Before This One
{recent_rows}

---

Write a focused replay in 3 sections. Keep it under 250 words. Be specific, coach-like, and honest.

**Decision Quality** — Was this a good trade decision independent of the result? \
Reference the quality score, entry timing, and position sizing.

**Context Read** — Given the 5 prior trades, was the trader in a good mental state to take this trade? \
Flag any revenge trading, overtrading, or size escalation signals.

**One Key Takeaway** — A single concrete lesson from this trade that the trader should remember next time \
they see a similar {symbol} setup."""


def build_daily_digest_prompt(gainers: list[dict], losers: list[dict], date_key: str) -> str:
    def _fmt(items: list[dict]) -> str:
        return "\n".join(
            f"  {r['symbol']:<18} {r['change']:+.2f}%  @ {r['price']:.4f}"
            for r in items
        )

    return f"""You are a senior crypto market analyst writing a morning briefing for a Delta Exchange India futures trader.
Today is {date_key}.

## Live Market Snapshot (Delta Exchange India — ranked by turnover)

Top 5 Gainers (24h):
{_fmt(gainers) or '  No data'}

Top 5 Losers (24h):
{_fmt(losers) or '  No data'}

---

Write a concise morning briefing covering the sections below. Use the live data above as your anchor.
Draw on your market knowledge for context. Keep the total under 350 words.

**Market Sentiment** — What is the overall market tone based on these movers? Risk-on or risk-off?

**Coins to Watch** — 2-3 specific instruments from the data above that have setup potential today and why.

**Key Risks Today** — What macro or market-structure factors could cause sudden volatility \
(liquidation cascades, funding rates, upcoming events)?

**Trader's Edge Today** — One tactical suggestion for a Delta Exchange India futures trader \
given this morning's conditions."""


# ── Gemini callers ────────────────────────────────────────────────────────────

def call_gemini_raw(prompt: str, max_tokens: int = 2000) -> str:
    """Low-level Gemini call. Raises RuntimeError on any failure."""
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.GEMINI_MODEL}:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
    }

    res = requests.post(url, json=body, headers={"x-goog-api-key": config.GEMINI_API_KEY}, timeout=120)
    if not res.ok:
        raise RuntimeError(f"Gemini API error {res.status_code}: {res.text[:300]}")

    try:
        payload = res.json()
    except Exception:
        raise RuntimeError(f"Gemini returned non-JSON response: {res.text[:200]}")

    candidates = payload.get("candidates") or []
    if not candidates:
        # Surface finish reason or prompt-feedback if available
        feedback = payload.get("promptFeedback") or {}
        reason   = feedback.get("blockReason") or "unknown"
        raise RuntimeError(f"Gemini returned no candidates (blockReason: {reason})")

    text = "\n".join(
        part.get("text", "")
        for candidate in candidates
        for part in (candidate.get("content") or {}).get("parts", [])
        if part.get("text")
    ).strip()

    if not text:
        raise RuntimeError("Gemini returned candidates with empty text")

    return text


def call_gemini(payload: dict[str, Any]) -> str:
    """Build the full analysis prompt and call Gemini."""
    return call_gemini_raw(build_prompt(payload), max_tokens=3000)
