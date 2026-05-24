import logging
import os
from typing import Union

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str = "") -> str:
    """Read an env var, stripping surrounding whitespace and accidental quotes."""
    val = os.getenv(key, default)
    return val.strip().strip('"').strip("'").strip()


def _env_first(*keys: str, default: str = "") -> str:
    """Return the first non-empty env var from the list, cleaned."""
    for key in keys:
        v = os.getenv(key)
        if v is not None:
            cleaned = v.strip().strip('"').strip("'").strip()
            if cleaned:
                return cleaned
    return default


DELTA_BASE_URL = _env("DELTA_EXCHANGE_BASE_URL", "https://api.india.delta.exchange")
DELTA_API_KEY = _env("DELTA_EXCHANGE_API_KEY")
DELTA_API_SECRET = _env("DELTA_EXCHANGE_API_SECRET")
DELTA_WS_URL = _env("DELTA_WEBSOCKET_URL", "wss://socket.india.delta.exchange")
DELTA_LOOKBACK = int(_env("DELTA_LOOKBACK_DAYS", "365"))
GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")

# Accepts a single origin or a comma-separated list:
#   CORS_ALLOW_ORIGIN=https://tradeedge.vercel.app,http://localhost:3000
_cors_raw = _env("CORS_ALLOW_ORIGIN", "*")
CORS_ORIGINS: Union[list, str] = (
    [o.strip() for o in _cors_raw.split(",") if o.strip()] if "," in _cors_raw else _cors_raw
)
PORT = int(_env("PORT", "5001"))

# Email
RESEND_API_KEY = _env("RESEND_API_KEY")
EMAIL_FROM = _env("EMAIL_FROM", "onboarding@resend.dev")
EMAIL_TO = _env("EMAIL_TO")
DAILY_EMAIL_TIME = _env("DAILY_EMAIL_TIME", "03:45")

# Supabase — service role key comes from the Supabase dashboard (Settings → API)
SUPABASE_URL = _env_first("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = _env_first(
    "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
)
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

# Redis
REDIS_URL = _env("REDIS_URL", "redis://localhost:6379")
REDIS_RETRY_AFTER_SECS = int(_env("REDIS_RETRY_AFTER_SECS", "30"))

# News
NEWS_CACHE_TTL = int(_env("NEWS_CACHE_TTL", "1800"))
NEWS_CACHE_KEY = _env("NEWS_CACHE_KEY", "gemini_market_news")
NEWS_MAX_ITEMS = int(_env("NEWS_MAX_ITEMS", "15"))


def validate() -> None:
    """Log warnings for missing or insecure configuration at startup."""
    _log = logging.getLogger(__name__)
    if CORS_ORIGINS == "*":
        _log.warning("CORS_ALLOW_ORIGIN is '*' — set it to your frontend origin in production")
    for name, val in [
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
        ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
        ("GEMINI_API_KEY", GEMINI_API_KEY),
    ]:
        if not val:
            _log.warning("Missing required env var: %s", name)
