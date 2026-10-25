from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User


class SupportChatTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.reader = User.objects.create_user(
            email="juan@example.com", password="x", first_name="Juan", last_name="Cruz", email_verified=True
        )
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)

    def test_conversation_round_trip(self):
        self.client.force_authenticate(self.reader)
        sent = self.client.post("/api/support/messages/", {"body": "Hi, my payment is stuck"}, format="json")
        self.assertEqual(sent.status_code, 201)
        self.client.post("/api/support/messages/", {"body": "Order for Ang Diwata"}, format="json")
        # Admins get one notification per unread streak, not one per message.
        self.assertEqual(self.admin.notifications.count(), 1)
        self.assertIn("juan@example.com", self.admin.notifications.get().title)

        self.client.force_authenticate(self.admin)
        inbox = self.client.get("/api/admin/support/").data
        thread = inbox["results"][0]
        self.assertEqual(thread["user"]["first_name"], "Juan")
        self.assertEqual(thread["user"]["email"], "juan@example.com")
        self.assertEqual(thread["unread_for_admin"], 2)
        self.assertEqual(inbox["unread_total"], 2)

        detail = self.client.get(f"/api/admin/support/{thread['id']}/").data
        self.assertEqual([m["body"] for m in detail["messages"]], ["Hi, my payment is stuck", "Order for Ang Diwata"])
        self.assertEqual(self.client.get("/api/admin/support/").data["unread_total"], 0)

        reply = self.client.post(f"/api/admin/support/{thread['id']}/messages/", {"body": "Checking now!"}, format="json")
        self.assertEqual(reply.status_code, 201)
        self.assertTrue(reply.data["from_admin"])
        self.assertEqual(self.reader.notifications.filter(kind="support_reply").count(), 1)

        self.client.force_authenticate(self.reader)
        mine = self.client.get("/api/support/").data
        self.assertEqual(mine["messages"][-1]["body"], "Checking now!")
        self.assertEqual(mine["messages"][-1]["sender_name"], "Support")

    def test_readers_cannot_use_admin_inbox(self):
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get("/api/admin/support/").status_code, 403)

    def test_guests_need_a_device_id(self):
        # Without the browser's X-Viewer-Id there is nothing to keep the conversation by.
        self.assertEqual(self.client.post("/api/support/messages/", {"body": "hi"}, format="json").status_code, 400)

    def test_empty_message_rejected(self):
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.post("/api/support/messages/", {"body": "   "}, format="json").status_code, 400)
