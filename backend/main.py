
"""
Anwe Studio API (FastAPI).

Auth:
  POST /auth/signup
  POST /auth/login
  POST /auth/logout
  POST /auth/forgot-password
  POST /auth/reset-password
  GET  /auth/me
  GET  /auth/google/login
  GET  /auth/google/callback

Projects:
  GET/POST /projects
  GET/PATCH/DELETE /projects/{id}
  POST /projects/{id}/duplicate
  PUT /projects/{id}/transcript
  PUT /projects/{id}/state
  GET /projects/{id}/video
  GET /projects/{id}/thumbnail

Other:
  GET /exports
  GET /dashboard/analytics; POST /projects/{id}/ai/{summary,chat,edit-proposal,apply-edit}
  POST /projects/{id}/ai/highlights   (Feature 6)
  POST /transcribe
  GET /health

Run:
  python -m uvicorn main:app --app-dir backend --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

import config
from auth_routes import router as auth_router
from db import init_db
from project_routes import router as project_router
from ai_routes import router as ai_router
from highlight_routes import router as highlight_router  # [AI] Feature 6
from transcribe_routes import (
    get_model,
    router as transcribe_router,
    whisper_available,
)

# Google OAuth router from the newer backend package.
from app.core.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize the database and optionally preload transcription."""
    init_db()

    if config.PRELOAD and whisper_available():
        get_model()

    yield


app = FastAPI(
    title="Anwe Studio API",
    lifespan=lifespan,
)

# Required for Google OAuth state/session handling.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=settings.COOKIE_SECURE,
    max_age=600,
)

# Keep the existing frontend CORS configuration.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        {"message": str(exc.detail), "detail": exc.detail},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(
    _request: Request,
    _exc: RequestValidationError,
):
    return JSONResponse(
        {"message": "Please check the details you entered and try again."},
        status_code=422,
    )


# Existing routes - keep these for the current auth and Supabase storage.
app.include_router(auth_router)
app.include_router(project_router)
app.include_router(ai_router)
app.include_router(highlight_router)  # [AI] Feature 6: POST /projects/{id}/ai/highlights
app.include_router(transcribe_router)

# Google OAuth routes:
# GET /auth/google/login
# GET /auth/google/callback
@app.get("/health", tags=["meta"])
def health():
    return {
        "ok": True,
        "transcription": whisper_available(),
        "model": config.WHISPER_MODEL,
    }
