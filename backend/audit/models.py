from django.conf import settings
from django.db import models


class AdminLog(models.Model):
    """One change an admin made (edited a story, revoked a payment, ...)."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    actor_email = models.EmailField()  # kept if the admin account is later removed
    action = models.CharField(max_length=60)
    target_type = models.CharField(max_length=30, blank=True)
    target_id = models.CharField(max_length=40, blank=True)
    target_label = models.CharField(max_length=200, blank=True)
    changes = models.JSONField(default=dict, blank=True)  # small values sent, e.g. {"price": "59.00"}
    path = models.CharField(max_length=200)
    count = models.PositiveIntegerField(default=1)  # repeated autosaves folded into one entry
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.actor_email}: {self.action} {self.target_label}"
