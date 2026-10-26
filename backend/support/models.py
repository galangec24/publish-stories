from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """A reader's support thread. One per user; admins all share it."""

    # A signed-in reader's thread, or a guest's (no account) identified by their device.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="support_conversation"
    )
    guest_key = models.CharField(max_length=64, blank=True, db_index=True)  # hashed device id
    guest_name = models.CharField(max_length=80, blank=True)
    guest_email = models.EmailField(blank=True)
    guest_ip = models.CharField(max_length=60, blank=True)  # partly hidden, e.g. "49.145.10.•", for the admin only
    # Lets a guest find their thread again after the device id is lost (incognito, cleared data):
    # the hashed network offers it, and the email they left or their chat code proves it's theirs.
    guest_network = models.CharField(max_length=64, blank=True, db_index=True)
    resume_code = models.CharField(max_length=9, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    unread_for_admin = models.PositiveIntegerField(default=0)
    unread_for_user = models.PositiveIntegerField(default=0)
    # Set when the messages were cleared after 30 days without activity (the reader is told).
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-id"]

    def __str__(self):
        return f"Support · {self.user or self.guest_name or 'guest'}"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    from_admin = models.BooleanField(default=False)
    body = models.TextField(max_length=2000, blank=True)
    gif_url = models.URLField(max_length=500, blank=True)
    # Messenger-style reply: the message this one answers (same conversation).
    reply_to = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Messenger-style reactions: one from the reader's side, one from support.
    reader_reaction = models.CharField(max_length=16, blank=True)
    admin_reaction = models.CharField(max_length=16, blank=True)
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


class GuestDevice(models.Model):
    """A device (hashed id) that opens a guest conversation. A thread can have several devices
    (phone, laptop, incognito), each device follows one thread at a time."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="devices")
    device_key = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
