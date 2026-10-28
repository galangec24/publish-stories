from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from catalog.models import Chapter, Story
from catalog.paywall import has_full_access

from . import providers, services, storage
from .models import ChapterNarration, ChapterReel, Status


def _chapter_number(chapter):
    return list(chapter.story.chapters.values_list("id", flat=True)).index(chapter.id) + 1


def _can_read(request, story, chapter):
    """Same rule as the reader: the first free chapters for everyone, the rest after unlocking."""
    if story.all_chapters_free or has_full_access(request, story):
        return True
    ids = list(story.chapters.values_list("id", flat=True))
    return chapter.id in ids and ids.index(chapter.id) < story.free_chapters


# ---------- readers ----------


class NarrationView(APIView):
    """GET /api/stories/<slug>/chapters/<id>/narration/ → audio pieces + word timings."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug, chapter_id):
        story = get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)
        chapter = get_object_or_404(Chapter, pk=chapter_id, story=story)
        narration = ChapterNarration.objects.filter(chapter=chapter, status=Status.READY).first()
        if not narration:
            return Response({"detail": "This chapter has no AI reading yet."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_read(request, story, chapter):
            return Response({"detail": "Unlock this chapter to listen to it."}, status=status.HTTP_403_FORBIDDEN)
        links = storage.signed_urls([s["key"] for s in narration.segments], expires_in=3 * 3600)
        if len(links) < len(narration.segments):
            return Response({"detail": "The reading couldn't be loaded. Try again."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(
            {"segments": [{"url": links[s["key"]], "duration": s["duration"], "words": s["words"]} for s in narration.segments]}
        )


def reel_card(reel, links):
    chapter = reel.chapter
    story = chapter.story
    ids = list(story.chapters.values_list("id", flat=True))
    number = ids.index(chapter.id) + 1
    return {
        "id": reel.id,
        "video_url": links.get(reel.video_key),
        "thumbnail_url": links.get(reel.thumbnail_key),
        "duration": reel.duration,
        "script": reel.script,
        "chapter": {"id": chapter.id, "number": number, "title": chapter.title},
        "story": {
            "slug": story.slug,
            "title": story.title,
            "author_name": story.author_name,
            "cover_image": story.cover_image.url if story.cover_image else None,
            "chapter_count": len(ids),
            "free": story.all_chapters_free or story.price <= 0 or number <= story.free_chapters,
        },
    }


class ReelFeedView(APIView):
    """GET /api/reels/ → published chapter reels, newest stories first, chapters in order."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        reels = list(
            ChapterReel.objects.filter(
                published=True, status=Status.READY, chapter__deleted_at__isnull=True, chapter__story__status=Story.Status.PUBLISHED
            )
            .select_related("chapter__story")
            .order_by("-chapter__story__published_at", "chapter__story_id", "chapter__order", "chapter_id")
        )
        story = request.query_params.get("story")
        if story:
            reels = [r for r in reels if r.chapter.story.slug == story]
        links = storage.signed_urls([k for r in reels for k in (r.video_key, r.thumbnail_key)])
        return Response([reel_card(r, links) for r in reels if links.get(r.video_key)])


# ---------- admin (Story Studio) ----------


def admin_state(chapter):
    narration = ChapterNarration.objects.filter(chapter=chapter).first()
    reel = ChapterReel.objects.filter(chapter=chapter).first()
    if reel:
        reel = services.refresh_reel(reel)
    links = storage.signed_urls([reel.video_key, reel.thumbnail_key] if reel else [])
    last_presenter = ChapterReel.objects.exclude(avatar_id="").order_by("-updated_at").values_list("avatar_id", flat=True).first()
    return {
        "services": {
            "voice": bool(settings.ELEVENLABS_API_KEY),
            "video": bool(settings.HEYGEN_API_KEY),
            "script": bool(settings.ANTHROPIC_API_KEY),
            "storage": storage.configured(),
        },
        "narration": narration
        and {
            "status": narration.status,
            "current": services.narration_is_current(narration),
            "characters": narration.characters,
            "error": narration.error,
            "updated_at": narration.updated_at,
        },
        "reel": reel
        and {
            "status": reel.status,
            "script": reel.script,
            "avatar_id": reel.avatar_id,
            "published": reel.published,
            "duration": reel.duration,
            "video_url": links.get(reel.video_key),
            "thumbnail_url": links.get(reel.thumbnail_key),
            "error": reel.error,
            "updated_at": reel.updated_at,
        },
        "last_presenter": last_presenter or "",
    }


