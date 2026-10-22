import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from . import delta


def unique_slug(model, text, instance_pk=None, max_length=200):
    base = slugify(text)[: max_length - 8] or "item"
    slug, n = base, 2
    while model.objects.filter(slug=slug).exclude(pk=instance_pk).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


class Genre(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True, blank=True)
    description = models.CharField(max_length=255, blank=True)
    color = models.CharField(max_length=7, default="#6750A4", help_text="Hex colour for genre chips")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Genre, self.name, self.pk, 70)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Column(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False, help_text="Stories in public columns are free for everyone")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Column, self.title, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Story(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    author_name = models.CharField(max_length=120, blank=True)
    synopsis = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to="covers/", blank=True)
    column = models.ForeignKey(Column, null=True, blank=True, on_delete=models.SET_NULL, related_name="stories")
    genres = models.ManyToManyField(Genre, blank=True, related_name="stories")
    preview_page_count = models.PositiveIntegerField(
        default=3, help_text="Paragraphs shown to readers who haven't unlocked the story"
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="PHP; 0 means free")
    # Reading typography chosen by the author; readers see the story in this font and size.
    font_family = models.CharField(
        max_length=20,
        default="literata",
        choices=[
            ("literata", "Literata"),
            ("lora", "Lora"),
            ("merriweather", "Merriweather"),
            ("playfair", "Playfair Display"),
            ("source_serif", "Source Serif"),
            ("inter", "Inter"),
            ("nunito", "Nunito"),
        ],
    )
    font_size = models.PositiveSmallIntegerField(default=18, help_text="Base reading size in px (14-26)")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    word_count = models.PositiveIntegerField(default=0)
    # Denormalised counters, maintained by record_view().
    view_count = models.PositiveIntegerField(default=0, help_text="Reads, at most one per reader per day")
    reader_count = models.PositiveIntegerField(default=0, help_text="Distinct readers, all time")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="stories"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]
        verbose_name_plural = "stories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Story, self.title, self.pk)
        if self.status == self.Status.PUBLISHED and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    @property
    def is_free(self):
        return self.price <= 0 or bool(self.column and self.column.is_public)

    def refresh_word_count(self):
        self.word_count = sum(self.chapters.values_list("word_count", flat=True))
        Story.objects.filter(pk=self.pk).update(word_count=self.word_count)

    def __str__(self):
        return self.title


class StoryView(models.Model):
    """One row per reader per story per day.

    `viewer_key` is a keyed hash of the user id (signed in) or of the browser's
    random viewer id / IP address (guests), so no raw identifiers are stored.
    """

    story = models.ForeignKey(Story, on_delete=models.CASCADE, related_name="views")
    viewer_key = models.CharField(max_length=64, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["story", "viewer_key", "date"], name="one_view_per_reader_per_day")]


class Chapter(models.Model):
    story = models.ForeignKey(Story, on_delete=models.CASCADE, related_name="chapters")
    title = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)
    content = models.JSONField(default=delta.empty_document, help_text="Quill Delta ops")
    word_count = models.PositiveIntegerField(default=0)
    # Bumped on every save; the editor sends the revision it loaded so concurrent
    # edits from two admins are rejected instead of silently overwritten.
    revision = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]

    def save(self, *args, **kwargs):
        self.content = delta.normalize(self.content)
        self.word_count = delta.word_count(self.content)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.story} / {self.title or self.order}"


class StoryImage(models.Model):
    """An image placed inside a chapter.

    Stored in the database (as compressed WebP) rather than on disk, because
    Render's disk is wiped on every deploy. The id is a random UUID so image
    URLs can't be guessed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    data = models.BinaryField()
    content_type = models.CharField(max_length=40, default="image/webp")
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)


class AboutProfile(models.Model):
    """The home page's About Me and "From the Author's Desk" content (one row, pk=1)."""

    name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=200, blank=True)
    intro = models.TextField(blank=True)
    closing = models.TextField(blank=True)
    photo_url = models.CharField(max_length=500, blank=True)
    roles = models.JSONField(default=list, blank=True)  # [{icon, title, text}]
    links = models.JSONField(default=list, blank=True)  # [{label, url}]
    blog_heading = models.CharField(max_length=200, blank=True)
    blog_intro = models.TextField(blank=True)
    blog_cards = models.JSONField(default=list, blank=True)  # [{icon, title, text}]
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"About {self.name}"
