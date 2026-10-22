import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Create or promote the admins listed in ADMIN_EMAIL. Safe to run on every start.

    ADMIN_EMAIL takes one address or several separated by commas:
        ADMIN_EMAIL=owner@gmail.com, helper@gmail.com
    ADMIN_PASSWORD is only used when the *first* account is created. Other new
    admins get no password, so nobody shares one: they sign in with Google
    (same email) or set a password via "Forgot password".
    Removing an email from the list does not remove admin rights.
    Render's free plan has no shell, so this replaces `createsuperuser` there.
    """

    help = "Ensure every ADMIN_EMAIL account exists and has admin rights."

    def handle(self, *args, **options):
        emails = [e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()]
        if not emails:
            self.stdout.write("ADMIN_EMAIL not set; skipping.")
            return
        User = get_user_model()
        for index, email in enumerate(dict.fromkeys(emails)):
            user = User.objects.filter(email__iexact=email).first()
            created = user is None
            if created:
                password = os.environ.get("ADMIN_PASSWORD") if index == 0 else None
                user = User.objects.create_user(email=email, password=password or None)
            user.is_admin = user.is_staff = user.is_superuser = True
            user.email_verified = True
            user.onboarded = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Admin {'created' if created else 'confirmed'}: {email}"))
