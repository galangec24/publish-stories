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
    "verify_email": "Your Publish Stories verification code",
    "reset_password": "Your Publish Stories password reset code",
    "change_email": "Confirm your new email for Publish Stories",
}
_INTROS = {
    "verify_email": "Use this code to verify your email address:",
    "reset_password": "Use this code to reset your password:",
    "change_email": "Use this code to confirm this is your new email address:",
}

_HTML = """\
<!doctype html><html><body style="margin:0;background:#f4f1fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b1630">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:480px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(27,22,48,.08)">
<tr><td style="background:#0e0b1a;padding:22px 28px;color:#f3eefe;font-size:20px;font-weight:700;font-family:Georgia,serif">
Publish <span style="color:#f5b942">Stories</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:16px">Hi {name},</p>
<p style="margin:0 0 20px;font-size:15px;color:#4a4560">{intro}</p>
<p style="margin:0 0 20px;text-align:center">
<span style="display:inline-block;padding:14px 22px;border-radius:12px;background:#f4f1fb;border:1px solid #e0daf0;
font-size:32px;font-weight:700;letter-spacing:10px;color:#1b1630">{code}</span></p>
<p style="margin:0;font-size:13px;color:#6b6488">{footer}</p>
</td></tr></table></td></tr></table></body></html>"""


def send_otp_email(user, purpose, code, to_email=None):
    """Email a one-time code. `to_email` overrides the recipient (new address for email changes)."""
    template_id = {
        "verify_email": settings.BREVO_VERIFY_TEMPLATE_ID,
        "reset_password": settings.BREVO_RESET_TEMPLATE_ID,
        "change_email": "",
    }[purpose]
    minutes = settings.OTP_TTL_MINUTES
    name = user.first_name or user.display_name or user.email
    intro = _INTROS[purpose]
    footer = f"It expires in {minutes} minutes. If you didn't request this, you can ignore this email."
    send_email(
        to_email=to_email or user.email,
        to_name=user.display_name,
        subject=_SUBJECTS[purpose],
        template_id=template_id or None,
        params={"code": code, "name": name, "minutes": minutes},
        text=f"Hi {name},\n\n{intro} {code}\n\n{footer}",
        html=_HTML.format(name=escape(name), intro=intro, code=code, footer=footer),
    )
