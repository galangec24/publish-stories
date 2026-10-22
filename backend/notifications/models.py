from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One item in a user's bell dropdown."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500, blank=True)
    # In-app path to open when clicked, e.g. "/stories/ang-diwata" or "/admin/support".
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "is_read"])]

    def __str__(self):
        return f"{self.user} · {self.title}"
