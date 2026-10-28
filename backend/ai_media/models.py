from django.db import models

from catalog.models import Chapter


class Status(models.TextChoices):
    NONE = "none", "Not made"
    WORKING = "working", "Being made"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class ChapterNarration(models.Model):
    """The AI voice reading a chapter word for word (ElevenLabs).

    The audio is stored in pieces (long chapters are read in several requests); each piece
    keeps the start and end time of every word, so the reader can light up the word being read.
    """

    chapter = models.OneToOneField(Chapter, on_delete=models.CASCADE, related_name="narration")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NONE)
    # [{"key": storage key, "duration": seconds, "words": [[word, start, end], ...]}, ...]
    segments = models.JSONField(default=list, blank=True)
    # Fingerprint of the text and voice it was made from; a different one means the chapter changed since.
    source_hash = models.CharField(max_length=64, blank=True)
    voice_id = models.CharField(max_length=80, blank=True)
    characters = models.PositiveIntegerField(default=0)  # what ElevenLabs bills by
    error = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class ChapterReel(models.Model):
    """A short (about one minute) reel introducing a chapter.

    "voice" (free): the author's photo with the script as captions, read aloud by the viewer's
    own device voice; nothing to render or store. "video" (paid): a HeyGen presenter video.
    """

    class Kind(models.TextChoices):
        VOICE = "voice", "Author photo + device voice"
        VIDEO = "video", "AI presenter video"

    chapter = models.OneToOneField(Chapter, on_delete=models.CASCADE, related_name="reel")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.VOICE)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NONE)
    script = models.TextField(blank=True)
    avatar_id = models.CharField(max_length=120, blank=True)
    provider_video_id = models.CharField(max_length=120, blank=True)
    video_key = models.CharField(max_length=200, blank=True)
    thumbnail_key = models.CharField(max_length=200, blank=True)
    duration = models.FloatField(default=0)
    # Only published reels appear in the Reels tab.
    published = models.BooleanField(default=False)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
