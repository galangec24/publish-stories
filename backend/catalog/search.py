"""Search-as-you-type for the home page, with "Hot read" and "Recommended" tags."""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Story, StoryView
from .views import published_stories

HOT_DAYS = 7
HOT_COUNT = 5
LIMIT = 8


def hot_story_ids():
    """The most-read stories of the last week (readers per day, so refreshing doesn't count)."""
    since = timezone.localdate() - timedelta(days=HOT_DAYS)
    return list(
        StoryView.objects.filter(date__gte=since, story__status=Story.Status.PUBLISHED)
        .values("story_id")
        .annotate(n=Count("id"))
        .order_by("-n")
        .values_list("story_id", flat=True)[:HOT_COUNT]
    )


def suggestion(story, request, hot, preferred):
    cover = story.cover_image.url if story.cover_image else ""
    genres = list(story.genres.all())
    return {
        "id": story.id,
        "title": story.title,
        "slug": story.slug,
        "author_name": story.author_name,
        "cover_image": request.build_absolute_uri(cover) if cover and cover.startswith("/") else cover,
        "genre": {"name": genres[0].name, "color": genres[0].color} if genres else None,
        "column": story.column.title if story.column_id else "",
        "view_count": story.view_count,
        "is_free": story.is_free,
        "hot": story.id in hot,
        "recommended": bool(preferred & {g.id for g in genres}),
    }


class SearchSuggestView(APIView):
    """GET /api/search/suggest/?q=text → up to 8 matches; without q, what's hot right now."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = " ".join(request.query_params.get("q", "").split())[:80]
        hot = hot_story_ids()
        preferred = set()
        if request.user.is_authenticated:
            preferred = set(request.user.preferred_genres.values_list("id", flat=True))

        stories = published_stories()
        if q:
            stories = stories.filter(
                Q(title__icontains=q) | Q(author_name__icontains=q) | Q(synopsis__icontains=q)
                | Q(genres__name__icontains=q) | Q(column__title__icontains=q)
            ).distinct()
            found = list(stories[:50])
            # Title matches first, then hot and recommended stories, then the most viewed.
            found.sort(
                key=lambda s: (
                    q.lower() not in s.title.lower(),
                    not s.title.lower().startswith(q.lower()),
                    s.id not in hot,
                    not (preferred & {g.id for g in s.genres.all()}),
                    -s.view_count,
                )
            )
            results = found[:LIMIT]
        else:
            by_id = {s.id: s for s in stories.filter(id__in=hot)}
            results = [by_id[i] for i in hot if i in by_id]
            if len(results) < LIMIT:
                results += list(stories.exclude(id__in=hot).order_by("-view_count")[: LIMIT - len(results)])
        return Response({"query": q, "results": [suggestion(s, request, hot, preferred) for s in results]})
