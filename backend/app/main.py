from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import auth, google
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.db import mongo


@asynccontextmanager
async def lifespan(_: FastAPI):
    mongo.init_indexes()  # creates unique + TTL indexes in Atlas (idempotent)
    yield


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

# Session cookie is only used by authlib to hold the Google OAuth `state`.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=settings.COOKIE_SECURE,
    max_age=600,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_exception_handlers(app)
app.include_router(auth.router)
app.include_router(google.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
