from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from catalog.models import Genre

from .models import EmailOTP, User

PASSWORD = "Kw3nto-ng-Gabi!"


class CapturedCodes:
    """Stands in for Brevo and remembers the last code mailed to each address."""

    def __init__(self):
        self.codes = {}

    def __call__(self, user, purpose, code):
        self.codes[(user.email, purpose)] = code


@override_settings(OTP_RESEND_COOLDOWN_SECONDS=0)
class EmailAuthTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.mail = CapturedCodes()
        patcher = mock.patch("accounts.views.send_otp_email", self.mail)
        patcher.start()
        self.addCleanup(patcher.stop)

    def register(self, email="reader@example.com"):
        return self.client.post("/api/auth/register/", {"email": email, "password": PASSWORD, "display_name": "Ana"})

    def test_register_verify_then_login(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_sent"])

        login = self.client.post("/api/auth/login/", {"email": "reader@example.com", "password": PASSWORD})
        self.assertEqual(login.status_code, 403)
        self.assertEqual(login.data["code"], "email_not_verified")

        code = self.mail.codes[("reader@example.com", "verify_email")]
        verified = self.client.post("/api/auth/verify-email/", {"email": "reader@example.com", "code": code})
        self.assertEqual(verified.status_code, 200)
        self.assertIn("access", verified.data)
        self.assertTrue(verified.data["user"]["email_verified"])

        login = self.client.post("/api/auth/login/", {"email": "READER@example.com", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)

    def test_wrong_code_counts_attempts_and_locks(self):
        self.register()
        for _ in range(5):
            self.client.post("/api/auth/verify-email/", {"email": "reader@example.com", "code": "000000"})
        code = self.mail.codes[("reader@example.com", "verify_email")]
        response = self.client.post("/api/auth/verify-email/", {"email": "reader@example.com", "code": code})
        if code != "000000":
            self.assertEqual(response.status_code, 400)

    def test_duplicate_verified_email_rejected(self):
        User.objects.create_user(email="reader@example.com", password=PASSWORD, email_verified=True)
        self.assertEqual(self.register().status_code, 400)

    def test_weak_password_rejected(self):
        response = self.client.post("/api/auth/register/", {"email": "a@example.com", "password": "12345678"})
        self.assertEqual(response.status_code, 400)

    def test_password_reset(self):
        User.objects.create_user(email="reader@example.com", password=PASSWORD, email_verified=True)
        response = self.client.post("/api/auth/password/reset/", {"email": "reader@example.com"})
        self.assertEqual(response.status_code, 200)
        code = self.mail.codes[("reader@example.com", "reset_password")]
        response = self.client.post(
            "/api/auth/password/reset/confirm/",
            {"email": "reader@example.com", "code": code, "new_password": "Bagong-Pass-2026"},
        )
        self.assertEqual(response.status_code, 200)
        login = self.client.post("/api/auth/login/", {"email": "reader@example.com", "password": "Bagong-Pass-2026"})
        self.assertEqual(login.status_code, 200)

    def test_reset_for_unknown_email_is_generic(self):
        response = self.client.post("/api/auth/password/reset/", {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(EmailOTP.objects.exists())


@override_settings(GOOGLE_CLIENT_IDS=["web-client"])
class GoogleAuthTests(APITestCase):
    def setUp(self):
        cache.clear()

    def google_info(self, **extra):
        return {"sub": "g-123", "email": "juan@gmail.com", "email_verified": True, "aud": "web-client", "name": "Juan", **extra}

    def test_google_creates_account(self):
        with mock.patch("accounts.views.verify_id_token", return_value=self.google_info()):
            response = self.client.post("/api/auth/google/", {"id_token": "token"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["created"])
        user = User.objects.get(email="juan@gmail.com")
        self.assertEqual(user.auth_provider, "google")
        self.assertFalse(user.has_usable_password())

    def test_google_links_existing_unverified_account_and_drops_password(self):
        User.objects.create_user(email="juan@gmail.com", password=PASSWORD)
        with mock.patch("accounts.views.verify_id_token", return_value=self.google_info()):
            response = self.client.post("/api/auth/google/", {"id_token": "token"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["created"])
        user = User.objects.get(email="juan@gmail.com")
        self.assertEqual(user.google_sub, "g-123")
        self.assertFalse(user.has_usable_password())

    def test_desktop_code_flow(self):
        with mock.patch("accounts.views.exchange_desktop_code", return_value=self.google_info()) as exchange:
            response = self.client.post(
                "/api/auth/google/",
                {"code": "abc", "code_verifier": "v" * 43, "redirect_uri": "http://127.0.0.1:5123/"},
            )
        self.assertEqual(response.status_code, 200)
        exchange.assert_called_once()

    def test_requires_token_or_code(self):
        self.assertEqual(self.client.post("/api/auth/google/", {}).status_code, 400)


class PreferenceTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="r@example.com", password=PASSWORD, email_verified=True)
        self.client.force_authenticate(self.user)

    def test_genre_onboarding(self):
        romance = Genre.objects.create(name="Romance")
        horror = Genre.objects.create(name="Horror")
        response = self.client.put("/api/user/genres/", {"genre_ids": [romance.id, horror.id]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({g["slug"] for g in response.data}, {"romance", "horror"})
        me = self.client.get("/api/user/me/").data
        self.assertTrue(me["onboarded"])
        self.assertEqual(len(me["preferred_genres"]), 2)

    def test_theme(self):
        self.assertEqual(self.client.put("/api/user/theme/", {"theme_name": "sepia"}).status_code, 200)
        self.assertEqual(self.client.get("/api/user/me/").data["theme"], "sepia")
        self.assertEqual(self.client.put("/api/user/theme/", {"theme_name": "neon"}).status_code, 400)
