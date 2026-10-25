"""Star ratings and reading progress.

Signed-in readers can rate any story. Readers without an account can rate once
they have opened every chapter of it on that device; the server records each
chapter it actually served them (POST .../progress/), so this can't be skipped.
Admins don't rate, so the author's own stars never count.
"""
from django.db import IntegrityError
from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from payments.access import device_key, has_full_access

from .models import ChapterRead, Story, StoryRating


def reader_key(request):
    if request.user.is_authenticated:
        return f"user:{request.user.pk}"
    device = device_key(request)
    return f"device:{device}" if device else ""


def refresh_rating(story):
    row = story.ratings.aggregate(avg=Avg("stars"), n=Count("id"))
    Story.objects.filter(pk=story.pk).update(rating_avg=round(row["avg"] or 0, 2), rating_count=row["n"])


def progress(story, key):
    """(chapters read, chapters to read). Empty chapters don't count."""
    to_read = set(story.chapters.filter(word_count__gt=0).values_list("id", flat=True))
    read = set(ChapterRead.objects.filter(story=story, reader_key=key, chapter_id__in=to_read).values_list("chapter_id", flat=True)) if key else set()
    return len(read), len(to_read)


def reading_position(request, story):
    """Chapters this reader has opened, and the one they opened last (to continue reading)."""
    key = reader_key(request)
    if not key:
        return {"read_chapters": [], "last_chapter": None}
    reads = list(ChapterRead.objects.filter(story=story, reader_key=key).order_by("-last_opened_at").values_list("chapter_id", flat=True))
    return {"read_chapters": reads, "last_chapter": reads[0] if reads else None}


def rating_state(request, story):
    key = reader_key(request)
    mine = StoryRating.objects.filter(story=story, reader_key=key).values_list("stars", flat=True).first() if key else None
    read, total = progress(story, key)
    user = request.user
    if user.is_authenticated and user.is_admin:
        can, reason = False, "Authors and admins don't rate stories."
    elif user.is_authenticated:
        can, reason = True, ""
    elif not key:
        can, reason = False, "Your browser is blocking site storage, so we can't remember your rating."
    elif total and read >= total:
        can, reason = True, ""
    else:
        can, reason = False, f"Finish all {total} chapters to rate this story, or sign in to rate any time."
    story.refresh_from_db(fields=["rating_avg", "rating_count"])
    return {
        "average": float(story.rating_avg),
        "count": story.rating_count,
        "mine": mine,
        "can_rate": can,
        "reason": reason,
        "chapters_read": read,
        "chapters_total": total,
    }


class RatingView(APIView):
    """GET/POST /api/stories/<slug>/rating/  POST {"stars": 1-5}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "comment"

    def get_throttles(self):
        return super().get_throttles() if self.request.method == "POST" else []

    def get(self, request, slug):
        story = get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)
        return Response(rating_state(request, story))

    def post(self, request, slug):
        story = get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)
        state = rating_state(request, story)
        if not state["can_rate"]:
            return Response({"detail": state["reason"]}, status=403)
        try:
            stars = int(request.data.get("stars"))
        except (TypeError, ValueError):
            stars = 0
        if not 1 <= stars <= 5:
            return Response({"stars": ["Choose 1 to 5 stars."]}, status=400)
        user = request.user if request.user.is_authenticated else None
        StoryRating.objects.update_or_create(story=story, reader_key=reader_key(request), defaults={"stars": stars, "user": user})
        refresh_rating(story)
        return Response(rating_state(request, story))


class ProgressView(APIView):
    """POST /api/stories/<slug>/progress/ {"chapter": id} — the reader opened this chapter."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "views"

    def post(self, request, slug):
        story = get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)
        chapters = list(story.chapters.only("id"))
        try:
            chapter_id = int(request.data.get("chapter"))
        except (TypeError, ValueError):
            return Response({"chapter": ["Which chapter?"]}, status=400)
        index = next((i for i, c in enumerate(chapters) if c.id == chapter_id), None)
        if index is None:
            return Response({"chapter": ["Not a chapter of this story."]}, status=400)
        # Only chapters this reader could actually read count as read.
        if index >= story.free_chapters and not has_full_access(request, story):
            return Response({"recorded": False})
        key = reader_key(request)
        if key:
            try:
                read, created = ChapterRead.objects.get_or_create(story=story, chapter_id=chapter_id, reader_key=key)
                if not created:
                    read.save(update_fields=["last_opened_at"])  # reopening it makes it "where I left off"
            except IntegrityError:
                pass
        read, total = progress(story, key)
        return Response({"recorded": bool(key), "chapters_read": read, "chapters_total": total})

