from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC datetime (consistent across SQLite/PostgreSQL)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
