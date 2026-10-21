from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .analytics import platform_stats, record_view
from .models import Chapter, Column, Genre, Story
from .paywall import has_full_access, reader_chapters
from .serializers import ColumnSerializer, GenreSerializer, StoryListSerializer

SHELF_SIZE = 12


def published_stories():
    return (
        Story.objects.filter(status=Story.Status.PUBLISHED)
        .select_related("column")
        .prefetch_related("genres", Prefetch("chapters", queryset=Chapter.objects.only("id", "story_id")))
    )


def filter_stories(queryset, params):
    """Shared filters: ?genre=slug (repeatable or comma separated), ?column=slug, ?q=text, ?free=true."""
    genres = [g for value in params.getlist("genre") for g in value.split(",") if g]
    if genres:
        queryset = queryset.filter(genres__slug__in=genres).distinct()
    if params.get("column"):
        queryset = queryset.filter(column__slug=params["column"])
    if params.get("q"):
        q = params["q"].strip()
        queryset = queryset.filter(Q(title__icontains=q) | Q(synopsis__icontains=q) | Q(author_name__icontains=q))
    if params.get("free") in {"1", "true"}:
        queryset = queryset.filter(Q(price__lte=0) | Q(column__is_public=True))
    if params.get("ordering") in {"popular", "readers"}:
        queryset = queryset.order_by("-view_count" if params["ordering"] == "popular" else "-reader_count")
    return queryset


class GenreListView(generics.ListAPIView):
    serializer_class = GenreSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        return Genre.objects.filter(is_active=True)


class ColumnListView(generics.ListAPIView):
    serializer_class = ColumnSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None
    queryset = Column.objects.all()


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
        full_access = has_full_access(request.user, story)
        chapters, locked = reader_chapters(story, full_access)
        data = StoryListSerializer(story, context={"request": request}).data
        data.update(chapters=chapters, locked=locked, has_access=full_access)
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
        stories = published_stories()

        def shelf(queryset):
            return StoryListSerializer(queryset[:SHELF_SIZE], many=True, context=ctx).data

        public_columns = []
        for column in Column.objects.filter(is_public=True):
            column_stories = stories.filter(column=column)
            if column_stories.exists():
                public_columns.append({**ColumnSerializer(column).data, "stories": shelf(column_stories)})

        for_you = []
        user = request.user
        if user.is_authenticated:
            preferred = list(user.preferred_genres.values_list("id", flat=True))
            if preferred:
                for_you = shelf(stories.filter(genres__in=preferred).distinct())

        genres = Genre.objects.filter(is_active=True).annotate(
            published=Count("stories", filter=Q(stories__status=Story.Status.PUBLISHED))
        ).order_by("sort_order", "name")  # Meta.ordering is dropped from GROUP BY queries
        by_genre = [
            {"genre": GenreSerializer(genre).data, "stories": shelf(stories.filter(genres=genre))}
            for genre in genres
            if genre.published
        ][:8]

        return Response(
            {
                "genres": GenreSerializer(genres, many=True).data,
                "public_columns": public_columns,
                "for_you": for_you,
                "latest": shelf(stories),
                "free": shelf(stories.filter(Q(price__lte=0) | Q(column__is_public=True))),
                "by_genre": by_genre,
                "popular": shelf(stories.filter(view_count__gt=0).order_by("-view_count")),
                "stats": platform_stats(),
            }
        )
