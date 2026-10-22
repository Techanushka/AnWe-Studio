from datetime import timedelta

from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.clock import utcnow
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    generate_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.user import new_user, object_id
from app.services import otp_service

INVALID_CREDENTIALS = "That email or password doesn’t match. Please try again."


def get_user_by_email(db: Database, email: str) -> dict | None:
    return db["users"].find_one({"email": email.strip().lower()})


def get_user_by_id(db: Database, user_id) -> dict | None:
    oid = object_id(user_id)
    return db["users"].find_one({"_id": oid}) if oid else None


def _update(db: Database, user: dict, **fields) -> dict:
    fields["updated_at"] = utcnow()
    db["users"].update_one({"_id": user["_id"]}, {"$set": fields})
    user.update(fields)
    return user


# ---------- Signup / email verification ----------
def register_user(db: Database, name: str, email: str, password: str) -> tuple[dict, str]:
    user = get_user_by_email(db, email)
    if user and user["is_verified"]:
        raise AppError(409, "An account with that email already exists. Try logging in.", "EMAIL_EXISTS")
    if user:  # unverified leftover: overwrite so nobody can squat an email they don't own
        _update(db, user, name=name, password_hash=hash_password(password))
    else:
        doc = new_user(name, email, hash_password(password))
        try:
            doc["_id"] = db["users"].insert_one(doc).inserted_id
        except DuplicateKeyError:
            raise AppError(409, "An account with that email already exists. Try logging in.", "EMAIL_EXISTS")
        user = doc
    return user, otp_service.create_otp(db, user)


def verify_email(db: Database, email: str, code: str) -> dict:
    user = get_user_by_email(db, email)
    if not user:
        raise AppError(400, "That code isn’t correct. Please try again.", "OTP_INVALID")
    if user["is_verified"]:
        raise AppError(400, "This email is already verified. Please log in.", "ALREADY_VERIFIED")
    otp_service.verify_otp(db, user, code)
    return _update(db, user, is_verified=True)


