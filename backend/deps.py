"""FastAPI dependencies shared by the routers."""
from fastapi import HTTPException, Request

import config
import store


def optional_user(request: Request) -> dict | None:
    return store.user_for_session(request.cookies.get(config.COOKIE_NAME))


def require_user(request: Request) -> dict:
    user = optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    return user


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
