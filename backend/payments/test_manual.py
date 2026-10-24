import io

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Chapter, Story

from .models import PaymentMethod, Subscription

HOME = "49.145.10.20"  # a home connection
CAFE = "112.198.5.6"


def device(n):
    return f"device-{n:04d}-aaaaaaaaaaaa"


def png():
    out = io.BytesIO()
    Image.new("RGB", (40, 60), "white").save(out, "PNG")
    return SimpleUploadedFile("receipt.png", out.getvalue(), content_type="image/png")


@override_settings(ACCESS_MAX_DEVICES=3)
class ManualPaymentTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.story = Story.objects.create(title="Paid", price=49, free_chapters=1, status="published")
        for i in range(3):
            Chapter.objects.create(story=self.story, title=f"C{i}", order=i, content=[{"insert": f"text {i}\n"}], word_count=2)
        self.gcash = PaymentMethod.objects.create(name="GCash", qr_url="https://example.com/qr.webp")
        self.url = f"/api/stories/{self.story.slug}/"

    def read(self, dev, ip=HOME, **extra):
        return self.client.get(self.url, HTTP_X_VIEWER_ID=dev, HTTP_X_FORWARDED_FOR=ip, **extra).data

    def pay(self, dev=device(1), ip=HOME, reference="1234567890123", **fields):
        return self.client.post(
            "/api/payments/manual/",
            {"story": self.story.id, "method": self.gcash.id, "reference": reference, **fields},
            HTTP_X_VIEWER_ID=dev,
            HTTP_X_FORWARDED_FOR=ip,
        )

    def approve(self, purchase_id):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/admin/payments/manual/{purchase_id}/approve/")
        self.client.force_authenticate(None)
        return response

    def test_guest_pays_then_reads_on_same_device_and_same_wifi(self):
        self.assertEqual(self.client.get("/api/payment-methods/").data["methods"][0]["name"], "GCash")
        response = self.pay(payer_name="Lia", proof=png())
        self.assertEqual(response.status_code, 201, response.data)
        purchase = response.data["purchase"]
        self.assertEqual(purchase["status"], "pending")
        self.assertRegex(purchase["access_code"], r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.assertEqual(self.admin.notifications.filter(kind="payment_submitted").count(), 1)

        # Waiting for the author: still locked, but the page knows about the payment.
        data = self.read(device(1))
        self.assertTrue(data["locked"])
        self.assertEqual(data["purchase"]["status"], "pending")
        self.assertEqual(self.pay(reference="999999").status_code, 400)  # one pending payment at a time

        self.client.force_authenticate(self.admin)
        listing = self.client.get("/api/admin/payments/manual/").data
        self.assertEqual(listing["pending_count"], 1)
        self.assertTrue(listing["results"][0]["has_proof"])
        proof = self.client.get(f"/api/admin/payments/manual/{purchase['id']}/proof/")
        self.assertEqual(proof["Content-Type"], "image/webp")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/admin/payments/manual/{purchase['id']}/proof/").status_code, 401)

        self.assertEqual(self.approve(purchase["id"]).data["status"], "paid")
        self.assertFalse(self.read(device(1))["locked"])
        self.assertFalse(self.read(device(1), ip=CAFE)["locked"])  # the paying device works anywhere
        self.assertTrue(self.read(device(2), ip=CAFE)["locked"])  # a stranger at the cafe doesn't get in

        # The family laptop at home gets in without an account, and keeps access when it leaves.
        self.assertFalse(self.read(device(3))["locked"])
        self.assertFalse(self.read(device(3), ip=CAFE)["locked"])

    def test_network_sharing_stops_at_the_device_cap(self):
        purchase = self.pay().data["purchase"]
        self.approve(purchase["id"])
        self.read(device(1))
        self.assertFalse(self.read(device(2))["locked"])
        self.assertFalse(self.read(device(3))["locked"])
        self.assertTrue(self.read(device(4))["locked"])  # cap is 3 in this test

    def test_access_code_unlocks_another_device_and_links_to_account(self):
        purchase = self.pay().data["purchase"]
        code = purchase["access_code"]
        claim = lambda dev, c=code: self.client.post(  # noqa: E731
            "/api/access/claim/", {"code": c}, format="json", HTTP_X_VIEWER_ID=dev, HTTP_X_FORWARDED_FOR=CAFE
        )
        self.assertIn("being checked", str(claim(device(5)).data))
        self.approve(purchase["id"])
        self.assertEqual(claim(device(5), code.lower().replace("-", " ")).status_code, 200)  # forgiving typing
        self.assertFalse(self.read(device(5), ip=CAFE)["locked"])
        self.assertEqual(claim(device(6), "AAAA-AAAA").status_code, 400)

        reader = User.objects.create_user(email="r@example.com", password="x", email_verified=True)
        self.client.force_authenticate(reader)
        self.assertEqual(claim(device(6)).status_code, 200)
        self.assertEqual(Subscription.objects.get().user, reader)
        self.assertFalse(self.client.get(self.url).data["locked"])  # now on every device they sign in to

    def test_reference_reuse_reject_and_validation(self):
        self.assertEqual(self.pay(reference="ab").status_code, 400)
        purchase = self.pay().data["purchase"]
        self.assertIn("reference", self.pay(dev=device(9), reference="1234567890123").data)

        self.client.force_authenticate(self.admin)
        rejected = self.client.post(f"/api/admin/payments/manual/{purchase['id']}/reject/", {"note": "Not found"}, format="json")
        self.assertEqual(rejected.data["status"], "rejected")
        self.client.force_authenticate(None)
        data = self.read(device(1))
        self.assertTrue(data["locked"])
        self.assertEqual(data["purchase"]["admin_note"], "Not found")
        self.assertEqual(self.pay(reference="77777777").status_code, 201)  # can try again

    def test_signed_in_payment_unlocks_account_and_notifies(self):
        reader = User.objects.create_user(email="r@example.com", password="x", first_name="Rey", email_verified=True)
        self.client.force_authenticate(reader)
        purchase = self.pay().data["purchase"]
        self.approve(purchase["id"])
        self.client.force_authenticate(reader)
        self.assertFalse(self.client.get(self.url, HTTP_X_VIEWER_ID=device(8)).data["locked"])
        self.assertEqual(reader.notifications.filter(kind="payment_paid").count(), 1)

    def test_price_locks_once_someone_pays(self):
        self.client.force_authenticate(self.admin)
        edit = lambda price: self.client.patch(f"/api/admin/stories/{self.story.id}/", {"price": price}, format="json")  # noqa: E731
        self.assertEqual(edit("59.00").status_code, 200)
        self.assertFalse(self.client.get(f"/api/admin/stories/{self.story.id}/").data["price_locked"])
        self.client.force_authenticate(None)
        self.pay()
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(f"/api/admin/stories/{self.story.id}/").data["price_locked"])
        self.assertEqual(edit("99.00").status_code, 400)
        self.assertEqual(edit("59.00").status_code, 200)  # same price is fine
        self.assertEqual(
            self.client.post(f"/api/admin/stories/{self.story.id}/publish/", {"price": "10.00"}, format="json").status_code, 400
        )

    def test_publish_can_set_price_before_any_payment(self):
        draft = Story.objects.create(title="Draft", price=0)
        Chapter.objects.create(story=draft, title="C", order=0, content=[{"insert": "hi\n"}], word_count=1)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/admin/stories/{draft.id}/publish/", {"price": "35.00"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "published")
        self.assertEqual(response.data["price"], "35.00")
