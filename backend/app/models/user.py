from bson import ObjectId
from bson.errors import InvalidId

from app.core.clock import utcnow


def object_id(value) -> ObjectId | None:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def new_user(name: str, email: str, password_hash: str | None = None, google_id: str | None = None,
             avatar_url: str | None = None, is_verified: bool = False) -> dict:
    now = utcnow()
    doc = {
        "name": name,
        "email": email,
        "password_hash": password_hash,  # None = Google-only account
        "avatar_url": avatar_url,
        "is_verified": is_verified,
        "is_active": True,
        "failed_login_attempts": 0,
        "locked_until": None,
        "created_at": now,
        "updated_at": now,
    }
    if google_id:  # key omitted otherwise (sparse unique index)
        doc["google_id"] = google_id
    return doc


def to_user_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "email": doc["email"],
        "avatar_url": doc.get("avatar_url"),
        "is_verified": doc["is_verified"],
        "has_password": bool(doc.get("password_hash")),
    }
