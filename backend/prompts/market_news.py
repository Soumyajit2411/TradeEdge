"""Prompt builder for Gemini Search-grounded market news intelligence."""

from services.prompt_store import get_template


def build_market_news_prompt(coins: list[dict], date: str) -> str:
    coin_names     = ", ".join(c["asset"] for c in coins)
    coin_reference = ", ".join(f"{c['asset']} -> {c['symbol']}" for c in coins)

    ctx = {
        "date":           date,
        "coin_names":     coin_names,
        "coin_reference": coin_reference,
    }

    return get_template("market_news").substitute(ctx)
