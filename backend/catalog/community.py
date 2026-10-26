"""Likes and comments on stories.

  POST/DELETE /api/stories/<slug>/like/          like / unlike (signed in)
  GET  /api/stories/<slug>/comments/?page=N      newest first, with replies
  POST /api/stories/<slug>/comments/             {body, parent?} (signed in)
  DELETE /api/comments/<id>/                     your own comment, or any as admin
  GET  /api/admin/comments/?story=&hidden=       moderation list (admin)
  POST /api/admin/comments/<id>/hide/ | unhide/  hide without deleting (admin)
Readers are notified when someone replies to them; admins about new comments.
"""
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from accounts.profanity import clean
from notifications.service import first_name, notify, notify_admins

from .models import Comment, Story, StoryLike

PAGE_SIZE = 20


def published_story(slug):
    return get_object_or_404(Story, slug=slug, status=Story.Status.PUBLISHED)


def refresh_counts(story):
    Story.objects.filter(pk=story.pk).update(
        like_count=StoryLike.objects.filter(story=story).count(),
        comment_count=Comment.objects.filter(story=story, is_hidden=False).count(),
    )
    story.refresh_from_db(fields=["like_count", "comment_count"])


def serialize_comment(comment, viewer, replies=None):
    user = comment.user
    data = {
        "id": comment.id,
        "body": comment.body,
        "created_at": comment.created_at.isoformat(),
        "parent": comment.parent_id,
        "is_hidden": comment.is_hidden,
        "user": {
            "id": user.id,
            "first_name": first_name(user),
            "last_name": user.last_name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
        },
        "can_delete": bool(viewer and viewer.is_authenticated and (viewer.is_admin or viewer.pk == user.pk)),
    }
    if replies is not None:
        data["replies"] = replies
    return data


class LikeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        story = published_story(slug)
        try:
            with transaction.atomic():
                StoryLike.objects.create(story=story, user=request.user)
        except IntegrityError:
            pass  # already liked
        refresh_counts(story)
        return Response({"liked": True, "like_count": story.like_count})

    def delete(self, request, slug):
        story = published_story(slug)
        StoryLike.objects.filter(story=story, user=request.user).delete()
        refresh_counts(story)
        return Response({"liked": False, "like_count": story.like_count})


class CommentInput(serializers.Serializer):
    body = serializers.CharField(max_length=1000, trim_whitespace=True)
    parent = serializers.IntegerField(required=False, allow_null=True)

    def validate_body(self, value):
        return clean(value)


class CommentListView(APIView):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    throttle_scope = "comment"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get(self, request, slug):
        story = published_story(slug)
        raw = request.query_params.get("page", "1")
        page = int(raw) if raw.isdigit() and int(raw) > 0 else 1
        top = Comment.objects.filter(story=story, parent__isnull=True, is_hidden=False).select_related("user")
        total = top.count()
        chunk = list(top[(page - 1) * PAGE_SIZE : page * PAGE_SIZE])
        replies = {}
        for reply in (
            Comment.objects.filter(parent__in=[c.id for c in chunk], is_hidden=False).select_related("user").order_by("created_at", "id")
        ):
            replies.setdefault(reply.parent_id, []).append(serialize_comment(reply, request.user))
        return Response(
            {
                "count": story.comment_count,
                "has_more": page * PAGE_SIZE < total,
                "liked": bool(request.user.is_authenticated and StoryLike.objects.filter(story=story, user=request.user).exists()),
                "like_count": story.like_count,
                "results": [serialize_comment(c, request.user, replies.get(c.id, [])) for c in chunk],
            }
        )

    def post(self, request, slug):
        story = published_story(slug)
        data = CommentInput(data=request.data)
        data.is_valid(raise_exception=True)
        parent = None
        if data.validated_data.get("parent"):
            parent = get_object_or_404(Comment, pk=data.validated_data["parent"], story=story, is_hidden=False)
            parent = parent.parent or parent  # replies stay one level deep
        comment = Comment.objects.create(story=story, user=request.user, parent=parent, body=data.validated_data["body"])
        refresh_counts(story)

        name = first_name(request.user)
        link = f"/stories/{story.slug}#comment-{comment.id}"
        if parent and parent.user_id != request.user.pk:
            notify([parent.user_id], "comment_reply", f"{name} replied to your comment", comment.body[:140], link)
        if not request.user.is_admin:
            notify_admins("comment", f"New comment on {story.title}", f"{name}: {comment.body[:120]}", "/admin/comments")
        return Response(
            {"comment": serialize_comment(comment, request.user, [] if parent is None else None), "count": story.comment_count},
            status=status.HTTP_201_CREATED,
        )


class CommentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        comment = get_object_or_404(Comment, pk=pk)
        if not (request.user.is_admin or comment.user_id == request.user.pk):
            return Response({"detail": "You can only delete your own comments."}, status=403)
        story = comment.story
        comment.delete()  # replies go with it
        refresh_counts(story)
        return Response({"count": story.comment_count})


class AdminCommentListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        queryset = Comment.objects.select_related("user", "story").order_by("-created_at")
        if request.query_params.get("story", "").isdigit():
            queryset = queryset.filter(story_id=int(request.query_params["story"]))
        if request.query_params.get("hidden") in {"1", "true"}:
            queryset = queryset.filter(is_hidden=True)
        q = request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(Q(body__icontains=q) | Q(user__email__icontains=q))
        results = []
        for c in queryset[:200]:
            item = serialize_comment(c, request.user)
            item["user"]["email"] = c.user.email
            item["story"] = {"id": c.story_id, "title": c.story.title, "slug": c.story.slug}
            results.append(item)
        return Response({"results": results, "total": Comment.objects.count()})


class AdminCommentModerateView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk, action):
        if action not in {"hide", "unhide"}:
            return Response({"detail": "Unknown action."}, status=404)
        comment = get_object_or_404(Comment, pk=pk)
        comment.is_hidden = action == "hide"
        comment.save(update_fields=["is_hidden"])
        refresh_counts(comment.story)
        return Response({"id": comment.id, "is_hidden": comment.is_hidden})
