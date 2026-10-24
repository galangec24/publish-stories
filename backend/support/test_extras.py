from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Message


@override_settings(SUPABASE_URL="", SUPABASE_SERVICE_KEY="")
class ChatExtrasTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.reader = User.objects.create_user(email="r@example.com", password="x", first_name="Rey", email_verified=True)
        self.other = User.objects.create_user(email="o@example.com", password="x", email_verified=True)
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)

    def test_emoji_gif_and_file_messages(self):
        self.client.force_authenticate(self.reader)
        emoji = self.client.post("/api/support/messages/", {"body": "Salamat po 🙏😊"}, format="json")
        self.assertEqual(emoji.data["body"], "Salamat po 🙏😊")
        gif = self.client.post("/api/support/messages/", {"gif_url": "https://media2.giphy.com/media/abc/giphy.gif"}, format="json")
        self.assertEqual(gif.status_code, 201, gif.data)
        bad = self.client.post("/api/support/messages/", {"gif_url": "https://evil.example.com/x.gif"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.client.post("/api/support/messages/", {"body": ""}, format="json").status_code, 400)

        upload = SimpleUploadedFile("receipt.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        sent = self.client.post("/api/support/messages/", {"body": "Here", "file": upload}, format="multipart")
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual(sent.data["file"]["name"], "receipt.pdf")
        url = "/api/" + sent.data["file"]["url"]
        self.assertEqual(self.client.get(url).content, b"%PDF-1.4 test")

        # Only this reader and admins can open it.
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_bad_files_are_refused(self):
        self.client.force_authenticate(self.reader)
        exe = SimpleUploadedFile("virus.exe", b"MZ", content_type="application/octet-stream")
        self.assertIn("file", self.client.post("/api/support/messages/", {"file": exe}, format="multipart").data)
        big = SimpleUploadedFile("big.png", b"0" * (3 * 1024 * 1024 + 1), content_type="image/png")
        self.assertIn("file", self.client.post("/api/support/messages/", {"file": big}, format="multipart").data)
        self.assertEqual(Message.objects.count(), 0)

    def test_admin_reply_with_gif_notifies_reader(self):
        self.client.force_authenticate(self.reader)
        self.client.post("/api/support/messages/", {"body": "Hi"}, format="json")
        conversation = self.client.get("/api/support/").data["id"]
        self.client.force_authenticate(self.admin)
        reply = self.client.post(
            f"/api/admin/support/{conversation}/messages/", {"gif_url": "https://media.giphy.com/media/x/giphy.gif"}, format="json"
        )
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(self.reader.notifications.get(kind="support_reply").body, "GIF")

    @override_settings(GIPHY_API_KEY="key")
    def test_gif_search_hides_the_key(self):
        self.client.force_authenticate(self.reader)
        fake = mock.Mock(ok=True)
        fake.json.return_value = {
            "data": [
                {
                    "id": "1",
                    "title": "happy",
                    "images": {
                        "downsized_medium": {"url": "https://media1.giphy.com/media/1/giphy.gif", "width": "200", "height": "150"},
                        "fixed_width_small": {"url": "https://media1.giphy.com/media/1/100w.gif"},
                    },
                }
            ]
        }
        with mock.patch("support.gifs.requests.get", return_value=fake) as get:
            data = self.client.get("/api/support/gifs/", {"q": "happy"}).data
        self.assertTrue(data["enabled"])
        self.assertEqual(data["results"][0]["preview"], "https://media1.giphy.com/media/1/100w.gif")
        self.assertNotIn("key", str(data))
        self.assertEqual(get.call_args.kwargs["params"]["api_key"], "key")

    @override_settings(GIPHY_API_KEY="")
    def test_gif_search_off_without_key(self):
        self.client.force_authenticate(self.reader)
        self.assertFalse(self.client.get("/api/support/gifs/").data["enabled"])
