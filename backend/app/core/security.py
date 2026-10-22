import base64
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

import bcrypt
import jwt

from app.core.clock import utcnow
from app.core.config import settings

ALGORITHM = "HS256"


# ---------- Passwords ----------
def _prehash(password: str) -> bytes:
    # bcrypt only reads 72 bytes; pre-hashing makes long passphrases safe.
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), hashed.encode())
    except ValueError:
        return False


DUMMY_HASH = hash_password("dummy-password-for-timing")


def validate_password_strength(password: str) -> str:
    """Mirrors the frontend rule: 8+ chars and at least 2 of (mixed case, digit, symbol)."""
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")
    checks = [
        bool(re.search(r"[a-z]", password) and re.search(r"[A-Z]", password)),
        bool(re.search(r"\d", password)),
        bool(re.search(r"[^A-Za-z0-9]", password)),
    ]
    if sum(checks) < 2:
        raise ValueError("Add upper & lower case letters, a number or a symbol.")
    return password


# ---------- JWT access token ----------
def create_access_token(user_id: str) -> str:
    now = utcnow()
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return str(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# ---------- Random tokens / OTP ----------
def generate_otp() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(value: str) -> str:
    """Keyed hash so DB leaks don't expose usable OTPs / refresh / reset tokens."""
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
