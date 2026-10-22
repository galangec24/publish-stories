from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from notifications.realtime import push_admins, push_user
from notifications.service import first_name, notify, notify_admins

from .models import Conversation, Message

HISTORY = 200


class MessageInput(serializers.Serializer):
    body = serializers.CharField(max_length=2000, trim_whitespace=True)


def serialize_message(message):
    sender = message.sender
    return {
        "id": message.id,
        "conversation": message.conversation_id,
        "body": message.body,
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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"

    def post(self, request):
        data = MessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            conversation, _ = Conversation.objects.select_for_update().get_or_create(user=request.user)
            first_unread = conversation.unread_for_admin == 0
            message = Message.objects.create(conversation=conversation, sender=request.user, body=data.validated_data["body"])
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
                    message.body[:140],
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

    def post(self, request, pk):
        data = MessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            conversation = get_object_or_404(Conversation.objects.select_for_update().select_related("user"), pk=pk)
            first_unread = conversation.unread_for_user == 0
            message = Message.objects.create(
                conversation=conversation, sender=request.user, from_admin=True, body=data.validated_data["body"]
            )
            Conversation.objects.filter(pk=pk).update(
                last_message_at=timezone.now(), unread_for_user=F("unread_for_user") + 1, unread_for_admin=0
            )
            conversation.refresh_from_db()
            payload = serialize_conversation(conversation, message)
            push_user(conversation.user_id, "support.message", payload)
            push_admins("support.message", payload)
            if first_unread:
                notify([conversation.user_id], "support_reply", "Support replied to you", message.body[:140], "?chat=open")
        return Response(serialize_message(message), status=201)
