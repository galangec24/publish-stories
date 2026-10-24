import os

from django.db import transaction
from django.db.models import F
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from notifications.realtime import push_admins, push_user
from notifications.service import first_name, notify, notify_admins

from . import storage
from .gifs import is_gif_url
from .models import Conversation, Message

HISTORY = 200
# Pictures, PDFs and everyday documents. Anything else is refused.
FILE_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    ".heic": "image/heic", ".pdf": "application/pdf", ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class MessageInput(serializers.Serializer):
    body = serializers.CharField(max_length=2000, trim_whitespace=True, required=False, allow_blank=True)
    gif_url = serializers.URLField(max_length=500, required=False, allow_blank=True)

    def validate_gif_url(self, value):
        if value and not is_gif_url(value):
            raise serializers.ValidationError("Pick a GIF from the GIF search.")
        return value


def message_fields(request):
    """Text, GIF and/or file from a chat request -> Message fields. Raises ValidationError."""
    data = MessageInput(data=request.data)
    data.is_valid(raise_exception=True)
    fields = {"body": data.validated_data.get("body", ""), "gif_url": data.validated_data.get("gif_url", "")}
    upload = request.FILES.get("file")
    if upload:
        extension = os.path.splitext(upload.name)[1].lower()
        if extension not in FILE_TYPES:
            raise serializers.ValidationError({"file": ["Send a picture, PDF, Word, Excel or text file."]})
        if upload.size > storage.max_size():
            raise serializers.ValidationError({"file": [f"Files must be {storage.max_size() // (1024 * 1024)} MB or smaller."]})
        try:
            key = storage.save(upload.read(), FILE_TYPES[extension], extension)
        except storage.StorageError as exc:
            raise serializers.ValidationError({"file": ["Couldn't upload the file. Please try again."]}) from exc
        fields.update(file_key=key, file_name=os.path.basename(upload.name)[:200], file_type=FILE_TYPES[extension], file_size=upload.size)
    if not (fields["body"] or fields["gif_url"] or upload):
        raise serializers.ValidationError({"body": ["Type a message, or add a GIF or a file."]})
    return fields


def preview_text(message):
    """Short text for notifications and the inbox list."""
    if message.body:
        return message.body[:140]
    return f"\U0001F4CE {message.file_name}" if message.file_key else "GIF"


def serialize_message(message):
    sender = message.sender
    return {
        "id": message.id,
        "conversation": message.conversation_id,
        "body": message.body,
        "gif_url": message.gif_url,
        "file": (
            {"name": message.file_name, "type": message.file_type, "size": message.file_size, "url": f"support/files/{message.id}/"}
            if message.file_key
            else None
        ),
        "from_admin": message.from_admin,
        "sender_name": "Support" if message.from_admin else (first_name(sender) if sender else "Reader"),
        "created_at": message.created_at.isoformat(),
    }


def serialize_conversation(conversation, last=None):
    user = conversation.user
    return {
        "id": conversation.id,
        "user": {
            "id": user.id,
            "first_name": first_name(user),
            "last_name": user.last_name,
            "email": user.email,
            "avatar_url": user.avatar_url,
        },
        "unread_for_admin": conversation.unread_for_admin,
        "unread_for_user": conversation.unread_for_user,
        "last_message_at": conversation.last_message_at.isoformat() if conversation.last_message_at else None,
        "last_message": serialize_message(last) if last else None,
    }


def history(conversation):
    messages = list(conversation.messages.select_related("sender").order_by("-id")[:HISTORY])
    return [serialize_message(m) for m in reversed(messages)]


