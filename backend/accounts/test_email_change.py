from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import EmailChangeRequest, User

PASSWORD = "Kw3nto-ng-Gabi!"


@override_settings(OTP_RESEND_COOLDOWN_SECONDS=0)
class EmailChangeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="old@example.com", password=PASSWORD, first_name="Ana", email_verified=True)
        self.admin = User.objects.create_user(email="admin@example.com", password="x", is_admin=True)
        self.codes = {}
        patcher = mock.patch(
            "accounts.views.send_otp_email",
            lambda user, purpose, code, to_email=None: self.codes.__setitem__(to_email or user.email, code),
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def approve(self, request_id):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/admin/email-requests/{request_id}/decide/", {"decision": "approve"}, format="json")
        self.client.force_authenticate(self.user)
        return response

    def test_email_is_not_editable_through_profile(self):
        self.client.force_authenticate(self.user)
        self.client.patch("/api/user/me/", {"email": "hacker@example.com", "first_name": "Anna"}, format="json")
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")
        self.assertEqual(self.user.first_name, "Anna")

    def test_full_flow_keeping_password(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/user/email-change/", {"new_email": "New@Example.com", "reason": "New job"}, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.admin.notifications.filter(kind="email_request").count(), 1)

        # Can't get a code before approval.
        self.assertEqual(self.client.post("/api/user/email-change/send-code/").status_code, 400)
        self.assertEqual(self.approve(created.data["id"]).data["status"], "approved")
        self.assertEqual(self.user.notifications.filter(kind="email_approved").count(), 1)

        self.assertEqual(self.client.post("/api/user/email-change/send-code/").status_code, 200)
        code = self.codes["new@example.com"]
        done = self.client.post("/api/user/email-change/confirm/", {"code": code, "password_choice": "keep"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["user"]["email"], "new@example.com")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))
        self.assertEqual(EmailChangeRequest.objects.get().status, "completed")

    def test_full_flow_changing_password(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/user/email-change/", {"new_email": "new@example.com"}, format="json")
        self.approve(created.data["id"])
        self.client.post("/api/user/email-change/send-code/")
        missing = self.client.post(
            "/api/user/email-change/confirm/",
            {"code": self.codes["new@example.com"], "password_choice": "change"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        done = self.client.post(
            "/api/user/email-change/confirm/",
            {"code": self.codes["new@example.com"], "password_choice": "change", "new_password": "Bagong-Pass-2026"},
            format="json",
        )
        self.assertEqual(done.status_code, 200, done.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Bagong-Pass-2026"))

    def test_denied_request_and_taken_email(self):
        User.objects.create_user(email="taken@example.com", password="x")
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.post("/api/user/email-change/", {"new_email": "taken@example.com"}, format="json").status_code, 400
        )
        created = self.client.post("/api/user/email-change/", {"new_email": "x@example.com"}, format="json")
        self.assertEqual(
            self.client.post("/api/user/email-change/", {"new_email": "y@example.com"}, format="json").status_code, 400
        )
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/admin/email-requests/{created.data['id']}/decide/", {"decision": "deny", "note": "Use your school email"}, format="json")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/user/email-change/").data["status"], "denied")
        self.assertEqual(self.user.notifications.get(kind="email_denied").body, "Use your school email")

    def test_readers_cannot_decide(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/user/email-change/", {"new_email": "x@example.com"}, format="json")
        response = self.client.post(f"/api/admin/email-requests/{created.data['id']}/decide/", {"decision": "approve"}, format="json")
        self.assertEqual(response.status_code, 403)
