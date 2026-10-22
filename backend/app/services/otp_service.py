from datetime import timedelta

from pymongo.database import Database

from app.core.clock import utcnow
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import generate_otp, hash_token, safe_equal

VERIFY_EMAIL = "verify_email"


def _latest(db: Database, user_id, purpose: str) -> dict | None:
    return db["otps"].find_one({"user_id": user_id, "purpose": purpose}, sort=[("created_at", -1)])


def create_otp(db: Database, user: dict, purpose: str = VERIFY_EMAIL) -> str:
    now = utcnow()
    last = _latest(db, user["_id"], purpose)
    if last:
        wait = settings.OTP_RESEND_SECONDS - (now - last["created_at"]).total_seconds()
        if wait > 0:
            raise AppError(429, f"Please wait {int(wait) + 1}s before requesting another code.", "OTP_COOLDOWN")
    db["otps"].delete_many({"user_id": user["_id"], "purpose": purpose})
    code = generate_otp()
    db["otps"].insert_one({
        "user_id": user["_id"],
        "purpose": purpose,
        "code_hash": hash_token(f"{purpose}:{code}"),
        "attempts": 0,
        "expires_at": now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        "created_at": now,
    })
    return code


def verify_otp(db: Database, user: dict, code: str, purpose: str = VERIFY_EMAIL) -> None:
    row = _latest(db, user["_id"], purpose)
    if not row or row["expires_at"] < utcnow():
        raise AppError(400, "That code has expired. Please request a new one.", "OTP_EXPIRED")
    if row["attempts"] >= settings.OTP_MAX_ATTEMPTS:
        db["otps"].delete_one({"_id": row["_id"]})
        raise AppError(429, "Too many wrong attempts. Please request a new code.", "OTP_LOCKED")
    if not safe_equal(row["code_hash"], hash_token(f"{purpose}:{code}")):
        db["otps"].update_one({"_id": row["_id"]}, {"$inc": {"attempts": 1}})
        raise AppError(400, "That code isn’t correct. Please try again.", "OTP_INVALID")
    db["otps"].delete_one({"_id": row["_id"]})
