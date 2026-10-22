import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_admin", False)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_admin=True, is_staff=True, is_superuser=True, email_verified=True)
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Provider(models.TextChoices):
        EMAIL = "email", "Email and password"
        GOOGLE = "google", "Google"

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    display_name = models.CharField(max_length=120, blank=True)
    avatar_url = models.URLField(blank=True)
    auth_provider = models.CharField(max_length=16, choices=Provider.choices, default=Provider.EMAIL)
    google_sub = models.CharField(max_length=255, unique=True, null=True, blank=True)
    email_verified = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False, help_text="Grants access to /api/admin/ endpoints")
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    preferred_genres = models.ManyToManyField("catalog.Genre", blank=True, related_name="fans")
    # True once the reader has gone through (or skipped) genre onboarding.
    onboarded = models.BooleanField(default=False)
    # "book" = paginated, swipe left/right; "scroll" = one long page.
    reading_mode = models.CharField(
        max_length=10, choices=[("scroll", "Long page"), ("book", "Book pages")], default="scroll"
    )
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email


class UserTheme(models.Model):
    class Theme(models.TextChoices):
        LIGHT = "light", "Light"
        DARK = "dark", "Dark"
        SEPIA = "sepia", "Sepia"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="theme")
    theme_name = models.CharField(max_length=10, choices=Theme.choices, default=Theme.LIGHT)

    def __str__(self):
        return f"{self.user} -> {self.theme_name}"


def _hash_code(code):
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


class EmailOTP(models.Model):
    """A short-lived 6-digit code mailed through Brevo.

    Only a keyed hash of the code is stored. Issuing a new code for the same
    user and purpose invalidates any earlier unused one.
    """

    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email", "Verify email"
        RESET_PASSWORD = "reset_password", "Reset password"
        CHANGE_EMAIL = "change_email", "Confirm new email"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose", "-created_at"])]

    @classmethod
    def issue(cls, user, purpose):
        """Create a fresh code and return (otp, plaintext_code)."""
        now = timezone.now()
        cls.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(consumed_at=now)
        code = f"{secrets.randbelow(1_000_000):06d}"
        otp = cls.objects.create(
            user=user,
            purpose=purpose,
            code_hash=_hash_code(code),
            expires_at=now + timedelta(minutes=settings.OTP_TTL_MINUTES),
        )
        return otp, code

    @classmethod
    def latest_active(cls, user, purpose):
        return (
            cls.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True, expires_at__gt=timezone.now())
            .order_by("-created_at")
            .first()
        )

    @classmethod
    def in_cooldown(cls, user, purpose):
        cutoff = timezone.now() - timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS)
        return cls.objects.filter(user=user, purpose=purpose, created_at__gt=cutoff).exists()

    def check_and_consume(self, code):
        """Return True and consume the code if it matches; count the attempt otherwise."""
        if self.attempts >= settings.OTP_MAX_ATTEMPTS:
            return False
        if hmac.compare_digest(self.code_hash, _hash_code(code.strip())):
            self.consumed_at = timezone.now()
            self.save(update_fields=["consumed_at"])
            return True
        self.attempts += 1
        self.save(update_fields=["attempts"])
        return False


class EmailChangeRequest(models.Model):
    """Readers can't edit their email directly: they ask, an admin approves,
    then the reader proves the new inbox with a code and picks whether to keep
    or change their password."""

    APPROVAL_DAYS = 7

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for admin"
        APPROVED = "approved", "Approved, waiting for the reader"
        DENIED = "denied", "Denied"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    OPEN = (Status.PENDING, Status.APPROVED)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_requests")
    old_email = models.EmailField()
    new_email = models.EmailField()
    reason = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    admin_note = models.CharField(max_length=500, blank=True)
    decided_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def approval_expired(self):
        return bool(
            self.status == self.Status.APPROVED
            and self.decided_at
            and timezone.now() - self.decided_at > timedelta(days=self.APPROVAL_DAYS)
        )
