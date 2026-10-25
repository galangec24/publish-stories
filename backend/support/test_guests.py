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
        self.assertEqual((inbox["user"]["first_name"], inbox["user"]["email"]), ("Lia", "lia@example.com"))
        self.assertNotIn("ip", inbox["user"])  # stored for resuming, not shown

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


INCOGNITO = {"HTTP_X_VIEWER_ID": "incognito-0003-cccccccc", "HTTP_X_FORWARDED_FOR": "49.145.10.20"}
ELSEWHERE = {"HTTP_X_VIEWER_ID": "elsewhere-0004-dddddddd", "HTTP_X_FORWARDED_FOR": "112.198.5.6"}


class ResumeConversationTests(APITestCase):
    def setUp(self):
        cache.clear()

    def start(self, email=""):
        if email:
            self.client.patch("/api/support/", {"name": "Lia", "email": email}, format="json", **PHONE)
        self.client.post("/api/support/messages/", {"body": "Hello from my phone"}, format="json", **PHONE)
        return self.client.get("/api/support/", **PHONE).data["resume_code"]

    def test_same_network_is_offered_but_needs_the_email(self):
        self.start(email="lia@example.com")
        offer = self.client.get("/api/support/", **INCOGNITO).data
        self.assertEqual(offer["messages"], [])  # nothing shown before proof
        self.assertEqual(offer["resume"], {"available": True, "with_email": True})

        wrong = self.client.post("/api/support/resume/", {"email": "someone@example.com"}, format="json", **INCOGNITO)
        self.assertEqual(wrong.status_code, 400)
        ok = self.client.post("/api/support/resume/", {"email": "LIA@example.com"}, format="json", **INCOGNITO)
        self.assertEqual([m["body"] for m in ok.data["messages"]], ["Hello from my phone"])
        self.assertEqual(self.client.get("/api/support/", **INCOGNITO).data["messages"][0]["body"], "Hello from my phone")

        # The email only works from the network the conversation came from.
        self.assertEqual(self.client.post("/api/support/resume/", {"email": "lia@example.com"}, format="json", **ELSEWHERE).status_code, 400)
        self.assertFalse(self.client.get("/api/support/", **ELSEWHERE).data["resume"]["available"])

    def test_chat_code_works_anywhere(self):
        code = self.start()
        self.assertRegex(code, r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.assertEqual(self.client.get("/api/support/", **INCOGNITO).data["resume"], {"available": True, "with_email": False})
        ok = self.client.post("/api/support/resume/", {"code": code.lower().replace("-", " ")}, format="json", **ELSEWHERE)
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["messages"][0]["body"], "Hello from my phone")
        self.assertEqual(self.client.post("/api/support/resume/", {"code": "AAAA-AAAA"}, format="json", **ELSEWHERE).status_code, 400)


class RowLockTests(APITestCase):
    def test_locks_only_their_own_table(self):
        # Postgres refuses FOR UPDATE on the nullable side of a join (guest threads, guest purchases);
        # SQLite ignores row locks, so check the SQL shape instead.
        from django.db import connection

        from payments.models import Subscription

        from .models import Conversation as Thread

        for queryset in (
            Thread.objects.select_for_update(of=("self",)).select_related("user"),
            Subscription.objects.select_for_update(of=("self",)).select_related("story", "user"),
        ):
            self.assertTrue(queryset.query.select_for_update_of)
        import inspect

        from payments import manual

        from . import views

        self.assertIn('select_for_update(of=("self",)).select_related("user")', inspect.getsource(views.AdminReplyView))
        self.assertIn('select_for_update(of=("self",)).select_related("story", "user")', inspect.getsource(manual.AdminReviewPaymentView))
        self.assertTrue(connection.features.has_select_for_update_of or connection.vendor == "sqlite")


class ReplyAndUnreadTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)

    def test_replies_quote_their_message_and_unread_counts(self):
        first = self.client.post("/api/support/messages/", {"body": "Which QR is cheaper?"}, format="json", **PHONE).data
        conversation = Conversation.objects.get()

        self.client.force_authenticate(self.admin)
        reply = self.client.post(
            f"/api/admin/support/{conversation.id}/messages/", {"body": "Both are free to use.", "reply_to": first["id"]}, format="json"
        ).data
        self.assertEqual(reply["reply_to"], {"id": first["id"], "text": "Which QR is cheaper?", "from_admin": False, "sender_name": "Guest"})
        other = Conversation.objects.create(guest_key="x" * 64)
        stray = Message.objects.create(conversation=other, body="someone else")
        cross = self.client.post(f"/api/admin/support/{conversation.id}/messages/", {"body": "hi", "reply_to": stray.id}, format="json").data
        self.assertIsNone(cross["reply_to"])  # can't quote another thread
        self.client.force_authenticate(None)

        self.assertEqual(self.client.get("/api/support/unread/", **PHONE).data, {"unread": 2})
        self.assertEqual(self.client.get("/api/support/unread/", **PHONE).data, {"unread": 2})  # counting doesn't mark read
        history = self.client.get("/api/support/", **PHONE).data["messages"]
        self.assertEqual(history[1]["reply_to"]["text"], "Which QR is cheaper?")
        self.assertEqual(self.client.get("/api/support/unread/", **PHONE).data, {"unread": 0})
        self.assertEqual(self.client.get("/api/support/unread/", **SAME_WIFI).data, {"unread": 0})

        back = self.client.post("/api/support/messages/", {"body": "Thanks!", "reply_to": reply["id"]}, format="json", **PHONE).data
        self.assertEqual(back["reply_to"]["sender_name"], "Support")