class MyConversationView(APIView):
    """GET /api/support/ → my thread (opening it marks support replies as read)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversation, _ = Conversation.objects.get_or_create(user=request.user)
        if conversation.unread_for_user:
            Conversation.objects.filter(pk=conversation.pk).update(unread_for_user=0)
            conversation.unread_for_user = 0
        return Response({**serialize_conversation(conversation), "messages": history(conversation)})


class MySendView(APIView):
    """POST /api/support/messages/ {body} → message; pushed to every admin instantly."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"

    def post(self, request):
        fields = message_fields(request)
        with transaction.atomic():
            conversation, _ = Conversation.objects.select_for_update().get_or_create(user=request.user)
            first_unread = conversation.unread_for_admin == 0
            message = Message.objects.create(conversation=conversation, sender=request.user, **fields)
            Conversation.objects.filter(pk=conversation.pk).update(
                last_message_at=message.created_at, unread_for_admin=F("unread_for_admin") + 1
            )
            conversation.refresh_from_db()
            payload = serialize_conversation(conversation, message)
            push_admins("support.message", payload)
            push_user(request.user.pk, "support.message", payload)
            if first_unread:
                notify_admins(
                    "support_message",
                    f"New message from {first_name(request.user)} ({request.user.email})",
                    preview_text(message),
                    "/admin/support",
                )
        return Response(serialize_message(message), status=201)


class AdminConversationListView(APIView):
    """GET /api/admin/support/ → threads, newest activity first, with name + email of each reader."""

    permission_classes = [IsAdmin]

    def get(self, request):
        conversations = Conversation.objects.filter(last_message_at__isnull=False).select_related("user")[:200]
        result = []
        for conversation in conversations:
            last = conversation.messages.select_related("sender").order_by("-id").first()
            result.append(serialize_conversation(conversation, last))
        return Response(
            {"results": result, "unread_total": sum(c["unread_for_admin"] for c in result)}
        )


class AdminConversationView(APIView):
    """GET /api/admin/support/<id>/ → full thread (marks it read for admins)."""

    permission_classes = [IsAdmin]

    def get(self, request, pk):
        conversation = get_object_or_404(Conversation.objects.select_related("user"), pk=pk)
        if conversation.unread_for_admin:
            Conversation.objects.filter(pk=pk).update(unread_for_admin=0)
            conversation.unread_for_admin = 0
            push_admins("support.read", {"id": pk})
        return Response({**serialize_conversation(conversation), "messages": history(conversation)})


class AdminReplyView(APIView):
    """POST /api/admin/support/<id>/messages/ {body} → reply pushed to the reader instantly."""

    permission_classes = [IsAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request, pk):
        get_object_or_404(Conversation, pk=pk)
        fields = message_fields(request)
        with transaction.atomic():
            conversation = get_object_or_404(Conversation.objects.select_for_update().select_related("user"), pk=pk)
            first_unread = conversation.unread_for_user == 0
            message = Message.objects.create(conversation=conversation, sender=request.user, from_admin=True, **fields)
            Conversation.objects.filter(pk=pk).update(
                last_message_at=timezone.now(), unread_for_user=F("unread_for_user") + 1, unread_for_admin=0
            )
            conversation.refresh_from_db()
            payload = serialize_conversation(conversation, message)
            push_user(conversation.user_id, "support.message", payload)
            push_admins("support.message", payload)
            if first_unread:
                notify([conversation.user_id], "support_reply", "Support replied to you", preview_text(message), "?chat=open")
        return Response(serialize_message(message), status=201)


class FileView(APIView):
    """GET /api/support/files/<message id>/ - the attachment, for that conversation's reader or an admin."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        message = get_object_or_404(Message.objects.select_related("conversation"), pk=pk)
        if not message.file_key or not (request.user.is_admin or message.conversation.user_id == request.user.pk):
            return Response({"detail": "Not found."}, status=404)
        try:
            data = storage.load(message.file_key)
        except storage.StorageError:
            return Response({"detail": "This file is no longer available."}, status=404)
        response = HttpResponse(data, content_type=message.file_type or "application/octet-stream")
        inline = message.file_type.startswith("image/") or message.file_type == "application/pdf"
        name = message.file_name.replace('"', "")
        response["Content-Disposition"] = f'{"inline" if inline else "attachment"}; filename="{name}"'
        response["Cache-Control"] = "private, max-age=3600"
        response["X-Content-Type-Options"] = "nosniff"
        return response
