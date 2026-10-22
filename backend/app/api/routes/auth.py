from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import JSONResponse
from pymongo.database import Database
from starlette.background import BackgroundTask

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.cookies import clear_auth_cookies, set_auth_cookies
from app.core.exceptions import AppError
from app.db.mongo import get_db
from app.models.user import to_user_out
from app.schemas.auth import (
    AuthOut,
    ChangePasswordIn,
    EmailOnlyIn,
    LoginIn,
    MessageOut,
    ResetPasswordIn,
    SignupIn,
    UserOut,
    VerifyOtpIn,
)
from app.services import auth_service, email_service, otp_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=201)
def signup(data: SignupIn, bg: BackgroundTasks, db: Database = Depends(get_db)):
    user, code = auth_service.register_user(db, data.name, data.email, data.password)
    bg.add_task(email_service.send_verification_otp, user["email"], user["name"], code)
    return {
        "message": "We’ve emailed you a 6-digit code to verify your email.",
        "requires_verification": True,
        "email": user["email"],
    }


@router.post("/verify-otp", response_model=AuthOut)
def verify_otp(data: VerifyOtpIn, request: Request, response: Response, db: Database = Depends(get_db)):
    user = auth_service.verify_email(db, data.email, data.code)
    access, raw, remember = auth_service.create_session(db, user, True, request.headers.get("user-agent"))
    set_auth_cookies(response, access, raw, remember)
    return {"user": to_user_out(user)}


@router.post("/resend-otp", response_model=MessageOut)
def resend_otp(data: EmailOnlyIn, bg: BackgroundTasks, db: Database = Depends(get_db)):
    user = auth_service.get_user_by_email(db, data.email)
    if user and not user["is_verified"]:
        try:
            code = otp_service.create_otp(db, user)
            bg.add_task(email_service.send_verification_otp, user["email"], user["name"], code)
        except AppError:
            pass  # cooldown: stay silent so the endpoint can't be used to probe accounts
    return {"message": "If that account needs verification, a new code is on its way."}


@router.post("/login", response_model=AuthOut)
def login(data: LoginIn, request: Request, response: Response, db: Database = Depends(get_db)):
    user = auth_service.authenticate(db, data.email, data.password)
    if not user["is_verified"]:
        content = {
            "message": "Please verify your email to continue. We’ve sent you a new code.",
            "code": "EMAIL_NOT_VERIFIED",
            "email": user["email"],
        }
        task = None
        try:
            code = otp_service.create_otp(db, user)
            task = BackgroundTask(email_service.send_verification_otp, user["email"], user["name"], code)
        except AppError:
            content["message"] = "Please verify your email to continue. Check your inbox for the code."
        return JSONResponse(content, status_code=403, background=task)

    access, raw, remember = auth_service.create_session(
        db, user, data.remember, request.headers.get("user-agent")
    )
    set_auth_cookies(response, access, raw, remember)
    return {"user": to_user_out(user)}


@router.post("/logout", response_model=MessageOut)
def logout(request: Request, response: Response, db: Database = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if raw:
        auth_service.revoke_refresh(db, raw)
    clear_auth_cookies(response)
    return {"message": "Logged out."}


@router.post("/refresh", response_model=AuthOut)
def refresh(request: Request, response: Response, db: Database = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    result = auth_service.rotate_refresh(db, raw) if raw else None
    if not result:
        raise AppError(401, "Session expired. Please log in again.", "SESSION_EXPIRED")
    user, access, new_raw, remember = result
    set_auth_cookies(response, access, new_raw, remember)
    return {"user": to_user_out(user)}


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return to_user_out(user)


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(data: EmailOnlyIn, bg: BackgroundTasks, db: Database = Depends(get_db)):
    result = auth_service.create_reset_token(db, data.email)
    if result:
        user, raw = result
        link = f"{settings.FRONTEND_URL}/reset-password?token={raw}"
        bg.add_task(email_service.send_password_reset, user["email"], user["name"], link)
    # Same answer whether or not the account exists (prevents email enumeration).
    return {"message": "If that email has an account, a reset link is on its way."}


@router.post("/reset-password", response_model=MessageOut)
def reset_password(data: ResetPasswordIn, bg: BackgroundTasks, db: Database = Depends(get_db)):
    user = auth_service.reset_password(db, data.token, data.password)
    bg.add_task(email_service.send_password_changed, user["email"], user["name"])
    return {"message": "Your password has been updated. You can log in now."}


@router.post("/change-password", response_model=AuthOut)
def change_password(
    data: ChangePasswordIn,
    request: Request,
    response: Response,
    bg: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Also used to SET a first password for accounts created via Google."""
    auth_service.change_password(db, user, data.current_password, data.new_password)
    access, raw, remember = auth_service.create_session(db, user, True, request.headers.get("user-agent"))
    set_auth_cookies(response, access, raw, remember)
    bg.add_task(email_service.send_password_changed, user["email"], user["name"])
    return {"user": to_user_out(user)}
