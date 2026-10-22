import json

from asgiref.sync import async_to_sync
from asgiref.testing import ApplicationCommunicator
from channels.layers import get_channel_layer
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from config.asgi import application

from .service import notify, notify_admins

ORIGIN = [(b"origin", b"http://localhost:5173")]


class WebsocketCommunicator(ApplicationCommunicator):
    """Minimal WebSocket test client (channels.testing needs daphne, which we don't deploy)."""

    def __init__(self, app, url, headers):
        path, _, query = url.partition("?")
        super().__init__(
            app,
            {"type": "websocket", "path": path, "query_string": query.encode(), "headers": headers, "subprotocols": []},
        )

    async def connect(self):
        await self.send_input({"type": "websocket.connect"})
        response = await self.receive_output(2)
        return response["type"] == "websocket.accept", response.get("code")

    async def receive_json_from(self, timeout=1):
        return json.loads((await self.receive_output(timeout))["text"])

    async def disconnect(self):
        await self.send_input({"type": "websocket.disconnect", "code": 1000})
        await self.wait(1)


class NotificationApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="r@example.com", password="x", email_verified=True)
        self.admin = User.objects.create_user(email="a@example.com", password="x", is_admin=True)
        self.client.force_authenticate(self.user)

    def test_list_read_and_read_all(self):
        notify([self.user], "test", "First")
        notify([self.user], "test", "Second", "body", "/stories/x")
        data = self.client.get("/api/notifications/").data
        self.assertEqual(data["unread_count"], 2)
        self.assertEqual([n["title"] for n in data["results"]], ["Second", "First"])

        first_id = data["results"][1]["id"]
        self.assertEqual(self.client.post(f"/api/notifications/{first_id}/read/").data["unread_count"], 1)
        self.client.post("/api/notifications/read-all/")
        self.assertEqual(self.client.get("/api/notifications/").data["unread_count"], 0)

    def test_cannot_read_someone_elses(self):
        other = notify([self.admin], "test", "Admin only")[0]
        self.assertEqual(self.client.post(f"/api/notifications/{other.pk}/read/").status_code, 404)

    def test_notify_admins_targets_admins_only(self):
        notify_admins("x", "For admins")
        self.assertEqual(self.admin.notifications.count(), 1)
        self.assertEqual(self.user.notifications.count(), 0)


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
class WebsocketTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="ws@example.com", password="x", email_verified=True)

    def connect(self, token):
        return WebsocketCommunicator(application, f"/ws/?token={token}", headers=ORIGIN)

    def test_authenticated_socket_receives_pushes(self):
        async def run():
            comm = self.connect(str(AccessToken.for_user(self.user)))
            connected, _ = await comm.connect()
            assert connected
            hello = await comm.receive_json_from()
            assert hello["event"] == "hello"
            await get_channel_layer().group_send(
                f"user.{self.user.pk}", {"type": "push", "event": "notification", "data": {"title": "Hi"}}
            )
            message = await comm.receive_json_from(timeout=2)
            assert message == {"event": "notification", "data": {"title": "Hi"}}
            await comm.disconnect()

        async_to_sync(run)()

    def test_anonymous_socket_is_rejected(self):
        async def run():
            connected, code = await self.connect("not-a-token").connect()
            assert not connected

        async_to_sync(run)()
