"""Admin endpoints under /api/admin/: genres, columns, the Story Studio and bulk import."""
import json

from django.conf import settings
from django.db import transaction
from django.db.models import F, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .importers import ManuscriptError, import_manuscript
from .models import Chapter, Column, Genre, Story
from .serializers import (
    AdminChapterSerializer,
    AdminStorySerializer,
    ColumnSerializer,
    GenreSerializer,
    ImportOptionsSerializer,
)
from .views import filter_stories


class AdminGenreViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = GenreSerializer
    pagination_class = None
    queryset = Genre.objects.all()


class AdminColumnViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = ColumnSerializer
    pagination_class = None
    queryset = Column.objects.all()


class AdminStoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AdminStorySerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        queryset = Story.objects.select_related("column").prefetch_related(
            "genres", Prefetch("chapters", queryset=Chapter.objects.defer("content"))
        )
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        params = self.request.query_params
        queryset = filter_stories(queryset, params)
        return queryset if params.get("ordering") else queryset.order_by("-updated_at")

    def perform_create(self, serializer):
        story = serializer.save(created_by=self.request.user)
        Chapter.objects.create(story=story, title="Chapter 1", order=0)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        story = self.get_object()
        if not story.chapters.filter(word_count__gt=0).exists():
            return Response({"detail": "Write something before publishing."}, status=400)
        story.status = Story.Status.PUBLISHED
        story.save()
        return Response(self.get_serializer(story).data)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        story = self.get_object()
        story.status = Story.Status.DRAFT
        story.save()
        return Response(self.get_serializer(story).data)


class AdminChapterListView(generics.ListCreateAPIView):
    """GET/POST /api/admin/stories/<id>/chapters/ — the Studio's navigation pane."""

    permission_classes = [IsAdmin]
    serializer_class = AdminChapterSerializer
    pagination_class = None

    def get_story(self):
        return get_object_or_404(Story, pk=self.kwargs["story_id"])

    def get_queryset(self):
        return Chapter.objects.filter(story_id=self.kwargs["story_id"])

    def perform_create(self, serializer):
        story = self.get_story()
        order = serializer.validated_data.get("order")
        with transaction.atomic():
            if order is None:
                order = story.chapters.count()
            else:
                # Inserting in the middle shifts later chapters down.
                story.chapters.filter(order__gte=order).update(order=F("order") + 1)
            serializer.save(story=story, order=order)
        story.refresh_word_count()


class AdminChapterDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/admin/chapters/<id>/.

    PATCH should include the `revision` the editor loaded. If someone else saved
    in the meantime the server answers 409 with the current chapter.
    """

    permission_classes = [IsAdmin]
    serializer_class = AdminChapterSerializer
    queryset = Chapter.objects.all()

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            chapter = get_object_or_404(Chapter.objects.select_for_update(), pk=kwargs["pk"])
            expected = request.data.get("revision")
            if expected is not None and int(expected) != chapter.revision:
                return Response(
                    {"detail": "This chapter was changed elsewhere.", "current": self.get_serializer(chapter).data},
                    status=status.HTTP_409_CONFLICT,
                )
            serializer = self.get_serializer(chapter, data=request.data, partial=kwargs.get("partial", False))
            serializer.is_valid(raise_exception=True)
            chapter = serializer.save(revision=chapter.revision + 1)
        chapter.story.refresh_word_count()
        return Response(self.get_serializer(chapter).data)

    def perform_destroy(self, instance):
        story = instance.story
        if story.chapters.count() <= 1:
            raise ValidationError({"detail": "A story needs at least one chapter."})
        instance.delete()
        for index, chapter in enumerate(story.chapters.all()):
            if chapter.order != index:
                Chapter.objects.filter(pk=chapter.pk).update(order=index)
        story.refresh_word_count()


class AdminChapterReorderView(APIView):
    """POST /api/admin/stories/<id>/chapters/reorder/ {"order": [chapter ids in new order]}."""

    permission_classes = [IsAdmin]

    def post(self, request, story_id):
        story = get_object_or_404(Story, pk=story_id)
        ids = request.data.get("order")
        current = set(story.chapters.values_list("id", flat=True))
        if not isinstance(ids, list) or set(ids) != current or len(ids) != len(current):
            return Response({"order": ["Send every chapter id of this story exactly once."]}, status=400)
        with transaction.atomic():
            for index, chapter_id in enumerate(ids):
                Chapter.objects.filter(pk=chapter_id).update(order=index)
        return Response(AdminChapterSerializer(story.chapters.defer("content"), many=True).data)


def _form_list(data, key):
    """Accept a repeated form field, a comma separated string, or a JSON list."""
    values = data.getlist(key) if hasattr(data, "getlist") else data.get(key, [])
    if isinstance(values, (str, int)):
        values = [values]
    result = []
    for value in values or []:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                result.extend(json.loads(value))
            else:
                result.extend(v.strip() for v in value.split(",") if v.strip())
        else:
            result.append(value)
    return result


class AdminStoryImportView(APIView):
    """POST /api/admin/stories/import/ — upload many manuscripts at once.

    multipart fields:
      files                  one or more .docx / .md / .txt files
      genre_ids              genre tags applied to every story
      column_id, price, preview_page_count, status, author_name   shared defaults
      manifest               optional JSON list of per-file overrides:
                             [{"filename": "a.docx", "title": "...", "genre_ids": [1, 2], ...}]
      create_missing_genres  "true" to create genres named in Markdown front matter
    Each file is imported in its own transaction; one bad file doesn't sink the batch.
    """

    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist("files")
        if not files:
            return Response({"files": ["Attach at least one manuscript."]}, status=400)
        if len(files) > settings.IMPORT_MAX_FILES:
            return Response({"files": [f"Upload at most {settings.IMPORT_MAX_FILES} files at a time."]}, status=400)

        defaults_input = {
            key: request.data.get(key)
            for key in ("column_id", "price", "preview_page_count", "status", "author_name")
            if request.data.get(key) not in (None, "")
        }
        defaults_input["genre_ids"] = _form_list(request.data, "genre_ids")
        defaults = ImportOptionsSerializer(data=defaults_input)
        defaults.is_valid(raise_exception=True)

        try:
            manifest = json.loads(request.data.get("manifest") or "[]")
            if not isinstance(manifest, list):
                raise ValueError
        except ValueError:
            return Response({"manifest": ["Must be a JSON list."]}, status=400)
        overrides = {entry.get("filename"): entry for entry in manifest if isinstance(entry, dict)}
        create_missing = str(request.data.get("create_missing_genres", "")).lower() in {"1", "true"}

        results = [self._import_one(f, defaults.validated_data, overrides.get(f.name), create_missing) for f in files]
        created = sum(1 for r in results if r["ok"])
        return Response(
            {"created": created, "failed": len(results) - created, "results": results},
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )

    def _import_one(self, upload, defaults, override, create_missing):
        result = {"filename": upload.name, "ok": False, "warnings": []}
        if upload.size > settings.IMPORT_MAX_FILE_BYTES:
            result["error"] = "File is too large (max 10 MB)."
            return result

        options = dict(defaults)
        if override:
            entry = {k: v for k, v in override.items() if k != "filename"}
            parsed = ImportOptionsSerializer(data=entry)
            if not parsed.is_valid():
                result["error"] = parsed.errors
                return result
            options.update(parsed.validated_data)

        try:
            manuscript = import_manuscript(upload.name, upload.read())
        except ManuscriptError as exc:
            result["error"] = str(exc)
            return result

        genres = list(options.get("genre_ids") or [])
        for name in manuscript.genres:
            genre = Genre.objects.filter(Q(name__iexact=name) | Q(slug=slugify(name))).first()
            if not genre and create_missing:
                genre = Genre.objects.create(name=name[:60])
            if genre:
                genres.append(genre)
            else:
                result["warnings"].append(f"Unknown genre '{name}' was skipped.")

        with transaction.atomic():
            story = Story.objects.create(
                title=options.get("title") or manuscript.title,
                synopsis=options.get("synopsis", manuscript.synopsis),
                author_name=options.get("author_name") or manuscript.author_name,
                column=options.get("column_id"),
                price=options.get("price", 0),
                preview_page_count=options.get("preview_page_count", 3),
                status=Story.Status.DRAFT,
                created_by=self.request.user,
            )
            story.genres.set({g.pk for g in genres})
            for index, chapter in enumerate(manuscript.chapters):
                Chapter.objects.create(story=story, title=chapter.title[:200], order=index, content=chapter.content)
            story.refresh_word_count()
            if options.get("status") == Story.Status.PUBLISHED:
                if story.word_count:
                    story.status = Story.Status.PUBLISHED
                    story.save()
                else:
                    result["warnings"].append("Empty manuscript left as a draft.")

        result.update(
            ok=True,
            story_id=story.id,
            title=story.title,
            slug=story.slug,
            status=story.status,
            chapters=len(manuscript.chapters),
            word_count=story.word_count,
            genres=sorted({g.name for g in genres}),
        )
        return result
