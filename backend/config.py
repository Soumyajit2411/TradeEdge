import logging
import os

from dotenv import load_dotenv

load_dotenv()

DELTA_BASE_URL   = os.getenv("DELTA_EXCHANGE_BASE_URL", "https://api.india.delta.exchange")
DELTA_API_KEY    = os.getenv("DELTA_EXCHANGE_API_KEY", "")
DELTA_API_SECRET = os.getenv("DELTA_EXCHANGE_API_SECRET", "")
DELTA_WS_URL     = os.getenv("DELTA_WEBSOCKET_URL", "wss://socket.india.delta.exchange")
DELTA_LOOKBACK   = int(os.getenv("DELTA_LOOKBACK_DAYS", "365"))
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL     = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Accepts a single origin or a comma-separated list:
#   CORS_ALLOW_ORIGIN=https://tradeedge.vercel.app,http://localhost:3000
_cors_raw   = os.getenv("CORS_ALLOW_ORIGIN", "*")
CORS_ORIGINS: list | str = (
    [o.strip() for o in _cors_raw.split(",") if o.strip()]
    if "," in _cors_raw else _cors_raw
)
PORT             = int(os.getenv("PORT", "5001"))

# Email
RESEND_API_KEY    = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM        = os.getenv("EMAIL_FROM", "onboarding@resend.dev")
EMAIL_TO          = os.getenv("EMAIL_TO", "")
DAILY_EMAIL_TIME  = os.getenv("DAILY_EMAIL_TIME", "03:45")

# Supabase — service role key comes from the Supabase dashboard (Settings → API)
SUPABASE_URL              = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY         = (os.getenv("SUPABASE_ANON_KEY")
                             or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
                             or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""))
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def validate() -> None:
    """Log warnings for missing or insecure configuration at startup."""
    _log = logging.getLogger(__name__)
    if CORS_ORIGINS == "*":
        _log.warning("CORS_ALLOW_ORIGIN is '*' — set it to your frontend origin in production")
    for name, val in [
        ("SUPABASE_URL",              SUPABASE_URL),
        ("SUPABASE_ANON_KEY",         SUPABASE_ANON_KEY),
        ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
        ("GEMINI_API_KEY",            GEMINI_API_KEY),
    ]:
        if not val:
            _log.warning("Missing required env var: %s", name)
