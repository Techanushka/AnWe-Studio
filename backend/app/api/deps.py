from fastapi import Depends, Request, Response
from pymongo.database import Database

from app.core.cookies import set_auth_cookies
from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.mongo import get_db
from app.services import auth_service


def get_current_user(request: Request, response: Response, db: Database = Depends(get_db)) -> dict:
    """Use on any protected route (e.g. your AI endpoints): `user = Depends(get_current_user)`."""
    user = None
    token = request.cookies.get("access_token")
    uid = decode_access_token(token) if token else None
    if uid:
        user = auth_service.get_user_by_id(db, uid)

    if not user:  # access token missing/expired -> silently refresh if refresh cookie is present
        raw = request.cookies.get("refresh_token")
        result = auth_service.rotate_refresh(db, raw) if raw else None
        if result:
            user, access, new_raw, remember = result
            set_auth_cookies(response, access, new_raw, remember)

    if not user or not user["is_active"] or not user["is_verified"]:
        raise AppError(401, "Not authenticated.", "NOT_AUTHENTICATED")
    return user
