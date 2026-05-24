"""Email delivery via Resend — loss alerts and daily market digest."""

import logging
from datetime import datetime
from typing import Any

import resend

import config

log = logging.getLogger(__name__)

# In-memory fallback for when Redis is unavailable.
_notified_ids: set[str] = set()

_NOTIFIED_TTL = 86_400  # 24 h


def is_notified(fill_id: str) -> bool:
    """Return True if an email for this fill has already been sent."""
    if not fill_id:
        return False
    from services import redis_cache

    r = redis_cache.client()
    if r:
        return bool(r.exists(f"notified:fill:{fill_id}"))
    return fill_id in _notified_ids


def _mark_notified(fill_id: str) -> None:
    if not fill_id:
        return
    from services import redis_cache

    r = redis_cache.client()
    if r:
        r.set(f"notified:fill:{fill_id}", "1", ex=_NOTIFIED_TTL)
    _notified_ids.add(fill_id)


def _init() -> bool:
    """Return True if Resend is configured, False (with a warning) otherwise."""
    if not config.RESEND_API_KEY or not config.EMAIL_TO:
        log.warning("Email disabled — set RESEND_API_KEY and EMAIL_TO in .env")
        return False
    resend.api_key = config.RESEND_API_KEY
    return True


# ── HTML templates ─────────────────────────────────────────────────────────────

_BASE_STYLE = """
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;padding:24px}
  .wrap{max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{padding:24px 28px;background:#0f1117;color:#fff}
  .hdr h1{font-size:18px;font-weight:700;margin-bottom:6px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.4px}
  .badge-red{background:#ef4444;color:#fff}
  .badge-violet{background:#7c3aed;color:#fff}
  .body{padding:28px}
  .stat-row{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:#f8f9fb;border-radius:10px;padding:14px}
  .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:4px}
  .stat-value{font-size:20px;font-weight:700;color:#0f1117}
  .loss{color:#ef4444}
  .profit{color:#22c55e}
  .section{margin-top:22px}
  .section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:10px}
  .box{background:#f8f9fb;border-left:3px solid #7c3aed;border-radius:6px;padding:16px;font-size:14px;line-height:1.7;color:#333}
  .table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}
  .table th{background:#f0f2f5;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#888;font-weight:600}
  .table td{padding:8px 10px;border-bottom:1px solid #f0f2f5;color:#333}
  .table tr:last-child td{border-bottom:none}
  .up{color:#22c55e;font-weight:600}
  .dn{color:#ef4444;font-weight:600}
  .footer{padding:16px 28px;background:#f8f9fb;font-size:11px;color:#aaa;text-align:center}
</style>
"""


def _loss_html(trade: dict[str, Any], analysis: str) -> str:
    symbol = trade.get("symbol", "Unknown")
    direction = str(trade.get("direction", "")).upper()
    pnl = float(trade.get("pnl", 0))
    price = trade.get("entry_price", "—")
    qty = trade.get("quantity", "—")
    ts = str(trade.get("entry_time", ""))[:16].replace("T", " ")

    pnl_cls = "loss" if pnl < 0 else "profit"
    pnl_str = f"{pnl:+.4f} USDT"

    # Render analysis as paragraphs
    body_lines = "".join(
        f"<p style='margin-bottom:10px'>{line.strip()}</p>"
        for line in analysis.split("\n")
        if line.strip()
    )

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="hdr">
    <h1>⚠️ Loss Trade Alert</h1>
    <span class="badge badge-red">{symbol} · {direction}</span>
  </div>
  <div class="body">
    <div class="stat-row">
      <div class="stat"><div class="stat-label">PnL</div><div class="stat-value {pnl_cls}">{pnl_str}</div></div>
      <div class="stat"><div class="stat-label">Entry Price</div><div class="stat-value">{price}</div></div>
      <div class="stat"><div class="stat-label">Size</div><div class="stat-value">{qty}</div></div>
      <div class="stat"><div class="stat-label">Time (UTC)</div><div class="stat-value" style="font-size:14px">{ts}</div></div>
    </div>
    <div class="section">
      <div class="section-title">AI Trade Analysis</div>
      <div class="box">{body_lines}</div>
    </div>
  </div>
  <div class="footer">TradeEdge · Delta Exchange India · {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC</div>
</div>
</body></html>"""


def _digest_html(date_str: str, analysis: str, gainers: list[dict], losers: list[dict]) -> str:
    def rows(items: list[dict]) -> str:
        return "".join(
            f"<tr><td>{r['symbol']}</td>"
            f"<td class='{'up' if r['change'] >= 0 else 'dn'}'>{r['change']:+.2f}%</td>"
            f"<td>{r['price']:.4f}</td></tr>"
            for r in items
        )

    body_lines = "".join(
        f"<p style='margin-bottom:10px'>{line.strip()}</p>"
        for line in analysis.split("\n")
        if line.strip()
    )

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="hdr">
    <h1>📈 Morning Market Digest</h1>
    <span class="badge badge-violet">{date_str}</span>
  </div>
  <div class="body">
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div class="section-title" style="margin-bottom:8px">🔥 Top Gainers</div>
        <table class="table"><thead><tr><th>Symbol</th><th>Change</th><th>Price</th></tr></thead>
        <tbody>{rows(gainers)}</tbody></table>
      </div>
      <div style="flex:1;min-width:220px">
        <div class="section-title" style="margin-bottom:8px">❄️ Top Losers</div>
        <table class="table"><thead><tr><th>Symbol</th><th>Change</th><th>Price</th></tr></thead>
        <tbody>{rows(losers)}</tbody></table>
      </div>
    </div>
    <div class="section">
      <div class="section-title">AI Market Outlook</div>
      <div class="box">{body_lines}</div>
    </div>
  </div>
  <div class="footer">TradeEdge · Delta Exchange India · Delivered at {date_str}</div>
</div>
</body></html>"""


# ── Public send functions ──────────────────────────────────────────────────────


def send_loss_alert(trade: dict[str, Any], analysis: str) -> None:
    """Send a loss trade analysis email. Silently deduplicates by fill ID."""
    if not _init():
        return

    fill_id = str(trade.get("id", ""))
    if is_notified(fill_id):
        return
    _mark_notified(fill_id)

    symbol = trade.get("symbol", "Unknown")
    pnl = float(trade.get("pnl", 0))

    try:
        resend.Emails.send(
            {
                "from": config.EMAIL_FROM,
                "to": [config.EMAIL_TO],
                "subject": f"⚠️ Loss Trade — {symbol} → {pnl:+.4f} USDT",
                "html": _loss_html(trade, analysis),
            }
        )
    except Exception:
        log.exception("Failed to send loss alert")


def send_daily_digest(
    date_str: str, analysis: str, gainers: list[dict], losers: list[dict]
) -> None:
    """Send the morning market digest email."""
    if not _init():
        return
    try:
        resend.Emails.send(
            {
                "from": config.EMAIL_FROM,
                "to": [config.EMAIL_TO],
                "subject": f"📈 Morning Market Digest — {date_str}",
                "html": _digest_html(date_str, analysis, gainers, losers),
            }
        )
    except Exception:
        log.exception("Failed to send daily digest")
