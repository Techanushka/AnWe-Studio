import logging
import smtplib
from email.message import EmailMessage
from html import escape

from app.core.config import settings

logger = logging.getLogger("anwe.email")


def _send(to: str, subject: str, text: str, html: str) -> None:
    if not settings.SMTP_HOST:
        # Dev mode: no SMTP configured, print to console so you can copy the OTP / link.
        print(f"\n=== DEV EMAIL to={to} | {subject} ===\n{text}\n===========================\n")
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.EMAIL_FROM, to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
    except Exception:
        logger.exception("Failed to send email to %s", to)


def _wrap(body: str) -> str:
    return (
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;'
        f'color:#1f1f2e">{body}<p style="color:#888;font-size:12px;margin-top:32px">'
        "Anwe Studio</p></div>"
    )


def send_verification_otp(email: str, name: str, code: str) -> None:
    minutes = settings.OTP_EXPIRE_MINUTES
    text = f"Hi {name},\n\nYour Anwe Studio verification code is {code}.\nIt expires in {minutes} minutes."
    html = _wrap(
        f"<h2>Verify your email</h2><p>Hi {escape(name)}, use this code to finish signing up:</p>"
        f'<p style="font-size:32px;letter-spacing:8px;font-weight:bold">{code}</p>'
        f"<p>It expires in {minutes} minutes. If this wasn’t you, ignore this email.</p>"
    )
    _send(email, "Your Anwe Studio verification code", text, html)


def send_password_reset(email: str, name: str, link: str) -> None:
    minutes = settings.RESET_TOKEN_MINUTES
    text = f"Hi {name},\n\nReset your password: {link}\nThis link expires in {minutes} minutes."
    html = _wrap(
        f"<h2>Reset your password</h2><p>Hi {escape(name)}, click below to choose a new password.</p>"
        f'<p><a href="{link}" style="background:#8b7cff;color:#fff;padding:12px 20px;'
        'border-radius:8px;text-decoration:none">Reset password</a></p>'
        f"<p>This link expires in {minutes} minutes. If you didn’t ask for this, ignore this email.</p>"
    )
    _send(email, "Reset your Anwe Studio password", text, html)


def send_password_changed(email: str, name: str) -> None:
    text = f"Hi {name},\n\nYour Anwe Studio password was just changed. If this wasn’t you, reset it immediately."
    html = _wrap(
        f"<h2>Password changed</h2><p>Hi {escape(name)}, your password was just changed. "
        "If this wasn’t you, reset it immediately.</p>"
    )
    _send(email, "Your password was changed", text, html)
