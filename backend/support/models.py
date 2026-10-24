from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A reader's support thread. One per user; admins all share it."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_conversation")
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    unread_for_admin = models.PositiveIntegerField(default=0)
    unread_for_user = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-last_message_at", "-id"]

    def __str__(self):
        return f"Support · {self.user}"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    from_admin = models.BooleanField(default=False)
    body = models.TextField(max_length=2000, blank=True)
    gif_url = models.URLField(max_length=500, blank=True)
    # A file sent with the message; the bytes live in Supabase Storage (or StoredFile).
    file_key = models.CharField(max_length=200, blank=True)
    file_name = models.CharField(max_length=200, blank=True)
    file_type = models.CharField(max_length=100, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class StoredFile(models.Model):
    """Attachment bytes, used only when Supabase Storage isn't configured (small files)."""

    key = models.CharField(max_length=200, unique=True)
    data = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
