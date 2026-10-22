from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Anwe Studio API"
    ENV: str = "development"
    SECRET_KEY: str
    MONGODB_URI: str
    MONGODB_DB: str = "anwe_studio"

    FRONTEND_URL: str = "http://localhost:5173"
    DASHBOARD_URL: str = "http://localhost:5173/dashboard"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Tokens / sessions
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 30          # "Remember me" ticked
    SHORT_SESSION_DAYS: int = 1           # "Remember me" not ticked (browser-session cookie)
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str = ""

    # OTP / reset links
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_SECONDS: int = 60
    RESET_TOKEN_MINUTES: int = 30

    # Brute-force protection
    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM: str = "Anwe Studio <no-reply@anwe.studio>"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
