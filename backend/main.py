"""
Anwe Studio API (FastAPI).

  Auth      POST /auth/signup  /auth/login  /auth/logout  /auth/forgot-password  /auth/reset-password   GET /auth/me  /auth/google
  Projects  GET/POST /projects   GET/PATCH/DELETE /projects/{id}   POST /projects/{id}/duplicate
            PUT /projects/{id}/transcript   PUT /projects/{id}/state   GET /projects/{id}/video  /projects/{id}/thumbnail
  Other     GET /exports   POST /transcribe (optional, needs faster-whisper)   GET /health

Run:  uvicorn main:app --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from auth_routes import router as auth_router
from db import init_db
from project_routes import router as project_router
from transcribe_routes import get_model, router as transcribe_router, whisper_available


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if config.PRELOAD and whisper_available():
        get_model()
    yield


app = FastAPI(title="Anwe Studio API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.ORIGINS, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


# The frontend reads `message` from error bodies.
@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException):
    return JSONResponse({"message": str(exc.detail), "detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _exc: RequestValidationError):
    return JSONResponse({"message": "Please check the details you entered and try again."}, status_code=422)


app.include_router(auth_router)
app.include_router(project_router)
app.include_router(transcribe_router)


@app.get("/health")
def health():
    return {"ok": True, "transcription": whisper_available(), "model": config.WHISPER_MODEL}
