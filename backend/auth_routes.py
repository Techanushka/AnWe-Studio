"""Auth: signup, login, logout, me, forgot/reset password and optional Google sign-in. Cookie sessions (HttpOnly)."""
import json
import secrets
import smtplib
import urllib.parse
import urllib.request
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

import config
import store
from deps import client_ip, require_user
from security import RateLimiter, hash_password, password_problem, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
login_limiter = RateLimiter(limit=8, window=300)      # 8 attempts / 5 min per IP+email
forgot_limiter = RateLimiter(limit=5, window=900)
signup_limiter = RateLimiter(limit=10, window=900)


class SignupBody(BaseModel):
    name: str
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str
    remember: bool = False


class ForgotBody(BaseModel):
    email: str


class ResetBody(BaseModel):
    token: str
    password: str


def valid_email(email: str) -> bool:
    local, _, domain = email.partition("@")
    return bool(local) and "." in domain and len(email) <= 254 and " " not in email and not domain.startswith(".") and not domain.endswith(".")


def start_session(response: Response, user: dict, remember: bool) -> None:
    days = config.SESSION_DAYS_LONG if remember else config.SESSION_DAYS_SHORT
    token = store.create_session(user["id"], days)
    response.set_cookie(config.COOKIE_NAME, token, max_age=days * 86400 if remember else None, httponly=True,
                        samesite="lax", secure=config.COOKIE_SECURE, path="/")


@router.post("/signup", status_code=201)
def signup(body: SignupBody, request: Request, response: Response):
    if not signup_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.")
    name, email = body.name.strip(), body.email.strip().lower()
    if not name or len(name) > 80:
        raise HTTPException(400, "Please tell us your name.")
    if not valid_email(email):
        raise HTTPException(400, "That email doesn’t look quite right.")
    problem = password_problem(body.password)
    if problem:
        raise HTTPException(400, problem)
    if store.get_user_by_email(email):
        raise HTTPException(409, "An account with that email already exists. Try logging in.")
    user = store.create_user(name, email, password_hash=hash_password(body.password))
    start_session(response, user, remember=True)
    return {"user": store.public_user(user)}


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response):
    email = body.email.strip().lower()
    key = f"{client_ip(request)}|{email}"
    if not login_limiter.allow(key):
        raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.")
    user = store.get_user_by_email(email)
    # Always run a hash comparison so response time doesn't reveal whether the email exists.
    ok = verify_password(body.password, user["password_hash"] if user else "scrypt$00$00")
    if not user or not ok:
        raise HTTPException(401, "That email or password doesn’t match. Please try again.")
    login_limiter.reset(key)
    start_session(response, user, remember=body.remember)
    return {"user": store.public_user(user)}


@router.post("/logout")
def logout(request: Request, response: Response):
    store.delete_session(request.cookies.get(config.COOKIE_NAME))
    response.delete_cookie(config.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(require_user)):
    return {"user": store.public_user(user)}


def send_reset_email(to: str, link: str) -> None:
    if not config.SMTP_HOST:
        print(f"\n[anwe] Password reset link for {to} (SMTP not configured, so it is printed here):\n  {link}\n", flush=True)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = config.SMTP_FROM, to, "Reset your Anwe Studio password"
    msg.set_content(f"Use this link to choose a new password (valid for {config.RESET_TOKEN_MINUTES} minutes):\n\n{link}\n\n"
                    "If you didn’t ask for this, you can ignore this email.")
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


@router.post("/forgot-password")
def forgot_password(body: ForgotBody, request: Request):
    email = body.email.strip().lower()
    if not forgot_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
    user = store.get_user_by_email(email)
    if user:  # same response either way, so this can't be used to discover which emails have accounts
        token = store.create_reset_token(user["id"], config.RESET_TOKEN_MINUTES)
        try:
            send_reset_email(user["email"], f"{config.FRONTEND_URL}/reset-password?token={token}")
        except Exception as exc:  # never leak mail errors to the caller
            print(f"[anwe] Could not send reset email: {exc}", flush=True)
    return {"ok": True}


@router.post("/reset-password")
def reset_password(body: ResetBody, request: Request, response: Response):
    problem = password_problem(body.password)
    if problem:
        raise HTTPException(400, problem)
    uid = store.consume_reset_token(body.token)
    if not uid:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    store.set_password(uid, hash_password(body.password))
    user = store.get_user(uid)
    start_session(response, user, remember=False)
    return {"user": store.public_user(user)}


# ---------------- Google sign-in (optional; needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ----------------
def _login_error(code: str) -> RedirectResponse:
    return RedirectResponse(f"{config.FRONTEND_URL}/login?error={code}")


@router.get("/google")
def google_start():
    if not (config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET):
        return _login_error("google_not_configured")
    state = secrets.token_urlsafe(24)
    query = urllib.parse.urlencode({
        "client_id": config.GOOGLE_CLIENT_ID, "redirect_uri": config.GOOGLE_REDIRECT_URI, "response_type": "code",
        "scope": "openid email profile", "state": state, "prompt": "select_account",
    })
    response = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")
    response.set_cookie("anwe_oauth_state", state, max_age=600, httponly=True, samesite="lax", secure=config.COOKIE_SECURE, path="/")
    return response


def _post_form(url: str, data: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    expected = request.cookies.get("anwe_oauth_state", "")
    if error or not code or not expected or not secrets.compare_digest(expected, state):
        return _login_error("google_failed")
    try:
        tokens = _post_form("https://oauth2.googleapis.com/token", {
            "code": code, "client_id": config.GOOGLE_CLIENT_ID, "client_secret": config.GOOGLE_CLIENT_SECRET,
            "redirect_uri": config.GOOGLE_REDIRECT_URI, "grant_type": "authorization_code"})
        req = urllib.request.Request("https://openidconnect.googleapis.com/v1/userinfo",
                                     headers={"Authorization": f"Bearer {tokens['access_token']}"})
        with urllib.request.urlopen(req, timeout=15) as r:
            info = json.loads(r.read())
    except Exception as exc:
        print(f"[anwe] Google sign-in failed: {exc}", flush=True)
        return _login_error("google_failed")
    if not info.get("email") or not info.get("email_verified"):
        return _login_error("google_failed")

    user = store.get_user_by_google(info["sub"]) or store.get_user_by_email(info["email"])
    if user:
        if not user.get("google_sub"):
            store.link_google(user["id"], info["sub"], info.get("picture"))
    else:
        user = store.create_user(info.get("name") or info["email"].split("@")[0], info["email"],
                                 google_sub=info["sub"], avatar_url=info.get("picture"))
    response = RedirectResponse(f"{config.FRONTEND_URL}/dashboard")
    start_session(response, user, remember=True)
    response.delete_cookie("anwe_oauth_state", path="/")
    return response
