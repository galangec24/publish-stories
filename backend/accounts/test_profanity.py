from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Story

from .profanity import find_bad_word

PHONE = {"HTTP_X_VIEWER_ID": "guest-phone-0001-aaaaaa"}


class ProfanityTests(APITestCase):
    def test_disguises_are_caught_and_innocent_words_pass(self):
        for text in ["fuck you", "F*CK", "sh1t", "fuuuuck", "p u t a n g i n a", "Putangina mo", "gago ka", "ULOL", "what the f.u.c.k"]:
            self.assertTrue(find_bad_word(text), text)
        for text in ["Thank you po", "class assignment", "Dickens novel", "the cocktail", "leche flan", "Shitake", "gagawin ko", "tangan"]:
            self.assertIsNone(find_bad_word(text), text)

    def test_blocked_in_comments_chat_and_names(self):
        cache.clear()
        story = Story.objects.create(title="Kind", status="published")
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        bad = self.client.post(f"/api/stories/{story.slug}/comments/", {"body": "gago ka"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("kind", str(bad.data))
        self.assertEqual(self.client.post(f"/api/stories/{story.slug}/comments/", {"body": "Ang ganda!"}, format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/support/messages/", {"body": "sh1t"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/user/me/", {"first_name": "Puta"}, format="json").status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.patch("/api/support/", {"name": "tangina"}, format="json", **PHONE).status_code, 400)
