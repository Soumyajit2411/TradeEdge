from typing import Any


def to_float(value: Any, default: float = 0.0) -> float:
    """Safe cast to float, returning *default* on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def signed(value: float, digits: int = 4) -> str:
    """Format a float with an explicit '+' prefix when non-negative."""
    return f"{'+' if value >= 0 else ''}{value:.{digits}f}"
