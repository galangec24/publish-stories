from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Translation


class TranslateTests(APITestCase):
    def setUp(self):
        cache.clear()

    @override_settings(GOOGLE_TRANSLATE_API_KEY="key")
    def test_translates_once_then_serves_from_cache(self):
        fake = mock.Mock(side_effect=lambda texts, target: [f"<{target}>{t}" for t in texts])
        with mock.patch("translations.service._google", fake):
            first = self.client.post(
                "/api/translate/", {"target": "fil", "texts": ["Sign in", "Stories", "Sign in"]}, format="json"
            )
            second = self.client.post("/api/translate/", {"target": "fil", "texts": ["Stories", "New"]}, format="json")
        self.assertEqual(first.data["translations"], ["<fil>Sign in", "<fil>Stories", "<fil>Sign in"])
        self.assertEqual(second.data["translations"], ["<fil>Stories", "<fil>New"])
        # Duplicates within a batch and strings already cached are never re-sent.
        self.assertEqual([c.args[0] for c in fake.call_args_list], [["Sign in", "Stories"], ["New"]])
        self.assertEqual(Translation.objects.count(), 3)

    @override_settings(GOOGLE_TRANSLATE_API_KEY="")
    def test_falls_back_to_mymemory(self):
        with mock.patch("translations.service._mymemory_one", side_effect=lambda t, target: t.upper()) as one:
            response = self.client.post("/api/translate/", {"target": "ceb", "texts": ["hello"]}, format="json")
        self.assertEqual(response.data["translations"], ["HELLO"])
        one.assert_called_once()

    def test_english_is_passthrough_and_bad_language_rejected(self):
        self.assertEqual(
            self.client.post("/api/translate/", {"target": "en", "texts": ["Hi"]}, format="json").data["translations"],
            ["Hi"],
        )
        self.assertEqual(self.client.post("/api/translate/", {"target": "xx", "texts": ["Hi"]}, format="json").status_code, 400)

    def test_provider_failure_is_503(self):
        with mock.patch("translations.views.translate_texts", side_effect=RuntimeError("down")):
            response = self.client.post("/api/translate/", {"target": "fil", "texts": ["Hi"]}, format="json")
        self.assertEqual(response.status_code, 503)

    def test_google_key_replaces_cached_fallback_translations(self):
        with override_settings(GOOGLE_TRANSLATE_API_KEY=""), mock.patch(
            "translations.service._mymemory_one", return_value="lahat tungkol sa akin"
        ):
            self.client.post("/api/translate/", {"target": "fil", "texts": ["About Me"]}, format="json")
        with override_settings(GOOGLE_TRANSLATE_API_KEY="key"), mock.patch(
            "translations.service._google", return_value=["Tungkol sa Akin"]
        ):
            response = self.client.post("/api/translate/", {"target": "fil", "texts": ["About Me"]}, format="json")
        self.assertEqual(response.data["translations"], ["Tungkol sa Akin"])
        self.assertEqual(Translation.objects.get().provider, "google")

    def test_language_list(self):
        codes = [l["code"] for l in self.client.get("/api/translate/languages/").data["languages"]]
        self.assertIn("fil", codes)
        self.assertIn("ceb", codes)
