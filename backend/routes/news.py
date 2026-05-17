"""Market news routes — /api/news/*"""

import datetime as dt
import logging
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any, Optional
from urllib.parse import quote

import requests
from flask import Blueprint, Response, jsonify

from middleware.auth import require_auth

log = logging.getLogger(__name__)
bp = Blueprint("news", __name__)

GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search"
    "?q={query}"
    "&hl=en-IN"
    "&gl=IN"
    "&ceid=IN:en"
)

IMPACT_KEYWORDS: dict[str, tuple[list[str], int]] = {
    "rates":      (["fed", "fomc", "interest rate", "yield", "treasury", "bond yield", "rate cut", "rate hike"], 24),
    "inflation":  (["cpi", "inflation", "core inflation", "ppi"], 20),
    "macro":      (["gdp", "jobs", "payroll", "unemployment", "pmi", "recession"], 16),
    "equities":   (["nasdaq", "s&p", "dow", "earnings", "guidance"], 14),
    "crypto":     (["bitcoin", "btc", "ethereum", "eth", "crypto", "etf", "liquidation"], 14),
    "risk":       (["war", "geopolitical", "tariff", "sanction", "opec", "oil"], 14),
    "regulation": (["sec", "regulation", "ban", "approval", "lawsuit"], 12),
}

