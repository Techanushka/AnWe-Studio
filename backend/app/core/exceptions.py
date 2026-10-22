from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, message: str, code: str = "ERROR"):
        self.status_code = status_code
        self.message = message
        self.code = code


def _json(status: int, message: str, code: str) -> JSONResponse:
    # The React authService reads `data.message`, so every error uses this shape.
    return JSONResponse(status_code=status, content={"message": message, "code": code})


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError):
        return _json(exc.status_code, exc.message, exc.code)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        return _json(exc.status_code, str(exc.detail), "HTTP_ERROR")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        loc = [str(p) for p in first.get("loc", [])]
        if "email" in loc:
            message = "That email doesn’t look quite right."
        else:
            message = str(first.get("msg", "Invalid input.")).removeprefix("Value error, ")
        return _json(422, message, "VALIDATION_ERROR")
