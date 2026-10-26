from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from payments.access import purchases_for
from payments.manual import PurchaseSerializer
from payments.models import Subscription

from .analytics import platform_stats, record_view
from .models import Chapter, Column, Genre, Story
from .paywall import has_full_access, reader_chapters
from .ratings import reading_position
from .serializers import ColumnSerializer, GenreSerializer, StoryListSerializer

SHELF_SIZE = 12


def published_stories():
    return (
        Story.objects.filter(status=Story.Status.PUBLISHED)
        .select_related("column")
        .prefetch_related("genres", Prefetch("chapters", queryset=Chapter.objects.only("id", "story_id")))
    )


def filter_stories(queryset, params):
    """Shared filters: ?genre=slug (repeatable or comma separated), ?column=slug|none|any, ?q=text, ?free=true."""
    genres = [g for value in params.getlist("genre") for g in value.split(",") if g]
    if genres:
        queryset = queryset.filter(genres__slug__in=genres).distinct()
    column = params.get("column")
    if column == "none":
        queryset = queryset.filter(column__isnull=True)
    elif column == "any":
        queryset = queryset.filter(column__isnull=False)
    elif column:
        queryset = queryset.filter(column__slug=column)
    if params.get("q"):
        q = params["q"].strip()
        queryset = queryset.filter(Q(title__icontains=q) | Q(synopsis__icontains=q) | Q(author_name__icontains=q))
    if params.get("free") in {"1", "true"}:
        queryset = queryset.filter(Q(price__lte=0) | Q(column__is_public=True) | Q(all_chapters_free=True))
    ordering = params.get("ordering")
    if ordering in {"popular", "readers"}:
        queryset = queryset.order_by("-view_count" if ordering == "popular" else "-reader_count")
    elif ordering == "best":
        queryset = queryset.order_by("-like_count", "-rating_avg", "-rating_count", "-published_at")
    return queryset


class GenreListView(generics.ListAPIView):
    serializer_class = GenreSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        return Genre.objects.filter(is_active=True)


class ColumnListView(APIView):
    """GET /api/columns/ — the Columns tab: columns with a link (to SunStar), public ones, and any with pieces. Newest first."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        stories = published_stories().order_by("-like_count", "-rating_avg", "-rating_count", "-published_at")
        columns = Column.objects.annotate(
            story_count=Count("stories", filter=Q(stories__status=Story.Status.PUBLISHED))
        ).filter(Q(story_count__gt=0) | Q(is_public=True) | ~Q(url="")).order_by("-created_at")
        return Response(
            [
                {
                    **ColumnSerializer(column).data,
                    "story_count": column.story_count,
                    "stories": StoryListSerializer(
                        stories.filter(column=column)[:SHELF_SIZE], many=True, context={"request": request}
                    ).data,
                }
                for column in columns
            ]
        )


class ColumnDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        column = get_object_or_404(Column, slug=slug)
        stories = published_stories().filter(column=column)
        return Response(
            {
                **ColumnSerializer(column).data,
                "stories": StoryListSerializer(stories, many=True, context={"request": request}).data,
            }
        )


class StoryListView(generics.ListAPIView):
    serializer_class = StoryListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return filter_stories(published_stories(), self.request.query_params)


class StoryDetailView(APIView):
    """Story with chapters, truncated server-side when the reader hasn't unlocked it."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        queryset = Story.objects.select_related("column").prefetch_related("genres", "chapters")
        if not (request.user.is_authenticated and request.user.is_admin):
            queryset = queryset.filter(status=Story.Status.PUBLISHED)
        story = get_object_or_404(queryset, slug=slug)
        full_access = has_full_access(request, story)
        chapters, locked = reader_chapters(story, full_access)
        data = StoryListSerializer(story, context={"request": request}).data
        purchase = None
        if locked:  # e.g. a QR payment the author hasn't confirmed yet
            mine = purchases_for(request, story).filter(provider=Subscription.Provider.MANUAL)
            latest = mine.select_related("story", "method").order_by("-created_at").first()
            purchase = PurchaseSerializer(latest).data if latest else None
        data.update(chapters=chapters, locked=locked, has_access=full_access, purchase=purchase, **reading_position(request, story))
        return Response(data)


class RecordViewView(APIView):
    """POST /api/stories/<slug>/view/ when a reader opens a story → current counters."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "views"

    def post(self, request, slug):
        story = get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)
        return Response(record_view(request, story))


class StatsView(APIView):
    """Site-wide totals shown on the home page and the admin dashboard."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(platform_stats())


class HomeView(APIView):
    """Everything the home screen needs in one call."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        ctx = {"request": request}
        # Column pieces live in their own tab (GET /api/columns/); these shelves are stories and books.
        stories = published_stories().filter(column__isnull=True)

        def shelf(queryset):
            return StoryListSerializer(queryset[:SHELF_SIZE], many=True, context=ctx).data

        def best(queryset):
            """Most liked first, then the best rated (and most rated), then the newest."""
            return queryset.order_by("-like_count", "-rating_avg", "-rating_count", "-published_at")

        for_you = []
        user = request.user
        if user.is_authenticated:
            preferred = list(user.preferred_genres.values_list("id", flat=True))
            if preferred:
                for_you = shelf(best(stories.filter(genres__in=preferred).distinct()))

        genres = Genre.objects.filter(is_active=True).annotate(
            published=Count("stories", filter=Q(stories__status=Story.Status.PUBLISHED, stories__column__isnull=True))
        ).order_by("sort_order", "name")  # Meta.ordering is dropped from GROUP BY queries
        by_genre = [
            {"genre": GenreSerializer(genre).data, "stories": shelf(best(stories.filter(genres=genre)))}
            for genre in genres
            if genre.published
        ][:8]

        return Response(
            {
                "genres": GenreSerializer(genres, many=True).data,
                "has_columns": Column.objects.filter(Q(is_public=True) | ~Q(url="") | Q(stories__status=Story.Status.PUBLISHED)).exists(),
                # The author's columns (links to SunStar) shown on the home page, apart from the stories.
                "columns": ColumnSerializer(Column.objects.exclude(url="").order_by("-created_at")[:6], many=True).data,
                "for_you": for_you,
                "latest": shelf(stories),
                "free": shelf(best(stories.filter(Q(price__lte=0) | Q(column__is_public=True) | Q(all_chapters_free=True)))),
                "by_genre": by_genre,
                "popular": shelf(stories.filter(view_count__gt=0).order_by("-view_count", "-like_count", "-rating_avg")),
                "stats": platform_stats(),
            }
        )
