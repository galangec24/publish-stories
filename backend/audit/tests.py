from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Chapter, Genre, Story

from .models import AdminLog


class AdminActivityLogTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.client.force_authenticate(self.admin)

    def test_story_changes_are_logged_with_values(self):
        story = self.client.post("/api/admin/stories/", {"title": "Ulan"}, format="json").data
        self.client.patch(f"/api/admin/stories/{story['id']}/", {"price": "59.00", "synopsis": "x" * 300}, format="json")
        self.client.post(f"/api/admin/stories/{story['id']}/unpublish/")
        logs = list(AdminLog.objects.order_by("created_at"))
        self.assertEqual([l.action for l in logs], ["Created story", "Edited story settings", "Unpublished story"])
        self.assertEqual(logs[1].target_label, "Ulan")
        self.assertEqual(logs[1].changes["price"], "59.00")
        self.assertEqual(logs[1].changes["_also"], ["synopsis"])  # long text is named, not copied
        self.assertEqual(logs[0].actor_email, "admin@example.com")

    def test_chapter_autosaves_fold_into_one_entry(self):
        story = Story.objects.create(title="Gabi")
        chapter = Chapter.objects.create(story=story, title="One", order=0)
        for i in range(3):
            self.client.patch(f"/api/admin/chapters/{chapter.id}/", {"content": [{"insert": f"v{i}\n"}]}, format="json")
        log = AdminLog.objects.get()
        self.assertEqual((log.action, log.count, log.target_label), ("Edited chapter", 3, "One"))

    def test_deletes_keep_the_name_and_failures_and_readers_are_not_logged(self):
        genre = Genre.objects.create(name="Horror")
        self.client.delete(f"/api/admin/genres/{genre.id}/")
        self.assertEqual(AdminLog.objects.get().target_label, "Horror")
        self.client.patch("/api/admin/stories/99999/", {"title": "x"}, format="json")  # 404: not logged
        reader = User.objects.create_user(email="r@example.com", password="x")
        self.client.force_authenticate(reader)
        self.client.post("/api/admin/stories/", {"title": "nope"}, format="json")  # 403: not logged
        self.assertEqual(AdminLog.objects.count(), 1)

    def test_activity_endpoint_is_admin_only_and_searchable(self):
        self.client.post("/api/admin/genres/", {"name": "Romance"}, format="json")
        self.client.post("/api/admin/columns/", {"title": "Sunday"}, format="json")
        self.assertEqual(self.client.get("/api/admin/activity/", {"q": "sunday"}).data["count"], 1)
        self.assertEqual(self.client.get("/api/admin/activity/").data["results"][0]["action"], "Added column")
        self.client.force_authenticate(User.objects.create_user(email="r@example.com", password="x"))
        self.assertEqual(self.client.get("/api/admin/activity/").status_code, 403)
