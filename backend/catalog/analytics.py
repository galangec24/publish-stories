"""Story views and reader counts.

A "view" is one reader opening a story on a given day (refreshing or reading
every chapter doesn't inflate it). A "reader" is a distinct person who has
ever opened the story. Readers are identified by a keyed hash of:
  signed in → the user id (the same person on every device counts once)
  guest     → the browser's random X-Viewer-Id, or the IP address as a fallback
Admins are never counted: not when signed in, and not from any browser they have used
as an admin, even when signed out there (see StaffDevice).
"""
import hashlib
import hmac
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import StaffDevice, Story, StoryView

_VIEWER_ID = re.compile(r"^[A-Za-z0-9-]{16,64}$")


def _hash(raw):
    return hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def guest_key(request):
    """The key this browser gets when nobody is signed in on it (None without a valid X-Viewer-Id)."""
    header = request.headers.get("X-Viewer-Id", "")
    return _hash(f"guest:{header}") if _VIEWER_ID.match(header) else None


def remember_staff_device(request):
    """Called on admin requests: this browser's views stop counting, and any it added are removed."""
    key = guest_key(request)
    if not key:
        return
    _, created = StaffDevice.objects.get_or_create(viewer_key=key)
    if created:
        affected = list(StoryView.objects.filter(viewer_key=key).values_list("story_id", flat=True).distinct())
        StoryView.objects.filter(viewer_key=key).delete()
        recount(affected)


def recount(story_ids):
    """Rebuild views and readers from the StoryView rows."""
    for story_id in story_ids:
        rows = StoryView.objects.filter(story_id=story_id)
        Story.objects.filter(pk=story_id).update(view_count=rows.count(), reader_count=rows.values("viewer_key").distinct().count())


def viewer_key(request):
    if request.user.is_authenticated:
        raw = f"user:{request.user.pk}"
    else:
        header = request.headers.get("X-Viewer-Id", "")
        if _VIEWER_ID.match(header):
            raw = f"guest:{header}"
        else:
            forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
            raw = f"ip:{forwarded.split(',')[0].strip() or request.META.get('REMOTE_ADDR', '')}"
    return hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def record_view(request, story):
    """Count this request as a view if it's the reader's first today. Returns the story's counters."""
    user = request.user if request.user.is_authenticated else None
    if user and user.is_admin:
        remember_staff_device(request)
    staff_browser = user is None and StaffDevice.objects.filter(viewer_key=guest_key(request) or "-").exists()
    if not (user and user.is_admin) and not staff_browser:
        key = viewer_key(request)
        today = timezone.localdate()
        try:
            with transaction.atomic():
                StoryView.objects.create(story=story, viewer_key=key, user=user, date=today)
                first_time = not StoryView.objects.filter(story=story, viewer_key=key).exclude(date=today).exists()
                Story.objects.filter(pk=story.pk).update(
                    view_count=F("view_count") + 1,
                    reader_count=F("reader_count") + (1 if first_time else 0),
                )
        except IntegrityError:
            pass  # already counted today
    story.refresh_from_db(fields=["view_count", "reader_count"])
    return {"view_count": story.view_count, "reader_count": story.reader_count}


def platform_stats():
    published = Story.objects.filter(status=Story.Status.PUBLISHED)
    return {
        "total_readers": StoryView.objects.values("viewer_key").distinct().count(),
        "total_views": published.aggregate(total=Sum("view_count"))["total"] or 0,
        "published_stories": published.count(),
    }
