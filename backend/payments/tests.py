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

    def test_guest_checkout_unlocks_their_device(self):
        self.client.force_authenticate(None)
        guest = {"HTTP_X_VIEWER_ID": "guest-device-0001-aaaa", "HTTP_X_FORWARDED_FOR": "49.145.10.20"}
        with mock.patch("payments.views.create_checkout_session", return_value=("cs_1", "https://pay.example/cs_1")):
            response = self.client.post(f"/api/subscribe/{self.story.id}/", **guest)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertRegex(response.data["access_code"], r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.assertFalse(self.client.get(f"/api/stories/{self.story.slug}/", **guest).data["has_access"])

        body = self.paid_event()
        self.assertEqual(self.webhook(body, signed_headers(body)).data["status"], "paid")
        self.assertTrue(self.client.get(f"/api/stories/{self.story.slug}/", **guest).data["has_access"])
        self.assertFalse(self.client.get(f"/api/stories/{self.story.slug}/", HTTP_X_VIEWER_ID="someone-else-0002-bbbb").data["has_access"])

    def test_bad_signature_rejected(self):
        self.subscribe()
        body = self.paid_event()
        response = self.webhook(body, signed_headers(body, secret="wrong"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subscription.objects.get().status, "pending")

    def test_free_story_cannot_be_bought(self):
        free = Story.objects.create(title="Free", price=0, status="published")
        self.assertEqual(self.client.post(f"/api/subscribe/{free.id}/").status_code, 400)


class AdminMonitoringTests(APITestCase):
    def setUp(self):
        from catalog.models import StoryView

        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.story = Story.objects.create(title="Paid", price=49, status="published")
        self.free = Story.objects.create(title="Free", price=0, status="published")
        self.reader = User.objects.create_user(email="reader@example.com", password="x", first_name="Lia")
        self.payer = User.objects.create_user(email="payer@example.com", password="x")
        for user, story in [(self.reader, self.story), (self.payer, self.story), (self.reader, self.free)]:
            StoryView.objects.create(story=story, viewer_key=f"k{user.pk}", user=user, date="2026-10-20")
        StoryView.objects.create(story=self.story, viewer_key="guest", date="2026-10-20")
        Subscription.objects.create(user=self.payer, story=self.story, amount=49, status="paid")
        Subscription.objects.create(user=self.reader, story=self.story, amount=49, status="pending")
        self.client.force_authenticate(self.admin)

    def test_unpaid_readers_lists_only_signed_in_non_payers_of_paid_stories(self):
        data = self.client.get("/api/admin/payments/unpaid-readers/").data
        self.assertEqual(data["count"], 1)
        row = data["results"][0]
        self.assertEqual((row["user"]["first_name"], row["user"]["email"]), ("Lia", "reader@example.com"))
        self.assertEqual(row["story"]["title"], "Paid")
        self.assertTrue(row["checkout_started"])
        self.assertEqual(data["guest_readers"], 1)

    def test_pending_checkouts(self):
        data = self.client.get("/api/admin/payments/pending/").data
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["user"]["email"], "reader@example.com")

    def test_admin_only(self):
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get("/api/admin/payments/unpaid-readers/").status_code, 403)
