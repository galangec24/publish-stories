import secrets

from django.conf import settings
from django.db import models

# No 0/O, 1/I/L: codes are read aloud and typed from screenshots.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_access_code():
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


class PaymentMethod(models.Model):
    """A QR code readers scan to pay (GCash, a bank's InstaPay QR, ...). Managed by admins."""

    name = models.CharField(max_length=60, help_text="e.g. GCash, BPI")
    account_name = models.CharField(max_length=120, blank=True)
    account_number = models.CharField(max_length=60, blank=True, help_text="Shown as typed, so mask it if you like")
    qr_url = models.URLField(max_length=500)
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name


class Subscription(models.Model):
    """One purchase of one story: a PayMongo checkout or a QR payment the admin confirms by hand."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"
        REJECTED = "rejected", "Rejected"

    class Provider(models.TextChoices):
        PAYMONGO = "paymongo", "PayMongo"
        MANUAL = "manual", "QR transfer"

    # Empty for guests, who unlock by device, network or access code instead.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="subscriptions"
    )
    story = models.ForeignKey("catalog.Story", on_delete=models.CASCADE, related_name="subscriptions")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider = models.CharField(max_length=10, choices=Provider.choices, default=Provider.PAYMONGO)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    checkout_session_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    # QR transfers
    method = models.ForeignKey(PaymentMethod, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    reference_number = models.CharField(max_length=40, blank=True, db_index=True)
    payer_name = models.CharField(max_length=120, blank=True)
    payer_email = models.EmailField(blank=True)
    access_code = models.CharField(max_length=9, unique=True, null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.CharField(max_length=300, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "story", "status"])]

    def __str__(self):
        return f"{self.user or self.payer_name or self.access_code} / {self.story} ({self.status})"


class PaymentProof(models.Model):
    """Receipt screenshot. Kept apart from Subscription so listings don't load it, and only admins can view it."""

    subscription = models.OneToOneField(Subscription, on_delete=models.CASCADE, related_name="proof")
    data = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)


class AccessGrant(models.Model):
    """A device that may read a paid story, and the network it was last seen on.

    Other devices on that network are let in too (and get their own grant) until
    the purchase reaches settings.ACCESS_MAX_DEVICES.
    """

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="grants")
    device_key = models.CharField(max_length=64, db_index=True)
    network_key = models.CharField(max_length=64, blank=True, db_index=True)
    network_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subscription", "device_key"], name="one_grant_per_device")]


class PaymentLog(models.Model):
    subscription = models.ForeignKey(Subscription, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs")
    event_type = models.CharField(max_length=80)
    status = models.CharField(max_length=20)
    signature_valid = models.BooleanField(default=False)
    raw_webhook = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
