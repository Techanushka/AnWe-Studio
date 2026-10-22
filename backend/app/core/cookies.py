from fastapi import Response

from app.core.config import settings


def _common() -> dict:
    return dict(
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
    )


def set_auth_cookies(response: Response, access: str, refresh: str, remember: bool) -> None:
    response.set_cookie(
        "access_token", access, max_age=settings.ACCESS_TOKEN_MINUTES * 60, path="/", **_common()
    )
    # Refresh cookie is only sent to /auth/* and is a browser-session cookie unless "remember me".
    response.set_cookie(
        "refresh_token",
        refresh,
        max_age=settings.REFRESH_TOKEN_DAYS * 86400 if remember else None,
        path="/auth",
        **_common(),
    )


def clear_auth_cookies(response: Response) -> None:
    domain = settings.COOKIE_DOMAIN or None
    response.delete_cookie("access_token", path="/", domain=domain)
    response.delete_cookie("refresh_token", path="/auth", domain=domain)
