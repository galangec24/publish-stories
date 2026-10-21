"""PayMongo Hosted Checkout (QR Ph) and webhook signature verification."""
import hashlib
import hmac
import time
from decimal import Decimal

import requests
from django.conf import settings

API_BASE = "https://api.paymongo.com/v1"


class PayMongoError(Exception):
    pass


def create_checkout_session(*, subscription, story):
    if not settings.PAYMONGO_SECRET_KEY:
        raise PayMongoError("PAYMONGO_SECRET_KEY is not configured")
    centavos = int((Decimal(story.price) * 100).quantize(Decimal("1")))
    return_url = f"{settings.FRONTEND_BASE_URL}/stories/{story.slug}"
    payload = {
        "data": {
            "attributes": {
                "line_items": [{"currency": "PHP", "amount": centavos, "name": story.title[:255], "quantity": 1}],
                "payment_method_types": ["qrph"],
                "description": f"Unlock: {story.title}"[:255],
                "reference_number": str(subscription.pk),
                "metadata": {"subscription_id": str(subscription.pk), "story_id": str(story.pk)},
                "success_url": f"{return_url}?payment=success",
                "cancel_url": f"{return_url}?payment=cancelled",
                "send_email_receipt": True,
                "show_line_items": True,
            }
        }
    }
    try:
        response = requests.post(
            f"{API_BASE}/checkout_sessions",
            json=payload,
            auth=(settings.PAYMONGO_SECRET_KEY, ""),
            timeout=15,
        )
    except requests.RequestException as exc:
        raise PayMongoError(str(exc)) from exc
    if response.status_code >= 300:
        raise PayMongoError(f"PayMongo responded with {response.status_code}: {response.text[:300]}")
    data = response.json()["data"]
    return data["id"], data["attributes"]["checkout_url"]


def verify_signature(raw_body, header):
    """Check the Paymongo-Signature header: "t=<ts>,te=<test sig>,li=<live sig>".

    The signature is HMAC-SHA256 over "<ts>.<raw body>" keyed with the webhook secret.
    """
    secret = settings.PAYMONGO_WEBHOOK_SECRET
    if not secret or not header:
        return False
    parts = dict(item.split("=", 1) for item in header.split(",") if "=" in item)
    timestamp = parts.get("t", "")
    expected_sig = parts.get("li" if settings.PAYMONGO_LIVE_MODE else "te", "")
    if not timestamp.isdigit() or not expected_sig:
        return False
    if abs(time.time() - int(timestamp)) > settings.PAYMONGO_WEBHOOK_TOLERANCE_SECONDS:
        return False
    signed = timestamp.encode() + b"." + raw_body
    computed = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected_sig)
