import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Create or promote the admin named by ADMIN_EMAIL. Safe to run on every start.

    Render's free plan has no shell, so this replaces `createsuperuser` there.
    ADMIN_PASSWORD is only used when the account is first created; after that,
    change the password through "Forgot password" in the app. If you sign in
    with Google using the same email, the accounts are linked.
    """

    help = "Ensure the ADMIN_EMAIL account exists and has admin rights."

    def handle(self, *args, **options):
        email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
        if not email:
            self.stdout.write("ADMIN_EMAIL not set; skipping.")
            return
        User = get_user_model()
        user = User.objects.filter(email__iexact=email).first()
        created = user is None
        if created:
            user = User.objects.create_user(email=email, password=os.environ.get("ADMIN_PASSWORD") or None)
        user.is_admin = user.is_staff = user.is_superuser = True
        user.email_verified = True
        user.onboarded = True
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Admin {'created' if created else 'confirmed'}: {email}"))
