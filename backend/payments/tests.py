import hashlib
import hmac
import json
import time
from unittest import mock

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Story

from .models import PaymentLog, Subscription

SECRET = "whsk_test"


def signed_headers(body, secret=SECRET):
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return {"HTTP_PAYMONGO_SIGNATURE": f"t={ts},te={sig},li="}


@override_settings(PAYMONGO_WEBHOOK_SECRET=SECRET, PAYMONGO_LIVE_MODE=False)
class PaymentTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="r@example.com", password="x", email_verified=True)
        self.story = Story.objects.create(title="Paid", price=49, status="published")
        self.client.force_authenticate(self.user)

    def subscribe(self):
        with mock.patch("payments.views.create_checkout_session", return_value=("cs_1", "https://pay.example/cs_1")):
            return self.client.post(f"/api/subscribe/{self.story.id}/")

    def webhook(self, body, headers):
        return self.client.post("/api/webhook/paymongo/", data=body, content_type="application/json", **headers)

    def paid_event(self):
        return json.dumps(
            {"data": {"attributes": {"type": "checkout_session.payment.paid", "data": {"id": "cs_1", "attributes": {}}}}}
        ).encode()

    def test_full_unlock_flow_is_idempotent(self):
        response = self.subscribe()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["checkout_url"], "https://pay.example/cs_1")

        body = self.paid_event()
        self.assertEqual(self.webhook(body, signed_headers(body)).data["status"], "paid")
        self.assertEqual(self.webhook(body, signed_headers(body)).data["status"], "duplicate")
        self.assertEqual(Subscription.objects.get().status, "paid")
        self.assertEqual(PaymentLog.objects.count(), 2)

        self.assertFalse(self.client.get(f"/api/stories/{self.story.slug}/").data["locked"])
        self.assertEqual(self.subscribe().status_code, 400)

    def test_bad_signature_rejected(self):
        self.subscribe()
        body = self.paid_event()
        response = self.webhook(body, signed_headers(body, secret="wrong"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subscription.objects.get().status, "pending")

    def test_free_story_cannot_be_bought(self):
        free = Story.objects.create(title="Free", price=0, status="published")
        self.assertEqual(self.client.post(f"/api/subscribe/{free.id}/").status_code, 400)
