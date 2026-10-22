"""Password hashing (scrypt), session/reset tokens and a tiny login rate limiter. Standard library only."""
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque

_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("scrypt$"):
        return False
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P, dklen=32)
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except ValueError:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Only the hash of a session/reset token is stored, so a leaked database can't be used to log in."""
    return hashlib.sha256(token.encode()).hexdigest()


class RateLimiter:
    """Allows `limit` hits per `window` seconds per key (in memory, per process)."""

    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self, key: str) -> None:
        self.hits.pop(key, None)


def password_problem(password: str) -> str:
    """Same rule the signup form shows: 8+ chars with at least 3 of: mixed case, number, symbol."""
    if len(password) < 8:
        return "Use at least 8 characters."
    score = sum([
        any(c.islower() for c in password) and any(c.isupper() for c in password),
        any(c.isdigit() for c in password),
        any(not c.isalnum() for c in password),
    ]) + 1
    return "" if score >= 3 else "Add upper & lower case letters, a number or a symbol."
