"""Market news routes — /api/news/*
Powered by Gemini Search grounding; replaces the previous Google News RSS approach.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from flask import Blueprint, Response, jsonify

import config
from middleware.auth import require_auth
from prompts import build_market_news_prompt
from services import redis_cache
from services.ai_service import call_gemini_with_search

log = logging.getLogger(__name__)
bp  = Blueprint("news", __name__)

_NEWS_CACHE_KEY = "gemini_market_news"
_MAX_ITEMS      = 15


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_active_coins() -> list[dict[str, str]]:
    """Return top coins by turnover from the ticker cache, falling back to a live REST fetch."""
    from services import delta_fills, ticker_cache

    rows = ticker_cache.get_sorted()
    if not rows:
        try:
            rows = delta_fills.fetch_live_tickers()
        except Exception as exc:
            log.warning("[news] could not load Delta tickers: %s", exc)

    coins: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows[:40]:
        asset  = str(row.get("underlying_asset_symbol") or "").strip().upper()
        symbol = str(row.get("symbol") or "").strip()
        if asset and symbol and asset not in seen:
            seen.add(asset)
            coins.append({"asset": asset, "symbol": symbol})

    return coins or [
        {"asset": "BTC",  "symbol": "BTCUSD"},
        {"asset": "ETH",  "symbol": "ETHUSD"},
        {"asset": "SOL",  "symbol": "SOLUSDT"},
        {"asset": "BNB",  "symbol": "BNBUSDT"},
        {"asset": "XRP",  "symbol": "XRPUSDT"},
    ]


def _sanitize_json_text(text: str) -> str:
    """Remove literal newlines and carriage returns from inside JSON string values.

    Gemini sometimes wraps long URLs across lines, producing invalid JSON.
    This does a single character-level pass respecting escape sequences.
    """
    result: list[str] = []
    in_string   = False
    escape_next = False
    for ch in text:
        if escape_next:
            result.append(ch)
            escape_next = False
        elif ch == "\\":
            result.append(ch)
            escape_next = True
        elif ch == '"':
            in_string = not in_string
            result.append(ch)
        elif in_string and ch in ("\n", "\r"):
            result.append(" ")          # replace bare newline with space
        else:
            result.append(ch)
    return "".join(result)


def _parse_news_json(text: str) -> list[dict[str, Any]]:
    """Extract and return the JSON array from Gemini's response text.

    Tries several strategies in order of strictness, then logs the full
    raw response if all fail so the caller can diagnose the issue.
    """
    text = _sanitize_json_text(text)
    strategies = [
        # 1. Fenced block: ```json [ ... ] ```
        lambda t: re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", t),
        # 2. Fenced block without closing fence (truncated output)
        lambda t: re.search(r"```(?:json)?\s*(\[[\s\S]*)", t),
        # 3. Bare array — greedy (entire [ ... ])
        lambda t: re.search(r"(\[[\s\S]*\])", t),
        # 4. Bare array — find the last ] to handle trailing text
        lambda t: re.search(r"(\[[\s\S]*\])[^\]]*$", t),
        # 5. Array that starts with [ but has no closing ] at all (completely truncated
        #    or corrupted mid-content — error_pos recovery handles the rest)
        lambda t: re.search(r"(\[[\s\S]+)", t),
    ]

    for strategy in strategies:
        match = strategy(text)
        if not match:
            continue
        candidate = match.group(1).strip()
        try:
            result = json.loads(candidate)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError as e:
            # Strategy A: truncate at the exact error position and close the structure.
            # This handles the case where Gemini embeds a duplicate of the whole response
            # inside a string value (unescaped quotes corrupt the JSON mid-field).
            error_prefix = candidate[:e.pos].rstrip()
            for suffix in ("}]", '"}]', '"]}]', "}]}]", "\"]}]", "]"):
                try:
                    result = json.loads(error_prefix.rstrip(",") + suffix)
                    if isinstance(result, list) and result:
                        return result
                except Exception:
                    pass

            # Strategy B: close all unclosed braces/brackets (truncated output)
            for suffix in ("]", "}]", "}]}]", "\"]}]"):
                try:
                    repaired = candidate.rstrip().rstrip(",") + suffix
                    result = json.loads(repaired)
                    if isinstance(result, list):
                        return result
                except Exception:
                    pass

    # Strategy: trim to the last complete object boundary and close the array
    for match in re.finditer(r"(\[[\s\S]*)", text):
        candidate = match.group(1)
        last_obj_end = candidate.rfind("},")
        if last_obj_end == -1:
            last_obj_end = candidate.rfind("}")
        if last_obj_end > 0:
            try:
                trimmed = candidate[:last_obj_end + 1] + "]"
                result = json.loads(trimmed)
                if isinstance(result, list) and result:
                    return result
            except Exception:
                pass

    # Last resort: collect all individual {...} objects from the text
    objects = []
    for m in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}", text):
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict) and obj.get("title"):
                objects.append(obj)
        except Exception:
            pass
    if objects:
        return objects

    log.warning(
        "[news] could not parse JSON from Gemini response (len=%d). Full response:\n%s",
        len(text), text,
    )
    return []


def _validate_item(item: Any, valid_assets: set[str]) -> Optional[dict[str, Any]]:
    """Return a cleaned item dict or None if the item is malformed."""
    if not isinstance(item, dict):
        return None

    title = str(item.get("title") or "").strip()
    if not title:
        return None

    score = item.get("impact_score")
    try:
        score = max(5, min(100, int(score)))
    except (TypeError, ValueError):
        score = 20

    # Only keep impacted_coins that are actually in the active coin list
    raw_coins = item.get("impacted_coins") or []
    impacted_coins = [
        c for c in raw_coins
        if isinstance(c, dict) and str(c.get("asset", "")).upper() in valid_assets
    ]

    tags = [str(t).lower() for t in (item.get("market_tags") or []) if t]

    raw_url = str(item.get("url") or "").strip()
    # Drop grounding redirect URLs — they are internal Gemini proxies, not real article links
    if "vertexaisearch.cloud.google.com" in raw_url or "grounding-api-redirect" in raw_url:
        raw_url = ""

    return {
        "title":          title,
        "url":            raw_url,
        "source":         str(item.get("source") or "Gemini Search").strip(),
        "published_at":   str(item.get("published_at") or "").strip() or None,
        "impact_score":   score,
        "impact_reason":  str(item.get("impact_reason") or "").strip(),
        "market_tags":    tags,
        "impacted_coins": impacted_coins,
    }


# ── Route ─────────────────────────────────────────────────────────────────────

@bp.get("/api/news/tomorrow-impact")
@require_auth
def route_tomorrow_impact_news() -> Response:
    cached = redis_cache.get(_NEWS_CACHE_KEY)
    if cached is not None:
        return jsonify(cached)

    coins      = _get_active_coins()
    date_key   = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    valid_assets = {c["asset"] for c in coins}

    try:
        prompt   = build_market_news_prompt(coins, date_key)
        raw_text = call_gemini_with_search(prompt, max_tokens=3000, caller="market_news")
        raw_items = _parse_news_json(raw_text)
    except Exception as exc:
        log.error("[news] Gemini fetch failed: %s", exc)
        return jsonify({"error": "Failed to fetch market news. Please try again shortly."}), 500

    items = [
        v for item in raw_items
        if (v := _validate_item(item, valid_assets)) is not None
    ]
    items.sort(key=lambda x: x["impact_score"], reverse=True)
    items = items[:_MAX_ITEMS]

    result = {
        "as_of":      datetime.now(timezone.utc).isoformat(),
        "count":      len(items),
        "items":      items,
        "powered_by": "gemini",
    }

    written = redis_cache.set(_NEWS_CACHE_KEY, result, ttl=config.NEWS_CACHE_TTL)
    if not written:
        log.warning("[news] failed to cache key=%s", _NEWS_CACHE_KEY)
    return jsonify(result)
