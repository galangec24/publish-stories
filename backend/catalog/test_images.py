import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Chapter, Story


def png_bytes(w=2400, h=1200):
    buffer = io.BytesIO()
    Image.new("RGB", (w, h), (200, 80, 40)).save(buffer, "PNG")
    return buffer.getvalue()


class StoryImageTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="a@example.com", password="x", is_admin=True)
        self.client.force_authenticate(self.admin)

    def test_upload_resizes_and_serves_webp(self):
        response = self.client.post(
            "/api/admin/images/", {"image": SimpleUploadedFile("pic.png", png_bytes(), "image/png")}, format="multipart"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data["width"], response.data["height"]), (1600, 800))
        path = response.data["url"].split("testserver")[1]
        served = self.client.get(path)
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served["Content-Type"], "image/webp")
        self.assertIn("immutable", served["Cache-Control"])

    def test_rejects_non_images(self):
        response = self.client.post(
            "/api/admin/images/", {"image": SimpleUploadedFile("x.png", b"not an image", "image/png")}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)

    def test_chapters_accept_uploaded_images_but_not_pasted_data(self):
        story = Story.objects.create(title="Pics")
        chapter = Chapter.objects.create(story=story, title="One")
        ok = [
            {"insert": "Before the picture.\n"},
            {"insert": {"image": "https://api.example.com/api/media/images/abc.webp"}},
            {"insert": "\n", "attributes": {"align": "center"}},
            {"insert": "After the picture.\n"},
        ]
        saved = self.client.patch(f"/api/admin/chapters/{chapter.pk}/", {"content": ok}, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        for bad in ({"image": "data:image/png;base64,AAAA"}, {"image": "javascript:alert(1)"}, {"video": "https://x"}):
            response = self.client.patch(
                f"/api/admin/chapters/{chapter.pk}/", {"content": [{"insert": bad}, {"insert": "\n"}]}, format="json"
            )
            self.assertEqual(response.status_code, 400, bad)

    def test_uploads_are_admin_only(self):
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        response = self.client.post(
            "/api/admin/images/", {"image": SimpleUploadedFile("pic.png", png_bytes(10, 10), "image/png")}, format="multipart"
        )
        self.assertEqual(response.status_code, 403)
