"""Anti-spam rules for one-time codes (OTPs) sent by email.

Sending a code is limited at four levels:
  1. Cooldown: one code per account and purpose every OTP_RESEND_COOLDOWN_SECONDS (60 s).
  2. Per hour: at most OTP_MAX_PER_HOUR codes per account and purpose (4).
  3. Per day: at most OTP_MAX_PER_DAY codes per account, all purposes together (10).
  4. Site-wide: at most OTP_GLOBAL_DAILY_LIMIT codes in 24 h (280). This keeps
     us under Brevo's free 300 emails/day even if someone floods sign-ups.
On top of that, OTPSendThrottle limits code requests per IP address.

Checking a code is limited too: each code allows OTP_MAX_ATTEMPTS tries (5),
and after OTP_MAX_FAILED_PER_HOUR wrong codes within an hour (10) that step is
locked until those failures are an hour old.

Every limit answers 429 with {"code": "otp_rate_limited", "detail", "retry_after"}
(seconds) and a Retry-After header, so the app can show a countdown.
"""
import math
from datetime import timedelta

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.throttling import SimpleRateThrottle

from .models import EmailOTP


def _human(seconds):
    seconds = max(1, int(math.ceil(seconds)))
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    minutes = math.ceil(seconds / 60)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = math.ceil(minutes / 60)
    return f"{hours} hour{'s' if hours != 1 else ''}"


class OTPLimited(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "otp_rate_limited"

    def __init__(self, message, retry_after):
        self.wait = max(1, int(math.ceil(retry_after)))  # DRF turns this into a Retry-After header
        super().__init__(message)
        # Plain dict (not ErrorDetail strings) so retry_after stays a number in the JSON.
        self.detail = {"code": "otp_rate_limited", "detail": message, "retry_after": self.wait}


class OTPSendThrottle(SimpleRateThrottle):
    """Per-IP limit on requests that email a code (sign-up, resend, password reset)."""

    scope = "otp_send"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def ensure_can_send(user, purpose):
    """Raise OTPLimited if another code may not be emailed right now."""
    now = timezone.now()
    mine = EmailOTP.objects.filter(user=user, purpose=purpose)

    last = mine.order_by("-created_at").values_list("created_at", flat=True).first()
    cooldown = settings.OTP_RESEND_COOLDOWN_SECONDS
    if last and (now - last).total_seconds() < cooldown:
        wait = cooldown - (now - last).total_seconds()
        raise OTPLimited(f"Please wait {_human(wait)} before requesting another code.", wait)

    hour_ago = now - timedelta(hours=1)
    in_hour = list(mine.filter(created_at__gte=hour_ago).order_by("created_at").values_list("created_at", flat=True))
    if len(in_hour) >= settings.OTP_MAX_PER_HOUR:
        wait = (in_hour[0] + timedelta(hours=1) - now).total_seconds()
        raise OTPLimited(f"You've requested too many codes. Try again in {_human(wait)}.", wait)

    day_ago = now - timedelta(days=1)
    in_day = list(
        EmailOTP.objects.filter(user=user, created_at__gte=day_ago).order_by("created_at").values_list("created_at", flat=True)
    )
    if len(in_day) >= settings.OTP_MAX_PER_DAY:
        wait = (in_day[0] + timedelta(days=1) - now).total_seconds()
        raise OTPLimited(f"Daily code limit reached for this account. Try again in {_human(wait)}.", wait)

    if EmailOTP.objects.filter(created_at__gte=day_ago).count() >= settings.OTP_GLOBAL_DAILY_LIMIT:
        raise OTPLimited("We're sending a lot of emails right now. Please try again in an hour.", 3600)


def check_code(user, purpose, code):
    """True if `code` is right (and consumes it). Raises OTPLimited when the account is locked out."""
    now = timezone.now()
    recent = EmailOTP.objects.filter(user=user, purpose=purpose, created_at__gte=now - timedelta(hours=1), attempts__gt=0)
    if (recent.aggregate(n=Sum("attempts"))["n"] or 0) >= settings.OTP_MAX_FAILED_PER_HOUR:
        # Locked until the oldest failed code is more than an hour old.
        oldest = recent.order_by("created_at").values_list("created_at", flat=True).first()
        wait = (oldest + timedelta(hours=1) - now).total_seconds()
        raise OTPLimited(f"Too many incorrect codes. For your security, try again in {_human(wait)}.", wait)
    otp = EmailOTP.latest_active(user, purpose)
    return bool(otp and otp.check_and_consume(code))
