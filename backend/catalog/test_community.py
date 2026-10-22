from django.core.cache import cache
from rest_framework.test import APITestCase

from accounts.models import User

from .models import Column, Genre, Story


class LikeAndCommentTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.story = Story.objects.create(title="Liked", status="published")
        self.reader = User.objects.create_user(email="lia@example.com", password="x", first_name="Lia", email_verified=True)
        self.other = User.objects.create_user(email="ben@example.com", password="x", first_name="Ben", email_verified=True)
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.url = f"/api/stories/{self.story.slug}"

    def test_like_toggle_is_idempotent_and_counted(self):
        self.assertEqual(self.client.post(f"{self.url}/like/").status_code, 401)
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.post(f"{self.url}/like/").data, {"liked": True, "like_count": 1})
        self.assertEqual(self.client.post(f"{self.url}/like/").data["like_count"], 1)  # double click
        self.client.force_authenticate(self.other)
        self.client.post(f"{self.url}/like/")
        self.assertEqual(self.client.get(f"{self.url}/").data["like_count"], 2)
        self.assertEqual(self.client.delete(f"{self.url}/like/").data, {"liked": False, "like_count": 1})

    def test_comments_replies_notifications_and_deletion(self):
        self.assertEqual(self.client.post(f"{self.url}/comments/", {"body": "Hi"}, format="json").status_code, 401)
        self.client.force_authenticate(self.reader)
        first = self.client.post(f"{self.url}/comments/", {"body": "Beautiful chapter!"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.admin.notifications.filter(kind="comment").count(), 1)

        self.client.force_authenticate(self.other)
        reply = self.client.post(f"{self.url}/comments/", {"body": "Agree!", "parent": first.data["comment"]["id"]}, format="json")
        # Replying to a reply still attaches to the top-level comment.
        nested = self.client.post(f"{self.url}/comments/", {"body": "Me too", "parent": reply.data["comment"]["id"]}, format="json")
        self.assertEqual(nested.data["comment"]["parent"], first.data["comment"]["id"])
        self.assertEqual(self.reader.notifications.filter(kind="comment_reply").count(), 2)

        listing = self.client.get(f"{self.url}/comments/").data
        self.assertEqual(listing["count"], 3)
        self.assertEqual(len(listing["results"]), 1)
        self.assertEqual([r["body"] for r in listing["results"][0]["replies"]], ["Agree!", "Me too"])
        self.assertEqual(listing["results"][0]["user"]["first_name"], "Lia")

        # Ben can't delete Lia's comment; Lia can, and replies go with it.
        cid = first.data["comment"]["id"]
        self.assertEqual(self.client.delete(f"/api/comments/{cid}/").status_code, 403)
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.delete(f"/api/comments/{cid}/").data["count"], 0)

    def test_admin_hide_and_moderation_list(self):
        self.client.force_authenticate(self.reader)
        cid = self.client.post(f"{self.url}/comments/", {"body": "spam spam"}, format="json").data["comment"]["id"]
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.post(f"/api/admin/comments/{cid}/hide/").data["is_hidden"])
        self.assertEqual(self.client.get(f"{self.url}/comments/").data["count"], 0)
        listing = self.client.get("/api/admin/comments/").data["results"]
        self.assertEqual(listing[0]["user"]["email"], "lia@example.com")
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get("/api/admin/comments/").status_code, 403)

    def test_comment_rate_limit(self):
        self.client.force_authenticate(self.reader)
        codes = [self.client.post(f"{self.url}/comments/", {"body": f"c{i}"}, format="json").status_code for i in range(11)]
        self.assertEqual(codes[-1], 429)


class GenreColumnTitleFontTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.client.force_authenticate(self.admin)

    def test_delete_genre_keeps_stories_and_shows_usage(self):
        genre = Genre.objects.create(name="Horror")
        story = Story.objects.create(title="Scary", status="published")
        story.genres.add(genre)
        listing = self.client.get("/api/admin/genres/").data
        self.assertEqual(next(g for g in listing if g["id"] == genre.id)["story_count"], 1)
        self.assertEqual(self.client.delete(f"/api/admin/genres/{genre.id}/").status_code, 204)
        self.assertTrue(Story.objects.filter(pk=story.pk).exists())
        self.assertEqual(story.genres.count(), 0)

    def test_column_url_and_title_font(self):
        column = self.client.post(
            "/api/admin/columns/", {"title": "Sunday Reflections", "url": "https://www.sunstar.com.ph/author/x"}, format="json"
        )
        self.assertEqual(column.status_code, 201, column.data)
        bad = self.client.post("/api/admin/columns/", {"title": "Bad", "url": "javascript:alert(1)"}, format="json")
        self.assertEqual(bad.status_code, 400)
        story = self.client.post(
            "/api/admin/stories/", {"title": "Styled", "title_font": "playfair", "column_id": column.data["id"]}, format="json"
        )
        self.assertEqual(story.data["title_font"], "playfair")
        self.assertEqual(story.data["column"]["url"], "https://www.sunstar.com.ph/author/x")
        self.assertEqual(Column.objects.get().url, "https://www.sunstar.com.ph/author/x")


class SeedGenresTests(APITestCase):
    def test_deleted_genres_do_not_come_back(self):
        import io

        from django.core.management import call_command

        call_command("seed_genres", stdout=io.StringIO())
        self.assertEqual(Genre.objects.count(), 13)
        Genre.objects.filter(name="Horror").delete()
        call_command("seed_genres", stdout=io.StringIO())  # e.g. the next server restart
        self.assertEqual(Genre.objects.count(), 12)
        self.assertFalse(Genre.objects.filter(name="Horror").exists())