def _error(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class AdminChapterAIView(APIView):
    """GET /api/admin/chapters/<id>/ai/ → the chapter's AI reading and reel."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return Response(admin_state(get_object_or_404(Chapter, pk=pk)))


class AdminNarrationView(APIView):
    """POST → make (or remake) the AI reading. DELETE → remove it."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        chapter = get_object_or_404(Chapter, pk=pk)
        if not settings.ELEVENLABS_API_KEY:
            return _error("Set ELEVENLABS_API_KEY in Render → Environment first.")
        if not storage.configured():
            return _error("Set SUPABASE_URL / SUPABASE_SERVICE_KEY in Render → Environment first.")
        if not services.chapter_text(chapter):
            return _error("This chapter has no text to read.")
        services.start_narration(chapter)
        return Response(admin_state(chapter), status=status.HTTP_202_ACCEPTED)

    def delete(self, request, pk):
        narration = get_object_or_404(ChapterNarration, chapter_id=pk)
        storage.delete(*[s.get("key") for s in narration.segments])
        narration.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminReelScriptView(APIView):
    """POST → Claude drafts the reel script (it isn't saved until a video is made)."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        chapter = get_object_or_404(Chapter.objects.select_related("story"), pk=pk)
        text = services.chapter_text(chapter)
        if not text:
            return _error("Write the chapter first; the script is based on it.")
        try:
            script = providers.write_reel_script(chapter.story, chapter, _chapter_number(chapter), text)
        except providers.ProviderError as exc:
            return _error(exc)
        return Response({"script": script})


class AdminPresentersView(APIView):
    """GET → HeyGen's ready-made presenters."""

    permission_classes = [IsAdmin]

    def get(self, request):
        try:
            return Response(providers.presenters())
        except providers.ProviderError as exc:
            return _error(exc)


class AdminReelView(APIView):
    """POST {script, avatar_id} → record the reel. PATCH {published} → show/hide it. DELETE → remove it."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        chapter = get_object_or_404(Chapter.objects.select_related("story"), pk=pk)
        script = (request.data.get("script") or "").strip()
        avatar_id = (request.data.get("avatar_id") or "").strip()
        if not script:
            return _error("Write or generate the script first.")
        if len(script) > 1500:
            return _error("Keep the script under 1,500 characters (about a minute and a half).")
        if not avatar_id:
            return _error("Choose a presenter.")
        if not storage.configured():
            return _error("Set SUPABASE_URL / SUPABASE_SERVICE_KEY in Render → Environment first.")
        reel, _ = ChapterReel.objects.get_or_create(chapter=chapter)
        if reel.status == Status.WORKING:
            return _error("This chapter's reel is still being made.")
        try:
            video_id = providers.start_video(script, avatar_id, f"{chapter.story.title} - Chapter {_chapter_number(chapter)}")
        except providers.ProviderError as exc:
            return _error(exc)
        reel.script, reel.avatar_id, reel.provider_video_id = script, avatar_id, video_id
        reel.status, reel.error = Status.WORKING, ""
        reel.save()
        return Response(admin_state(chapter), status=status.HTTP_202_ACCEPTED)

    def patch(self, request, pk):
        reel = get_object_or_404(ChapterReel, chapter_id=pk)
        if "published" in request.data:
            if request.data["published"] and reel.status != Status.READY:
                return _error("The video isn't ready yet.")
            reel.published = bool(request.data["published"])
            reel.save(update_fields=["published", "updated_at"])
        return Response(admin_state(reel.chapter))

    def delete(self, request, pk):
        reel = get_object_or_404(ChapterReel, chapter_id=pk)
        storage.delete(reel.video_key, reel.thumbnail_key)
        reel.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
