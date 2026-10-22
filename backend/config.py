"""All settings come from environment variables (see .env.example)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    """Reads backend/.env (KEY=VALUE lines) without overriding variables already set in the shell."""
    env_file = BASE_DIR / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "anwe.db"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", FRONTEND_URL).split(",") if o.strip()]

MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024
SESSION_DAYS_SHORT = 1          # "Remember me" off: the cookie is a browser-session cookie, server keeps 1 day
SESSION_DAYS_LONG = 30          # "Remember me" on
COOKIE_NAME = "anwe_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1" if FRONTEND_URL.startswith("https") else "0") == "1"
RESET_TOKEN_MINUTES = 30

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}

# Optional: Google sign-in (https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/api/auth/google/callback")

# Optional: SMTP for password-reset emails. Without it the reset link is printed in the server console.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "Anwe Studio <no-reply@anwe.studio>")

# Transcription (faster-whisper). Loaded lazily so the rest of the API works without it.
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "auto")
PRELOAD = os.getenv("PRELOAD", "0") == "1"
