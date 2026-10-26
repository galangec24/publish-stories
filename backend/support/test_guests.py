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
        # Another device on the same connection picks up the latest conversation; another network doesn't.
        self.assertEqual(self.client.get("/api/support/", **SAME_WIFI).data["messages"][0]["body"], "How do I pay with BPI?")
        self.assertEqual(self.client.get("/api/support/", **ELSEWHERE).data["messages"], [])

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

    def test_same_connection_picks_up_the_latest_and_can_switch(self):
        self.start(email="lia@example.com")
        # A second guest at the same address starts their own thread...
        self.client.post("/api/support/messages/", {"body": "Hi from the laptop"}, format="json", **SAME_WIFI)
        # ...which is newer, so a third device (incognito) lands on it and can switch to the other.
        opened = self.client.get("/api/support/", **INCOGNITO).data
        self.assertEqual(opened["messages"][0]["body"], "Hi from the laptop")
        self.assertEqual(len(opened["others"]), 2)
        older = next(o for o in opened["others"] if not o["current"])
        self.assertEqual(older["name"], "Lia")
        switched = self.client.post("/api/support/switch/", {"id": older["id"]}, format="json", **INCOGNITO).data
        self.assertEqual(switched["messages"][0]["body"], "Hello from my phone")
        self.assertEqual(self.client.get("/api/support/", **INCOGNITO).data["messages"][0]["body"], "Hello from my phone")
        # The phone keeps its conversation: it is shared, not moved.
        self.assertEqual(self.client.get("/api/support/", **PHONE).data["messages"][0]["body"], "Hello from my phone")
        # Another network can't switch into it.
        self.assertEqual(self.client.post("/api/support/switch/", {"id": older["id"]}, format="json", **ELSEWHERE).status_code, 404)

    def test_chat_code_works_anywhere(self):
        code = self.start()
        self.assertRegex(code, r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")
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


class ReactionsSeenAndCountsTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)

    def test_reactions_both_sides_and_toggle(self):
        mine = self.client.post("/api/support/messages/", {"body": "Hi"}, format="json", **PHONE).data
        url = f"/api/support/messages/{mine['id']}/react/"
        self.assertEqual(self.client.post(url, {"emoji": "❤️"}, format="json", **PHONE).data["reactions"], {"reader": "❤️", "admin": ""})
        self.assertEqual(self.client.post(url, {"emoji": "🍕"}, format="json", **PHONE).status_code, 400)
        self.assertEqual(self.client.post(url, {"emoji": "❤️"}, format="json", **SAME_WIFI).status_code, 404)  # not their thread
        self.client.force_authenticate(self.admin)
        both = self.client.post(f"/api/admin/support/messages/{mine['id']}/react/", {"emoji": "👍"}, format="json").data
        self.assertEqual(both["reactions"], {"reader": "❤️", "admin": "👍"})
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(url, {"emoji": "❤️"}, format="json", **PHONE).data["reactions"]["reader"], "")  # tap again: removed

    def test_every_message_counts(self):
        reader = User.objects.create_user(email="r@example.com", password="x", first_name="Rey")
        self.client.force_authenticate(reader)
        self.client.post("/api/support/messages/", {"body": "One"}, format="json")
        self.client.post("/api/support/messages/", {"body": "Two"}, format="json")
        self.assertEqual(self.admin.notifications.filter(kind="support_message", is_read=False).count(), 2)
        conversation = Conversation.objects.get()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/admin/support/").data["unread_total"], 2)
        for body in ("A", "B"):
            self.client.post(f"/api/admin/support/{conversation.id}/messages/", {"body": body}, format="json")
        self.assertEqual(reader.notifications.filter(kind="support_reply", is_read=False).count(), 2)
        self.client.force_authenticate(reader)
        self.assertEqual(self.client.get("/api/support/unread/").data["unread"], 2)
        # Seen: the admin opened the thread, so the reader's side shows nothing unread for support.
        self.assertEqual(self.client.get("/api/support/").data["unread_for_admin"], 0)


class NotificationsClearWhenReadTests(APITestCase):
    def test_opening_the_conversation_clears_its_notifications(self):
        cache.clear()
        admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.client.post("/api/support/messages/", {"body": "One"}, format="json")
        self.client.post("/api/support/messages/", {"body": "Two"}, format="json")
        conversation = Conversation.objects.get()
        self.assertEqual(admin.notifications.filter(is_read=False).count(), 2)
        self.assertEqual(admin.notifications.first().link, f"/admin/support?c={conversation.id}")

        self.client.force_authenticate(admin)
        self.client.get(f"/api/admin/support/{conversation.id}/")  # admin reads it
        self.assertEqual(admin.notifications.filter(is_read=False).count(), 0)
        self.client.post(f"/api/admin/support/{conversation.id}/messages/", {"body": "Hello"}, format="json")

        self.client.force_authenticate(reader)
        self.assertEqual(reader.notifications.filter(is_read=False).count(), 1)
        self.client.get("/api/support/")  # reader opens the chat
        self.assertEqual(reader.notifications.filter(is_read=False).count(), 0)


class InactiveArchiveTests(APITestCase):
    def test_thirty_quiet_days_archive_the_messages_and_start_fresh(self):
        from datetime import timedelta

        from django.utils import timezone

        cache.clear()
        admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.client.post("/api/support/messages/", {"body": "Old question"}, format="json")
        conversation = Conversation.objects.get()
        Conversation.objects.filter(pk=conversation.pk).update(last_message_at=timezone.now() - timedelta(days=31))

        opened = self.client.get("/api/support/").data
        self.assertEqual(opened["messages"], [])
        self.assertIsNotNone(opened["archived_at"])
        self.assertFalse(Message.objects.exists())
        self.client.post("/api/support/messages/", {"body": "New question"}, format="json")
        self.assertEqual([m["body"] for m in self.client.get("/api/support/").data["messages"]], ["New question"])

        # Threads the reader never reopens are cleared when the admin inbox loads.
        Conversation.objects.filter(pk=conversation.pk).update(last_message_at=timezone.now() - timedelta(days=40))
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/admin/support/").data["results"], [])
        self.assertFalse(Message.objects.exists())

    def test_recent_threads_are_kept(self):
        cache.clear()
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.client.post("/api/support/messages/", {"body": "Still here"}, format="json")
        self.assertEqual(len(self.client.get("/api/support/").data["messages"]), 1)
