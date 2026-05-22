"""AI analysis service — calls Gemini with prompts from the prompts package."""

import logging
from typing import Any

import requests

import config
from prompts import (
    build_daily_digest_prompt,
    build_market_news_prompt,
    build_prompt,
    build_trade_loss_prompt,
    build_trade_replay_prompt,
)

log = logging.getLogger(__name__)

__all__ = [
    "build_prompt",
    "build_trade_loss_prompt",
    "build_trade_replay_prompt",
    "build_daily_digest_prompt",
    "build_market_news_prompt",
    "call_gemini_raw",
    "call_gemini_with_search",
    "call_gemini",
]

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


# ── Shared helpers ────────────────────────────────────────────────────────────


def _post(body: dict, *, caller: str, timeout: int) -> str:
    """POST to Gemini, log tokens, and return the text response. Raises RuntimeError on failure."""
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    url = f"{_GEMINI_BASE}/{config.GEMINI_MODEL}:generateContent"
    res = requests.post(
        url, json=body, headers={"x-goog-api-key": config.GEMINI_API_KEY}, timeout=timeout
    )
    if not res.ok:
        raise RuntimeError(f"Gemini API error {res.status_code}: {res.text[:300]}")

    try:
        payload = res.json()
    except Exception:
        raise RuntimeError(f"Gemini returned non-JSON response: {res.text[:200]}")

    usage = payload.get("usageMetadata") or {}
    log.info(
        "gemini_tokens model=%s caller=%s prompt=%d output=%d total=%d",
        config.GEMINI_MODEL,
        caller,
        usage.get("promptTokenCount", 0),
        usage.get("candidatesTokenCount", 0),
        usage.get("totalTokenCount", 0),
    )

    candidates = payload.get("candidates") or []
    if not candidates:
        reason = (payload.get("promptFeedback") or {}).get("blockReason") or "unknown"
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


# ── Public callers ────────────────────────────────────────────────────────────


def call_gemini_raw(prompt: str, max_tokens: int = 2000, *, caller: str = "") -> str:
    """Standard Gemini call. Raises RuntimeError on any failure."""
    log.info(
        "gemini_request model=%s prompt_chars=%d max_tokens=%d caller=%s",
        config.GEMINI_MODEL,
        len(prompt),
        max_tokens,
        caller or "unknown",
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
    }
    return _post(body, caller=caller or "unknown", timeout=120)


def call_gemini_with_search(prompt: str, max_tokens: int = 3000, *, caller: str = "search") -> str:
    """Gemini call with Google Search grounding for real-time information."""
    log.info(
        "gemini_search_request model=%s prompt_chars=%d caller=%s",
        config.GEMINI_MODEL,
        len(prompt),
        caller,
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": max_tokens},
    }
    return _post(body, caller=caller, timeout=60)


def call_gemini(payload: dict[str, Any]) -> str:
    """Build the full analysis prompt and call Gemini."""
    return call_gemini_raw(build_prompt(payload), max_tokens=3000, caller="analysis")
