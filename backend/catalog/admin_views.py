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
from notifications.service import notify

from . import delta
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


def announce_story(story):
    """Tell every reader about a story the first time it is published."""
    from django.contrib.auth import get_user_model

    readers = get_user_model().objects.filter(is_active=True, is_admin=False).values_list("pk", flat=True)
    genre = story.genres.first()
    blurb = story.synopsis[:120] if story.synopsis else "Start reading now."
    body = f"{genre.name} · {blurb}" if genre else blurb
    notify(list(readers), "new_story", f"New story: {story.title}", body, f"/stories/{story.slug}")


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
        first_time = story.published_at is None
        story.status = Story.Status.PUBLISHED
        story.save()
        if first_time:
            announce_story(story)
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

        from .images import InvalidImage, image_url, store_image

        def save_image(blob):
            try:
                return image_url(self.request, store_image(blob, self.request.user))
            except InvalidImage:
                return None

        try:
            manuscript = import_manuscript(upload.name, upload.read(), save_image=save_image)
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
                    announce_story(story)
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


class AdminImportOneView(APIView):
    """POST /api/admin/stories/import-one/ — one manuscript → one story, with a preview step.

    multipart fields:
      file            .docx / .md / .txt
      split           auto | headings | chapter_lines | page_breaks | none
      preview         "true" → only report what would be created (nothing is saved)
      chapter_titles  JSON list overriding detected chapter titles (create only)
      story           JSON with title, author_name, synopsis, genre_ids, column_id,
                      price, preview_page_count, font_family, font_size (create only)
    Word pictures are stored as story images and placed where they appeared.
    """

    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from .images import InvalidImage, image_url, store_image
        from .importers import SPLIT_MODES

        upload = request.FILES.get("file")
        if not upload:
            return Response({"file": ["Choose a manuscript (.docx, .md or .txt)."]}, status=400)
        if upload.size > settings.IMPORT_MAX_FILE_BYTES:
            return Response({"file": ["File is too large (max 10 MB)."]}, status=400)
        split = request.data.get("split") or "auto"
        if split not in SPLIT_MODES:
            return Response({"split": ["Unknown chapter split."]}, status=400)
        raw = upload.read()

        if str(request.data.get("preview", "")).lower() in {"1", "true"}:
            try:
                manuscript = import_manuscript(upload.name, raw, split=split)
            except ManuscriptError as exc:
                return Response({"file": [str(exc)]}, status=400)
            return Response(
                {
                    "title": manuscript.title,
                    "author_name": manuscript.author_name,
                    "synopsis": manuscript.synopsis,
                    "genres": manuscript.genres,
                    "image_count": manuscript.image_count,
                    "chapters": [
                        {
                            "title": c.title,
                            "word_count": delta.word_count(c.content),
                            "images": c.images,
                            "excerpt": " ".join(delta.plain_text(c.content).split())[:180],
                        }
                        for c in manuscript.chapters
                    ],
                }
            )

        try:
            fields = json.loads(request.data.get("story") or "{}")
            titles = json.loads(request.data.get("chapter_titles") or "[]")
            if not isinstance(fields, dict) or not isinstance(titles, list):
                raise ValueError
        except ValueError:
            return Response({"story": ["Invalid story details."]}, status=400)

        with transaction.atomic():

            def save_image(blob):
                try:
                    return image_url(request, store_image(blob, request.user))
                except InvalidImage:
                    return None  # skip pictures Pillow can't read (e.g. vector formats)

            try:
                manuscript = import_manuscript(upload.name, raw, split=split, save_image=save_image)
            except ManuscriptError as exc:
                raise ValidationError({"file": [str(exc)]}) from exc  # rolls back any saved pictures

            data = {
                "title": fields.get("title") or manuscript.title,
                "author_name": fields.get("author_name", manuscript.author_name),
                "synopsis": fields.get("synopsis", manuscript.synopsis),
                **{k: fields[k] for k in ("genre_ids", "column_id", "price", "preview_page_count", "font_family", "font_size") if k in fields},
            }
            serializer = AdminStorySerializer(data=data, context={"request": request})
            serializer.is_valid(raise_exception=True)
            story = serializer.save(created_by=request.user)
            for index, chapter in enumerate(manuscript.chapters):
                title = titles[index].strip() if index < len(titles) and isinstance(titles[index], str) and titles[index].strip() else chapter.title
                Chapter.objects.create(story=story, title=title[:200], order=index, content=chapter.content)
            story.refresh_word_count()
        story = self.get_story(story.pk)
        return Response(AdminStorySerializer(story, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def get_story(pk):
        return Story.objects.select_related("column").prefetch_related("genres", "chapters").get(pk=pk)
