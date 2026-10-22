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

    def __call__(self, user, purpose, code, to_email=None):
        self.codes[(to_email or user.email, purpose)] = code


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

    def test_reset_for_unknown_email_stops_without_issuing_a_code(self):
        response = self.client.post("/api/auth/password/reset/", {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 404)
        self.assertIn("No account", response.data["email"][0])
        resend = self.client.post("/api/auth/resend-code/", {"email": "nobody@example.com", "purpose": "reset_password"})
        self.assertEqual(resend.status_code, 404)
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


@override_settings(
    OTP_RESEND_COOLDOWN_SECONDS=60, OTP_MAX_PER_HOUR=3, OTP_MAX_PER_DAY=5, OTP_GLOBAL_DAILY_LIMIT=1000, OTP_MAX_FAILED_PER_HOUR=4
)
class OtpAntiSpamTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.mail = CapturedCodes()
        patcher = mock.patch("accounts.views.send_otp_email", self.mail)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = User.objects.create_user(email="r@example.com", password=PASSWORD, email_verified=True)

    def reset(self):
        cache.clear()  # isolate from the per-IP throttle
        return self.client.post("/api/auth/password/reset/", {"email": "r@example.com"})

    def age_codes(self, seconds):
        from datetime import timedelta

        from django.utils import timezone

        for otp in EmailOTP.objects.all():
            EmailOTP.objects.filter(pk=otp.pk).update(created_at=otp.created_at - timedelta(seconds=seconds))

    def test_cooldown_between_codes(self):
        self.assertEqual(self.reset().status_code, 200)
        second = self.reset()
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "otp_rate_limited")
        self.assertTrue(0 < second.data["retry_after"] <= 60)
        self.assertIn("Retry-After", second)

    def test_hourly_cap(self):
        for _ in range(3):
            self.assertEqual(self.reset().status_code, 200)
            self.age_codes(61)  # past the cooldown, still inside the hour
        capped = self.reset()
        self.assertEqual(capped.status_code, 429)
        self.assertIn("too many codes", capped.data["detail"])

    def test_global_daily_cap(self):
        with override_settings(OTP_GLOBAL_DAILY_LIMIT=1):
            self.assertEqual(self.reset().status_code, 200)
            other = User.objects.create_user(email="o@example.com", password=PASSWORD, email_verified=True)
            cache.clear()
            response = self.client.post("/api/auth/password/reset/", {"email": other.email})
            self.assertEqual(response.status_code, 429)

    def test_lockout_after_repeated_wrong_codes(self):
        self.reset()
        code = self.mail.codes[("r@example.com", "reset_password")]
        wrong = "000000" if code != "000000" else "111111"
        body = {"email": "r@example.com", "code": wrong, "new_password": "Bagong-Pass-2026"}
        for _ in range(4):
            cache.clear()
            self.assertEqual(self.client.post("/api/auth/password/reset/confirm/", body).status_code, 400)
        cache.clear()
        locked = self.client.post("/api/auth/password/reset/confirm/", {**body, "code": code})
        self.assertEqual(locked.status_code, 429)
        self.assertIn("Too many incorrect codes", locked.data["detail"])

    def test_login_of_unverified_account_respects_limits(self):
        unverified = User.objects.create_user(email="u@example.com", password=PASSWORD)
        first = self.client.post("/api/auth/login/", {"email": unverified.email, "password": PASSWORD})
        self.assertEqual(first.status_code, 403)
        cache.clear()
        second = self.client.post("/api/auth/login/", {"email": unverified.email, "password": PASSWORD})
        self.assertEqual(second.status_code, 403)
        self.assertIn("already sent", second.data["detail"])
        self.assertEqual(EmailOTP.objects.filter(user=unverified).count(), 1)
