
import logging

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from pymongo.database import Database

from app.core.config import settings
from app.core.cookies import set_auth_cookies
from app.core.exceptions import AppError
from app.db.mongo import get_db
from app.services import auth_service


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth/google",
    tags=["google"],
)

oauth = OAuth()

oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url=(
        "https://accounts.google.com/.well-known/openid-configuration"
    ),
    client_kwargs={
        "scope": "openid email profile",
    },
)


@router.get("/login")
async def google_login(request: Request):
    """Redirect the user to Google's sign-in page."""

    if (
        not settings.GOOGLE_CLIENT_ID
        or not settings.GOOGLE_CLIENT_SECRET
    ):
        raise AppError(
            503,
            "Google sign-in is not configured.",
            "GOOGLE_NOT_CONFIGURED",
        )

    return await oauth.google.authorize_redirect(
        request,
        settings.GOOGLE_REDIRECT_URI,
    )


@router.get("/callback")
async def google_callback(
    request: Request,
    db: Database = Depends(get_db),
):
    """Verify Google's response and establish an authenticated session."""

    fail_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}"
        "/login?error=google_failed"
    )

    try:
        token = await oauth.google.authorize_access_token(request)

        info = token.get("userinfo")

        if not info:
            logger.error("Google OAuth failed: userinfo is missing.")
            return RedirectResponse(url=fail_url, status_code=302)

        email = info.get("email")

        if not email:
            logger.error("Google OAuth failed: email is missing.")
            return RedirectResponse(url=fail_url, status_code=302)

        if info.get("email_verified") is not True:
            logger.error(
                "Google OAuth failed: Google email is not verified."
            )
            return RedirectResponse(url=fail_url, status_code=302)

        user = auth_service.login_with_google(
            db,
            dict(info),
        )

    except Exception:
        logger.exception(
            "Google OAuth callback or user lookup failed."
        )
        return RedirectResponse(url=fail_url, status_code=302)

    try:
        access, raw, remember = auth_service.create_session(
            db,
            user,
            True,
            request.headers.get("user-agent"),
        )

        response = RedirectResponse(
            url=settings.DASHBOARD_URL,
            status_code=302,
        )

        set_auth_cookies(
            response,
            access,
            raw,
            remember,
        )

        logger.info(
            "Google OAuth session created and cookies configured."
        )

        return response

    except Exception:
        logger.exception(
            "Google OAuth session creation or cookie setup failed."
        )
        return RedirectResponse(url=fail_url, status_code=302)
