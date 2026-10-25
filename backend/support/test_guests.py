from unittest import mock

from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Conversation, Message

PHONE = {"HTTP_X_VIEWER_ID": "guest-phone-0001-aaaaaa", "HTTP_X_FORWARDED_FOR": "49.145.10.20"}
SAME_WIFI = {"HTTP_X_VIEWER_ID": "guest-laptop-0002-bbbbb", "HTTP_X_FORWARDED_FOR": "49.145.10.20"}


class GuestSupportTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)

    def test_guest_conversation_is_kept_by_device_not_ip(self):
        self.assertEqual(self.client.get("/api/support/", **PHONE).data["messages"], [])
        self.client.patch("/api/support/", {"name": "Lia", "email": "lia@example.com"}, format="json", **PHONE)
        sent = self.client.post("/api/support/messages/", {"body": "How do I pay with BPI?"}, format="json", **PHONE)
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual(sent.data["sender_name"], "Lia")
        self.assertEqual(self.admin.notifications.get(kind="support_message").title, "New message from guest Lia (lia@example.com)")

        again = self.client.get("/api/support/", **PHONE).data
        self.assertEqual([m["body"] for m in again["messages"]], ["How do I pay with BPI?"])
        # Someone else on the same Wi-Fi (same IP) must not see it.
        self.assertEqual(self.client.get("/api/support/", **SAME_WIFI).data["messages"], [])

        self.client.force_authenticate(self.admin)
        inbox = self.client.get("/api/admin/support/").data["results"][0]
        self.assertTrue(inbox["user"]["is_guest"])
        self.assertEqual((inbox["user"]["first_name"], inbox["user"]["email"], inbox["user"]["ip"]), ("Lia", "lia@example.com", "49.145.10.•"))

        with mock.patch("support.views.send_email") as send, self.captureOnCommitCallbacks(execute=True):
            reply = self.client.post(f"/api/admin/support/{inbox['id']}/messages/", {"body": "Scan the BPI QR."}, format="json")
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(send.call_args.kwargs["to_email"], "lia@example.com")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/support/", **PHONE).data["messages"][-1]["body"], "Scan the BPI QR.")

    def test_signing_in_moves_the_guest_thread_into_the_account(self):
        self.client.post("/api/support/messages/", {"body": "Before signing in"}, format="json", **PHONE)
        reader = User.objects.create_user(email="r@example.com", password="x", first_name="Rey")
        self.client.force_authenticate(reader)
        mine = self.client.get("/api/support/", **PHONE).data
        self.assertEqual([m["body"] for m in mine["messages"]], ["Before signing in"])
        self.assertEqual(Conversation.objects.get().user, reader)
        self.assertFalse(Conversation.objects.filter(user__isnull=True).exists())

    def test_merge_when_the_account_already_has_a_thread(self):
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.client.post("/api/support/messages/", {"body": "From my account"}, format="json")
        self.client.force_authenticate(None)
        self.client.post("/api/support/messages/", {"body": "As a guest"}, format="json", **PHONE)
        self.client.force_authenticate(reader)
        mine = self.client.get("/api/support/", **PHONE).data
        self.assertEqual(sorted(m["body"] for m in mine["messages"]), ["As a guest", "From my account"])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_guest_files_only_for_that_device(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("note.txt", b"hello", content_type="text/plain")
        sent = self.client.post("/api/support/messages/", {"file": upload}, format="multipart", **PHONE).data
        url = "/api/" + sent["file"]["url"]
        self.assertEqual(self.client.get(url, **PHONE).content, b"hello")
        self.assertEqual(self.client.get(url, **SAME_WIFI).status_code, 404)
        self.assertEqual(Message.objects.get().sender, None)

    def test_guest_rate_limit(self):
        codes = [self.client.post("/api/support/messages/", {"body": f"m{i}"}, format="json", **PHONE).status_code for i in range(21)]
        self.assertEqual(codes[-1], 429)
