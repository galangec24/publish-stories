from unittest import mock

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Chapter, Story

from . import services
from .models import ChapterNarration, ChapterReel, Status

KEYS = {"ELEVENLABS_API_KEY": "k", "HEYGEN_API_KEY": "k", "ANTHROPIC_API_KEY": "k", "SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_KEY": "k"}


def fake_speak(text, voice, before="", after=""):
    # every character takes 0.1 s
    return b"mp3", [(i / 10, (i + 1) / 10) for i in range(len(text))]


def fake_links(keys, expires_in=0):
    return {k: f"https://signed/{k}" for k in keys if k}


class PieceTests(APITestCase):
    def test_pieces_stay_under_the_limit_and_keep_every_word(self):
        text = "\n".join(f"Paragraph {i}. " + "word " * 120 for i in range(40))
        pieces = services.split_pieces(text, limit=1000)
        self.assertTrue(all(len(p) <= 1000 for p in pieces))
        self.assertEqual(" ".join(pieces).split(), text.split())

    def test_word_timings_use_first_and_last_letter(self):
        words = services.word_timings("Hi there", [(i / 10, (i + 1) / 10) for i in range(8)])
        self.assertEqual(words, [["Hi", 0.0, 0.2], ["there", 0.3, 0.8]])


@override_settings(**KEYS)
class AIMediaTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="pw-123456789", is_admin=True)
        self.story = Story.objects.create(title="She Came Back", price=49, free_chapters=1, status="published")
        self.free = Chapter.objects.create(story=self.story, title="One", order=0, content=[{"insert": "She came back at dawn.\n"}])
        self.paid = Chapter.objects.create(story=self.story, title="Two", order=1, content=[{"insert": "Nobody knew why.\n"}])

    def narrate(self, chapter):
        with mock.patch("ai_media.providers.narration_voice", return_value="voice1"), mock.patch(
            "ai_media.providers.speak", side_effect=fake_speak
        ), mock.patch("ai_media.storage.save", return_value="a.mp3"), mock.patch("ai_media.storage.delete"):
            return services.start_narration(chapter, background=False)

    def test_narration_is_made_and_readers_get_it_only_for_chapters_they_can_read(self):
        for chapter in (self.free, self.paid):
            self.assertEqual(self.narrate(chapter).status, Status.READY)
        narration = ChapterNarration.objects.get(chapter=self.free)
        self.assertEqual([w[0] for w in narration.segments[0]["words"]], ["She", "came", "back", "at", "dawn."])
        self.assertTrue(services.narration_is_current(narration))

        with mock.patch("ai_media.storage.signed_urls", side_effect=fake_links):
            ok = self.client.get(f"/api/stories/{self.story.slug}/chapters/{self.free.id}/narration/")
            locked = self.client.get(f"/api/stories/{self.story.slug}/chapters/{self.paid.id}/narration/")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["segments"][0]["url"], "https://signed/a.mp3")
        self.assertEqual(locked.status_code, 403)

        detail = self.client.get(f"/api/stories/{self.story.slug}/").data
        self.assertTrue(all(c["narrated"] for c in detail["chapters"]))

        # Editing the chapter marks the reading as out of date.
        self.free.content = [{"insert": "She came back at night.\n"}]
        self.free.save()
        narration.refresh_from_db()
        self.assertFalse(services.narration_is_current(narration))

    def test_failed_reading_keeps_the_reason(self):
        from .providers import ProviderError

        with mock.patch("ai_media.providers.narration_voice", side_effect=ProviderError("ElevenLabs: quota reached (401)")):
            narration = services.start_narration(self.free, background=False)
        self.assertEqual(narration.status, Status.FAILED)
        self.assertIn("quota", narration.error)

    def test_reel_is_recorded_kept_and_shown_once_published(self):
        self.client.force_authenticate(self.admin)
        with mock.patch("ai_media.providers.write_reel_script", return_value="Meet Ana."):
            script = self.client.post(f"/api/admin/chapters/{self.free.id}/ai/reel/script/").data["script"]
        with mock.patch("ai_media.providers.start_video", return_value="v_1"), mock.patch(
            "ai_media.providers.video_state", return_value={"status": "processing"}
        ), mock.patch("ai_media.storage.signed_urls", side_effect=fake_links):
            response = self.client.post(
                f"/api/admin/chapters/{self.free.id}/ai/reel/", {"kind": "video", "script": script, "avatar_id": "look_1"}, format="json"
            )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["reel"]["status"], Status.WORKING)

        done = {"status": "completed", "video_url": "https://heygen/v.mp4", "thumbnail_url": "https://heygen/t.jpg", "duration": 52.0, "error": ""}
        with mock.patch("ai_media.providers.video_state", return_value=done), mock.patch(
            "ai_media.providers.download", return_value=b"bytes"
        ), mock.patch("ai_media.storage.save", side_effect=["v.mp4", "t.jpg"]), mock.patch("ai_media.storage.delete"), mock.patch(
            "ai_media.storage.signed_urls", side_effect=fake_links
        ):
            state = self.client.get(f"/api/admin/chapters/{self.free.id}/ai/").data
            self.assertEqual(state["reel"]["status"], Status.READY)
            self.assertEqual(state["last_presenter"], "look_1")

            self.client.force_authenticate(None)
            self.assertEqual(self.client.get("/api/reels/").data, [])  # not published yet
            ChapterReel.objects.update(published=True)
            feed = self.client.get("/api/reels/").data
        self.assertEqual(len(feed), 1)
        self.assertEqual(feed[0]["video_url"], "https://signed/v.mp4")
        self.assertEqual(feed[0]["chapter"]["number"], 1)
        self.assertTrue(feed[0]["story"]["free"])

    @override_settings(ELEVENLABS_API_KEY="", HEYGEN_API_KEY="", ANTHROPIC_API_KEY="", SUPABASE_URL="", SUPABASE_SERVICE_KEY="")
    def test_free_reel_needs_no_services(self):
        self.client.force_authenticate(self.admin)
        state = self.client.post(f"/api/admin/chapters/{self.paid.id}/ai/reel/", {"script": "Nobody knew why."}, format="json").data
        self.assertEqual((state["reel"]["kind"], state["reel"]["status"]), ("voice", Status.READY))
        self.client.patch(f"/api/admin/chapters/{self.paid.id}/ai/reel/", {"published": True}, format="json")

        self.client.force_authenticate(None)
        feed = self.client.get("/api/reels/").data
        self.assertEqual(len(feed), 1)
        self.assertEqual((feed[0]["kind"], feed[0]["script"], feed[0]["video_url"]), ("voice", "Nobody knew why.", None))
        self.assertEqual(feed[0]["chapter"]["number"], 2)
        self.assertFalse(feed[0]["story"]["free"])

    def test_admin_only(self):
        self.assertIn(self.client.get(f"/api/admin/chapters/{self.free.id}/ai/").status_code, (401, 403))
        self.assertIn(self.client.post(f"/api/admin/chapters/{self.free.id}/ai/narration/").status_code, (401, 403))
