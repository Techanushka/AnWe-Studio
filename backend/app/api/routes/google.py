from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from pymongo.database import Database

from app.core.config import settings
from app.core.cookies import set_auth_cookies
from app.core.exceptions import AppError
from app.db.mongo import get_db
from app.services import auth_service

router = APIRouter(prefix="/auth/google", tags=["google"])

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/login")
async def google_login(request: Request):
    """Point VITE_GOOGLE_AUTH_URL at this endpoint."""
    if not settings.GOOGLE_CLIENT_ID:
        raise AppError(503, "Google sign-in isn’t configured.", "GOOGLE_NOT_CONFIGURED")
    return await oauth.google.authorize_redirect(request, settings.GOOGLE_REDIRECT_URI)


@router.get("/callback")
async def google_callback(request: Request, db: Database = Depends(get_db)):
    fail = RedirectResponse(f"{settings.FRONTEND_URL}/login?error=google_failed", status_code=302)
    try:
        token = await oauth.google.authorize_access_token(request)
        info = token.get("userinfo")
        if not info or not info.get("email") or not info.get("email_verified"):
            return fail
        user = auth_service.login_with_google(db, dict(info))
    except Exception:
        return fail

    access, raw, remember = auth_service.create_session(db, user, True, request.headers.get("user-agent"))
    resp = RedirectResponse(settings.DASHBOARD_URL, status_code=302)
    set_auth_cookies(resp, access, raw, remember)
    return resp