# Keyword → underlying asset symbol mapping.
# Only assets present in the Delta Exchange ticker cache will be shown.
COIN_KEYWORDS: dict[str, list[str]] = {
    "BTC":   ["bitcoin", "btc", "xbt", "satoshi"],
    "ETH":   ["ethereum", "eth", "ether", "vitalik"],
    "SOL":   ["solana", "sol"],
    "BNB":   ["bnb", "binance coin", "binance"],
    "XRP":   ["xrp", "ripple"],
    "ADA":   ["cardano", "ada"],
    "DOGE":  ["dogecoin", "doge", "elon musk dog"],
    "MATIC": ["polygon", "matic"],
    "POL":   ["polygon", "pol"],
    "DOT":   ["polkadot", "dot"],
    "LINK":  ["chainlink", "link"],
    "AVAX":  ["avalanche", "avax"],
    "UNI":   ["uniswap", "uni"],
    "ATOM":  ["cosmos", "atom"],
    "LTC":   ["litecoin", "ltc"],
    "BCH":   ["bitcoin cash", "bch"],
    "NEAR":  ["near protocol", "near"],
    "APT":   ["aptos", "apt"],
    "ARB":   ["arbitrum", "arb"],
    "OP":    ["optimism"],
    "SUI":   ["sui network", "sui"],
    "INJ":   ["injective", "inj"],
    "TIA":   ["celestia", "tia"],
    "WLD":   ["worldcoin", "wld"],
    "PEPE":  ["pepe"],
    "SHIB":  ["shiba inu", "shib"],
    "FIL":   ["filecoin", "fil"],
    "TON":   ["toncoin", "ton coin", "telegram open network"],
    "FLOKI": ["floki"],
    "SEI":   ["sei network", "sei"],
    "JUP":   ["jupiter exchange", "jup"],
    "WIF":   ["dogwifhat", "wif"],
    "BONK":  ["bonk"],
    "ORDI":  ["ordinals", "ordi"],
    "BLUR":  ["blur nft", "blur"],
    "GMX":   ["gmx exchange", "gmx"],
    "DYDX":  ["dydx"],
    "IMX":   ["immutable x", "immutable", "imx"],
    "GRT":   ["the graph", "grt"],
    "LDO":   ["lido", "ldo"],
    "RUNE":  ["thorchain", "rune"],
    "ETC":   ["ethereum classic", "etc"],
    "XLM":   ["stellar", "xlm"],
    "TRX":   ["tron network", "trx"],
    "STX":   ["stacks", "stx"],
    "ROSE":  ["oasis network", "rose"],
    "ENS":   ["ethereum name service", "ens"],
    "CRO":   ["cronos", "cro"],
    "XTZ":   ["tezos", "xtz"],
    "GALA":  ["gala games", "gala"],
    "SAND":  ["the sandbox", "sandbox", "sand"],
    "MANA":  ["decentraland", "mana"],
    "AXS":   ["axie infinity", "axs"],
    "AAVE":  ["aave"],
    "MKR":   ["makerdao", "maker", "mkr"],
    "CRV":   ["curve finance", "crv"],
    "COMP":  ["compound finance", "comp"],
    "ZEC":   ["zcash", "zec"],
    "XMR":   ["monero", "xmr"],
    "ALGO":  ["algorand", "algo"],
    "VET":   ["vechain", "vet"],
    "FTM":   ["fantom", "ftm"],
    "HBAR":  ["hedera", "hbar"],
    "ICP":   ["internet computer", "icp", "dfinity"],
    "ZRX":   ["0x protocol", "zrx"],
    "RPL":   ["rocket pool", "rpl"],
    "KAVA":  ["kava"],
    "OCEAN": ["ocean protocol", "ocean"],
    "CHZ":   ["chiliz", "chz"],
    "BAT":   ["basic attention token", "bat"],
    "EGLD":  ["elrond", "multiversx", "egld"],
    "KSM":   ["kusama", "ksm"],
    "ANKR":  ["ankr"],
    "ONE":   ["harmony", "one"],
    "FLOW":  ["flow blockchain", "flow"],
    "LUNA":  ["terra luna", "luna"],
    "XEM":   ["nem", "xem"],
    "QTUM":  ["qtum"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_google_news_feed(query: str, limit: int = 35) -> list[dict[str, Any]]:
    url = GOOGLE_NEWS_RSS.format(query=quote(query))
    res = requests.get(url, timeout=12)
    res.raise_for_status()

    root    = ET.fromstring(res.text)
    channel = root.find("channel")
    if channel is None:
        return []

    items: list[dict[str, Any]] = []
    for item in channel.findall("item")[:limit]:
        title       = (item.findtext("title") or "").strip()
        link        = (item.findtext("link")  or "").strip()
        pub_date    = (item.findtext("pubDate") or "").strip()
        source_el   = item.find("source")
        source_name = (source_el.text or "").strip() if source_el is not None else "Unknown"
        if not title or not link:
            continue
        items.append({"title": title, "url": link, "source": source_name or "Unknown", "published_at_raw": pub_date})
    return items


def _parse_pub_date(value: str) -> Optional[dt.datetime]:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        return None


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _impact_assessment(title: str, published_at: Optional[dt.datetime]) -> tuple[int, str, list[str]]:
    text        = _clean_text(title)
    score       = 0
    hit_reasons: list[str] = []
    tags:        list[str] = []

    for tag, (keywords, points) in IMPACT_KEYWORDS.items():
        if any(k in text for k in keywords):
            score += points
            tags.append(tag)
            hit_reasons.append(tag)

    if published_at is not None:
        hours_old = max((dt.datetime.now(dt.timezone.utc) - published_at).total_seconds() / 3600, 0)
        if   hours_old <= 12: score += 18
        elif hours_old <= 24: score += 12
        elif hours_old <= 48: score += 7
        elif hours_old <= 72: score += 3

    if score <= 0:
        return 5, "General market context", tags

    score  = min(score, 100)
    reason = (
        f"Likely to move markets due to {', '.join(dict.fromkeys(hit_reasons))} signals"
        if hit_reasons
        else "Recent headline with potential short-term market impact"
    )
    return score, reason, tags


def _get_delta_assets() -> dict[str, str]:
    """Return {underlying_asset_symbol → symbol} for every instrument in the Delta ticker cache.
    Falls back to a live REST fetch if the cache is empty."""
    from services import delta_fills, ticker_cache

    rows = ticker_cache.get_sorted()
    if not rows:
        try:
            rows = delta_fills.fetch_live_tickers()
        except Exception as exc:
            log.warning("[news] could not load Delta tickers for coin matching: %s", exc)

    assets: dict[str, str] = {}
    for row in rows:
        underlying = str(row.get("underlying_asset_symbol") or "").strip().upper()
        symbol     = str(row.get("symbol") or "").strip()
        if underlying and symbol and underlying not in assets:
            assets[underlying] = symbol
    return assets


def _match_impacted_coins(title: str, delta_assets: dict[str, str]) -> list[dict[str, str]]:
    """Return coins mentioned in the headline that are listed on Delta Exchange India."""
    text    = _clean_text(title)
    matched: list[dict[str, str]] = []
    seen:    set[str]             = set()

    for asset, keywords in COIN_KEYWORDS.items():
        if asset not in delta_assets:
            continue  # not listed on Delta Exchange — skip
        if any(kw in text for kw in keywords) and asset not in seen:
            seen.add(asset)
            matched.append({"asset": asset, "symbol": delta_assets[asset]})

    return matched


# ── Route ─────────────────────────────────────────────────────────────────────

@bp.get("/api/news/tomorrow-impact")
@require_auth
def route_tomorrow_impact_news() -> Response:
    queries = [
        "Federal Reserve CPI inflation bond yield Nasdaq crypto",
        "Bitcoin ETF regulation SEC macro economy markets",
        "Oil OPEC geopolitics risk assets equities futures",
    ]

    try:
        # Fetch Delta Exchange coin list once for the whole request.
        delta_assets = _get_delta_assets()

        merged: list[dict[str, Any]] = []
        for q in queries:
            merged.extend(_parse_google_news_feed(q, limit=20))

        # De-duplicate by URL, then by title.
        seen_urls:   set[str] = set()
        seen_titles: set[str] = set()
        unique:      list[dict[str, Any]] = []
        for item in merged:
            url       = item["url"]
            title_key = _clean_text(item["title"])
            if url in seen_urls or title_key in seen_titles:
                continue
            seen_urls.add(url)
            seen_titles.add(title_key)
            unique.append(item)

        enriched: list[dict[str, Any]] = []
        for item in unique:
            published_at                 = _parse_pub_date(item.get("published_at_raw", ""))
            score, reason, tags          = _impact_assessment(item["title"], published_at)
            impacted_coins               = _match_impacted_coins(item["title"], delta_assets)
            enriched.append({
                "title":          item["title"],
                "url":            item["url"],
                "source":         item["source"],
                "published_at":   published_at.isoformat() if published_at else None,
                "impact_score":   score,
                "impact_reason":  reason,
                "market_tags":    tags,
                "impacted_coins": impacted_coins,   # [{asset, symbol}] — Delta Exchange only
            })

        enriched.sort(key=lambda x: (x["impact_score"], x["published_at"] or ""), reverse=True)
        top = enriched[:25]

        return jsonify({"as_of": dt.datetime.now(dt.timezone.utc).isoformat(), "count": len(top), "items": top})

    except Exception as exc:
        log.error("[news/tomorrow-impact] fetch failed: %s", exc)
        return jsonify({"error": str(exc)}), 500