# ---------- Login ----------
def authenticate(db: Database, email: str, password: str) -> dict:
    user = get_user_by_email(db, email)
    if not user or not user.get("password_hash"):
        verify_password(password, DUMMY_HASH)  # equalise timing, avoid user enumeration
        raise AppError(401, INVALID_CREDENTIALS, "INVALID_CREDENTIALS")

    now = utcnow()
    locked = user.get("locked_until")
    if locked and locked > now:
        mins = int((locked - now).total_seconds() // 60) + 1
        raise AppError(429, f"Too many attempts. Try again in {mins} minute(s).", "ACCOUNT_LOCKED")

    if not verify_password(password, user["password_hash"]):
        attempts = user.get("failed_login_attempts", 0) + 1
        if attempts >= settings.MAX_FAILED_LOGINS:
            _update(db, user, failed_login_attempts=0, locked_until=now + timedelta(minutes=settings.LOCKOUT_MINUTES))
        else:
            _update(db, user, failed_login_attempts=attempts)
        raise AppError(401, INVALID_CREDENTIALS, "INVALID_CREDENTIALS")

    if not user["is_active"]:
        raise AppError(403, "This account has been disabled.", "ACCOUNT_DISABLED")
    return _update(db, user, failed_login_attempts=0, locked_until=None)


# ---------- Sessions (access JWT + rotating refresh token) ----------
def create_session(db: Database, user: dict, remember: bool, user_agent: str | None = None) -> tuple[str, str, bool]:
    raw = generate_token()
    days = settings.REFRESH_TOKEN_DAYS if remember else settings.SHORT_SESSION_DAYS
    db["refresh_tokens"].insert_one({
        "user_id": user["_id"],
        "token_hash": hash_token(raw),
        "remember": remember,
        "revoked": False,
        "user_agent": (user_agent or "")[:300] or None,
        "expires_at": utcnow() + timedelta(days=days),
        "created_at": utcnow(),
    })
    return create_access_token(str(user["_id"])), raw, remember


def revoke_all_sessions(db: Database, user_id) -> None:
    db["refresh_tokens"].update_many({"user_id": user_id}, {"$set": {"revoked": True}})


def rotate_refresh(db: Database, raw: str) -> tuple[dict, str, str, bool] | None:
    row = db["refresh_tokens"].find_one({"token_hash": hash_token(raw)})
    if not row:
        return None
    if row["revoked"]:  # token reuse => likely theft, kill every session of this user
        revoke_all_sessions(db, row["user_id"])
        return None
    if row["expires_at"] < utcnow():
        return None
    user = db["users"].find_one({"_id": row["user_id"]})
    if not user or not user["is_active"] or not user["is_verified"]:
        return None
    db["refresh_tokens"].update_one({"_id": row["_id"]}, {"$set": {"revoked": True}})
    access, new_raw, remember = create_session(db, user, row["remember"])
    return user, access, new_raw, remember


def revoke_refresh(db: Database, raw: str) -> None:
    db["refresh_tokens"].update_one({"token_hash": hash_token(raw)}, {"$set": {"revoked": True}})


# ---------- Forgot / reset / change password ----------
def create_reset_token(db: Database, email: str) -> tuple[dict, str] | None:
    """Returns None silently for unknown emails (caller always shows the same message)."""
    user = get_user_by_email(db, email)
    if not user or not user["is_active"]:
        return None
    recent = db["reset_tokens"].find_one({"user_id": user["_id"], "used": False}, sort=[("created_at", -1)])
    if recent and (utcnow() - recent["created_at"]).total_seconds() < settings.OTP_RESEND_SECONDS:
        return None
    db["reset_tokens"].delete_many({"user_id": user["_id"]})
    raw = generate_token()
    db["reset_tokens"].insert_one({
        "user_id": user["_id"],
        "token_hash": hash_token(raw),
        "used": False,
        "expires_at": utcnow() + timedelta(minutes=settings.RESET_TOKEN_MINUTES),
        "created_at": utcnow(),
    })
    return user, raw


def reset_password(db: Database, raw: str, new_password: str) -> dict:
    row = db["reset_tokens"].find_one({"token_hash": hash_token(raw)})
    if not row or row["used"] or row["expires_at"] < utcnow():
        raise AppError(400, "This reset link is invalid or has expired.", "RESET_INVALID")
    user = db["users"].find_one({"_id": row["user_id"]})
    if not user:
        raise AppError(400, "This reset link is invalid or has expired.", "RESET_INVALID")
    _update(db, user, password_hash=hash_password(new_password), is_verified=True,
            failed_login_attempts=0, locked_until=None)
    db["reset_tokens"].update_one({"_id": row["_id"]}, {"$set": {"used": True}})
    revoke_all_sessions(db, user["_id"])
    return user


def change_password(db: Database, user: dict, current: str | None, new: str) -> None:
    if user.get("password_hash"):  # Google-only users can set a first password without one
        if not current or not verify_password(current, user["password_hash"]):
            raise AppError(400, "Your current password is incorrect.", "WRONG_PASSWORD")
    _update(db, user, password_hash=hash_password(new))
    revoke_all_sessions(db, user["_id"])


# ---------- Google ----------
def login_with_google(db: Database, info: dict) -> dict:
    email = info["email"].strip().lower()
    user = db["users"].find_one({"google_id": info["sub"]}) or get_user_by_email(db, email)
    if user:
        if not user["is_active"]:
            raise AppError(403, "This account has been disabled.", "ACCOUNT_DISABLED")
        fields: dict = {"is_verified": True}
        if not user["is_verified"]:
            fields["password_hash"] = None  # drop any password set by an unverified (possibly hostile) signup
        if not user.get("google_id"):
            fields["google_id"] = info["sub"]
        if not user.get("avatar_url") and info.get("picture"):
            fields["avatar_url"] = info["picture"]
        return _update(db, user, **fields)
    doc = new_user(info.get("name") or email.split("@")[0], email, None, info["sub"], info.get("picture"), True)
    doc["_id"] = db["users"].insert_one(doc).inserted_id
    return doc
