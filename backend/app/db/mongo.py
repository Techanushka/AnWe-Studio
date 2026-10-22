import certifi
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.core.config import settings

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        kwargs: dict = {"serverSelectionTimeoutMS": 8000}
        if settings.MONGODB_URI.startswith("mongodb+srv://"):
            kwargs["tlsCAFile"] = certifi.where()  # avoids TLS/CA errors on Windows/macOS
        _client = MongoClient(settings.MONGODB_URI, **kwargs)
    return _client


def get_database() -> Database:
    return get_client()[settings.MONGODB_DB]


def get_db() -> Database:
    """FastAPI dependency."""
    return get_database()


def init_indexes() -> None:
    db = get_database()
    try:
        db["users"].create_index("email", unique=True)
        db["users"].create_index("google_id", unique=True, sparse=True)
        db["otps"].create_index([("user_id", 1), ("purpose", 1)])
        db["refresh_tokens"].create_index("token_hash", unique=True)
        db["refresh_tokens"].create_index("user_id")
        db["reset_tokens"].create_index("token_hash", unique=True)
        # TTL indexes: MongoDB deletes expired documents automatically.
        for name in ("otps", "refresh_tokens", "reset_tokens"):
            db[name].create_index("expires_at", expireAfterSeconds=0)
    except PyMongoError as exc:
        raise RuntimeError(
            "Could not connect to MongoDB Atlas. Check MONGODB_URI (password, URL-encoded), "
            "and that your IP is allowed under Atlas > Network Access."
        ) from exc
