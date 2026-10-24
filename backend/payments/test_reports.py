from datetime import datetime, timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Story

from .access import add_device, device_key
from .models import Subscription

DEVICE = "device-0001-aaaaaaaaaaaa"


def at(day):
    return timezone.make_aware(datetime(2026, 10, day, 12, 0))


class ReportTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.a = Story.objects.create(title="Alpha", price=49, status="published")
        self.b = Story.objects.create(title="Beta", price=100, status="published")

    def sale(self, story, day, **extra):
        defaults = {"status": "paid", "provider": "manual", "amount": story.price, "paid_at": at(day), "reviewed_at": at(day)}
        return Subscription.objects.create(story=story, **{**defaults, **extra})

    def test_sales_report_by_day_month_and_story(self):
        self.sale(self.a, 1)
        self.sale(self.a, 1, reviewed_at=None)  # not checked yet: counted, and shown separately
        self.sale(self.b, 3)
        self.sale(self.b, 3, status="rejected")  # revoked: not counted
        self.client.force_authenticate(self.admin)

        daily = self.client.get("/api/admin/sales/", {"period": "day", "from": "2026-10-01", "to": "2026-10-31"}).data
        self.assertEqual(daily["totals"]["amount"], "198.00")
        self.assertEqual(daily["totals"]["count"], 3)
        self.assertEqual(daily["totals"]["unchecked_amount"], "49.00")
        self.assertEqual(daily["revoked"]["amount"], "100.00")
        self.assertEqual([(r["start"], r["amount"]) for r in daily["series"]], [("2026-10-01", "98.00"), ("2026-10-03", "100.00")])
        self.assertEqual([s["title"] for s in daily["by_story"]], ["Beta", "Alpha"])

        monthly = self.client.get("/api/admin/sales/", {"period": "month", "from": "2026-01-01", "to": "2026-12-31"}).data
        self.assertEqual(monthly["series"], [{"start": "2026-10-01", "count": 3, "amount": "198.00"}])
        one = self.client.get("/api/admin/sales/", {"period": "year", "from": "2026-01-01", "to": "2026-12-31", "story": str(self.a.id)}).data
        self.assertEqual(one["totals"]["amount"], "98.00")

        self.client.force_authenticate(User.objects.create_user(email="r@example.com", password="x"))
        self.assertEqual(self.client.get("/api/admin/sales/").status_code, 403)

    def test_my_purchases_for_guest_device_and_account(self):
        request = type("R", (), {"headers": {"X-Viewer-Id": DEVICE}})
        mine = self.sale(self.a, 1, reference_number="111111", access_code="ABCD-EFGH")
        add_device(mine, device_key(request), "")
        self.sale(self.b, 2, status="rejected", reference_number="222222", admin_note="Not found")
        add_device(Subscription.objects.get(reference_number="222222"), device_key(request), "")
        self.sale(self.b, 3)  # someone else's
        guest = self.client.get("/api/my-purchases/", HTTP_X_VIEWER_ID=DEVICE).data["results"]
        self.assertEqual([(p["story"]["title"], p["state"]) for p in guest], [("Beta", "failed"), ("Alpha", "success")])
        self.assertEqual(guest[0]["message"], "Not found")
        self.assertIsNone(guest[0]["access_code"])
        self.assertEqual(guest[1]["access_code"], "ABCD-EFGH")
        self.assertEqual(self.client.get("/api/my-purchases/").data["results"], [])

        reader = User.objects.create_user(email="r@example.com", password="x")
        Subscription.objects.create(
            user=reader, story=self.a, amount=49, provider="paymongo", status="pending",
        )
        Subscription.objects.filter(user=reader).update(created_at=timezone.now() - timedelta(hours=2))
        self.client.force_authenticate(reader)
        mine = self.client.get("/api/my-purchases/").data["results"]
        self.assertEqual((mine[0]["state"], mine[0]["method"]), ("failed", "Online QR Ph"))

    def test_admin_payment_search(self):
        self.sale(self.a, 1, reference_number="9876543210", payer_name="Lia Cruz", reviewed_at=None)
        self.sale(self.b, 1, reference_number="1111111111", payer_email="ben@example.com", reviewed_at=None)
        self.client.force_authenticate(self.admin)
        find = lambda q: [p["story_title"] for p in self.client.get("/api/admin/payments/manual/", {"status": "all", "q": q}).data["results"]]  # noqa: E731
        self.assertEqual(find("lia"), ["Alpha"])
        self.assertEqual(find("9876 543"), ["Alpha"])
        self.assertEqual(find("ben@"), ["Beta"])
        self.assertEqual(find("beta"), ["Beta"])
