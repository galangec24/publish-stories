from django.conf import settings
from django.db import models


class Subscription(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions")
    story = models.ForeignKey("catalog.Story", on_delete=models.CASCADE, related_name="subscriptions")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    checkout_session_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    checkout_url = models.URLField(max_length=500, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "story", "status"])]

    def __str__(self):
        return f"{self.user} / {self.story} ({self.status})"


class PaymentLog(models.Model):
    subscription = models.ForeignKey(Subscription, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs")
    event_type = models.CharField(max_length=80)
    status = models.CharField(max_length=20)
    signature_valid = models.BooleanField(default=False)
    raw_webhook = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
