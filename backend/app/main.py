
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import auth, google, projects
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.db import mongo


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize database indexes when the application starts."""
    mongo.init_indexes()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
)

# Session middleware is required for OAuth state handling.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
    https_only=settings.COOKIE_SECURE,
    max_age=600,
)

# Allow requests from configured frontend origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register centralized exception handlers.
register_exception_handlers(app)

# Register API routes.
app.include_router(auth.router)
app.include_router(google.router)
app.include_router(projects.router)


@app.get("/health", tags=["meta"])
def health():
    """Check whether the backend is running."""
    return {"status": "ok"}
