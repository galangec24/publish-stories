"""Story views and reader counts.

A "view" is one reader opening a story on a given day (refreshing or reading
every chapter doesn't inflate it). A "reader" is a distinct person who has
ever opened the story. Readers are identified by a keyed hash of:
  signed in → the user id (the same person on every device counts once)
  guest     → the browser's random X-Viewer-Id, or the IP address as a fallback
Admins previewing their own stories are not counted.
"""
import hashlib
import hmac
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import Story, StoryView

_VIEWER_ID = re.compile(r"^[A-Za-z0-9-]{16,64}$")


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
    if not (user and user.is_admin):
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
