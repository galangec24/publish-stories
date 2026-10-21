"""Thin client for Brevo's transactional email API (POST /v3/smtp/email)."""
import logging
from html import escape

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


class EmailSendError(Exception):
    pass


def send_email(*, to_email, to_name="", subject="", html="", text="", template_id=None, params=None):
    if not settings.BREVO_API_KEY:
        if settings.DEBUG:
            # Local development without a Brevo key: log instead of sending.
            logger.warning("BREVO_API_KEY not set; email to %s not sent:\n%s", to_email, text or params)
            return
        raise EmailSendError("BREVO_API_KEY is not configured")

    recipient = {"email": to_email}
    if to_name:
        recipient["name"] = to_name
    payload = {
        "sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
        "to": [recipient],
    }
    if template_id:
        payload["templateId"] = int(template_id)
        payload["params"] = params or {}
    else:
        payload.update(subject=subject, htmlContent=html, textContent=text)

    try:
        response = requests.post(
            BREVO_SEND_URL,
            json=payload,
            headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise EmailSendError(str(exc)) from exc
    if response.status_code >= 300:
        logger.error("Brevo send failed (%s): %s", response.status_code, response.text[:500])
        raise EmailSendError(f"Brevo responded with {response.status_code}")


_SUBJECTS = {
    "verify_email": "Your verification code",
    "reset_password": "Your password reset code",
}
_INTROS = {
    "verify_email": "Use this code to verify your email address:",
    "reset_password": "Use this code to reset your password:",
}


def send_otp_email(user, purpose, code):
    template_id = {
        "verify_email": settings.BREVO_VERIFY_TEMPLATE_ID,
        "reset_password": settings.BREVO_RESET_TEMPLATE_ID,
    }[purpose]
    minutes = settings.OTP_TTL_MINUTES
    name = user.display_name or user.email
    intro = _INTROS[purpose]
    footer = f"It expires in {minutes} minutes. If you didn't request this, you can ignore this email."
    send_email(
        to_email=user.email,
        to_name=user.display_name,
        subject=_SUBJECTS[purpose],
        template_id=template_id or None,
        params={"code": code, "name": name, "minutes": minutes},
        text=f"Hi {name},\n\n{intro} {code}\n\n{footer}",
        html=(
            f"<p>Hi {escape(name)},</p><p>{intro}</p>"
            f'<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{code}</p>'
            f"<p>{footer}</p>"
        ),
    )
