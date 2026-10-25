from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User
from payments.models import Subscription

from .models import Chapter, Story

DEVICE = "device-0001-aaaaaaaaaaaa"


class RatingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.story = Story.objects.create(title="Rated", price=49, free_chapters=1, status="published")
        self.chapters = [
            Chapter.objects.create(story=self.story, title=f"C{i}", order=i, content=[{"insert": "x\n"}], word_count=1) for i in range(3)
        ]
        Chapter.objects.create(story=self.story, title="Empty", order=3, content=[], word_count=0)
        self.url = f"/api/stories/{self.story.slug}"

    def read(self, chapter, **headers):
        return self.client.post(f"{self.url}/progress/", {"chapter": chapter.id}, format="json", **headers).data

    def test_guest_rates_only_after_reading_every_chapter(self):
        guest = {"HTTP_X_VIEWER_ID": DEVICE}
        state = self.client.get(f"{self.url}/rating/", **guest).data
        self.assertFalse(state["can_rate"])
        self.assertIn("Finish all 3 chapters", state["reason"])
        self.assertEqual(self.client.post(f"{self.url}/rating/", {"stars": 5}, format="json", **guest).status_code, 403)

        self.read(self.chapters[0], **guest)
        self.assertFalse(self.read(self.chapters[1], **guest)["recorded"])  # locked: doesn't count
        self.assertEqual(self.client.get(f"{self.url}/rating/", **guest).data["chapters_read"], 1)

        # After paying, reading the rest unlocks rating (the empty chapter isn't required).
        sub = Subscription.objects.create(story=self.story, amount=49, status="paid", provider="manual")
        from payments.access import add_device, device_key

        add_device(sub, device_key(type("R", (), {"headers": {"X-Viewer-Id": DEVICE}})), "")
        self.read(self.chapters[1], **guest)
        self.read(self.chapters[2], **guest)
        rated = self.client.post(f"{self.url}/rating/", {"stars": 4}, format="json", **guest).data
        self.assertEqual((rated["mine"], rated["average"], rated["count"]), (4, 4.0, 1))
        again = self.client.post(f"{self.url}/rating/", {"stars": 2}, format="json", **guest).data
        self.assertEqual((again["average"], again["count"]), (2.0, 1))  # changing a rating doesn't add one

    def test_signed_in_readers_rate_any_time_and_admins_cannot(self):
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.assertEqual(self.client.post(f"{self.url}/rating/", {"stars": 6}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"{self.url}/rating/", {"stars": 5}, format="json").data["average"], 5.0)
        other = User.objects.create_user(email="o@example.com", password="x")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(f"{self.url}/rating/", {"stars": 4}, format="json").data["average"], 4.5)
        listed = self.client.get("/api/stories/").data["results"][0]
        self.assertEqual((float(listed["rating_avg"]), listed["rating_count"]), (4.5, 2))

        admin = User.objects.create_user(email="a@example.com", password="x", is_admin=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.post(f"{self.url}/rating/", {"stars": 5}, format="json").status_code, 403)


class OrderingAndProgressTests(APITestCase):
    def test_shelves_put_most_liked_then_best_rated_first(self):
        from .models import Genre

        romance = Genre.objects.create(name="Romance")
        quiet = Story.objects.create(title="Quiet", status="published", like_count=1, rating_avg=5, rating_count=1)
        loved = Story.objects.create(title="Loved", status="published", like_count=9, rating_avg=3, rating_count=4)
        tied = Story.objects.create(title="Tied but better rated", status="published", like_count=9, rating_avg=4.5, rating_count=2)
        for story in (quiet, loved, tied):
            story.genres.add(romance)
        reader = User.objects.create_user(email="r@example.com", password="x")
        reader.preferred_genres.add(romance)
        self.client.force_authenticate(reader)
        home = self.client.get("/api/home/").data
        expected = ["Tied but better rated", "Loved", "Quiet"]
        self.assertEqual([s["title"] for s in home["for_you"]], expected)
        self.assertEqual([s["title"] for s in home["by_genre"][0]["stories"]], expected)
        self.assertEqual([s["title"] for s in home["free"]], expected)
        self.assertEqual([s["title"] for s in self.client.get("/api/stories/", {"ordering": "best"}).data["results"]], expected)

    def test_story_remembers_read_chapters_and_where_you_left_off(self):
        story = Story.objects.create(title="Long", status="published")
        one, two, three = (Chapter.objects.create(story=story, title=f"C{i}", order=i, content=[{"insert": "x\n"}], word_count=1) for i in range(3))
        guest = {"HTTP_X_VIEWER_ID": DEVICE}
        url = f"/api/stories/{story.slug}"
        self.assertEqual(self.client.get(f"{url}/", **guest).data["last_chapter"], None)
        for chapter in (one, three, two):
            self.client.post(f"{url}/progress/", {"chapter": chapter.id}, format="json", **guest)
        data = self.client.get(f"{url}/", **guest).data
        self.assertEqual(sorted(data["read_chapters"]), sorted([one.id, two.id, three.id]))
        self.assertEqual(data["last_chapter"], two.id)
        self.client.post(f"{url}/progress/", {"chapter": one.id}, format="json", **guest)  # went back to chapter 1
        self.assertEqual(self.client.get(f"{url}/", **guest).data["last_chapter"], one.id)
        self.assertEqual(self.client.get(f"{url}/", HTTP_X_VIEWER_ID="someone-else-0009-zzzz").data["read_chapters"], [])

    def test_new_fonts_are_accepted(self):
        admin = User.objects.create_user(email="a@example.com", password="x", is_admin=True)
        self.client.force_authenticate(admin)
        made = self.client.post("/api/admin/stories/", {"title": "Fonts", "font_family": "eb_garamond", "title_font": "great_vibes"}, format="json")
        self.assertEqual((made.data["font_family"], made.data["title_font"]), ("eb_garamond", "great_vibes"))
        self.assertEqual(self.client.post("/api/admin/stories/", {"title": "Bad", "font_family": "comic_sans"}, format="json").status_code, 400)
