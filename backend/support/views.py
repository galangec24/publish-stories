import ipaddress
import logging
import os
from datetime import timedelta

from django.conf import settings
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

from accounts.brevo import EmailSendError, send_email
from accounts.permissions import IsAdmin
from notifications.realtime import push_admins, push_user
from payments.access import client_ip, device_key, network_key
from payments.models import new_access_code
from notifications.service import first_name, notify, notify_admins

from . import storage
from .gifs import is_gif_url
from .models import Conversation, Message

logger = logging.getLogger(__name__)
HISTORY = 200
RESUME_DAYS = 30
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
        "sender_name": "Support" if message.from_admin else (first_name(sender) if sender else (message.conversation.guest_name or "Guest")),
        "created_at": message.created_at.isoformat(),
    }


def serialize_conversation(conversation, last=None):
    user = conversation.user
    person = (
        {
            "id": user.id,
            "first_name": first_name(user),
            "last_name": user.last_name,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "is_guest": False,
        }
        if user
        else {
            "id": None,
            "first_name": conversation.guest_name or "Guest",
            "last_name": "",
            "email": conversation.guest_email,
            "avatar_url": "",
            "is_guest": True,
        }
    )
    return {
        "id": conversation.id,
        "user": person,
        "unread_for_admin": conversation.unread_for_admin,
        "unread_for_user": conversation.unread_for_user,
        "last_message_at": conversation.last_message_at.isoformat() if conversation.last_message_at else None,
        "last_message": serialize_message(last) if last else None,
    }


def history(conversation):
    messages = list(conversation.messages.select_related("sender", "conversation").order_by("-id")[:HISTORY])
    return [serialize_message(m) for m in reversed(messages)]


def masked_ip(request):
    """The reader's IP with the last part hidden ("49.145.10.•"), shown to admins only."""
    try:
        ip = ipaddress.ip_address(client_ip(request))
    except ValueError:
        return ""
    if ip.version == 4:
        return ".".join(str(ip).split(".")[:3]) + ".•"
    return ":".join(ip.exploded.split(":")[:4]) + ":•"


def conversation_for(request, create=False, lock=False):
    """This reader's thread: by account, or by device for guests.

    A guest thread from this device moves into the account when the reader signs in.
    The IP is never used to find a thread: many people share one (mobile data, a home),
    and they must not see each other's messages.
    """
    queryset = Conversation.objects.select_for_update() if lock else Conversation.objects
    device = device_key(request)
    if request.user.is_authenticated:
        conversation = queryset.filter(user=request.user).first()
        guest = queryset.filter(user__isnull=True, guest_key=device).first() if device else None
        if guest:
            if conversation is None:
                guest.user, guest.guest_key = request.user, ""
                guest.save(update_fields=["user", "guest_key"])
                conversation = guest
            else:
                guest.messages.update(conversation=conversation)
                Conversation.objects.filter(pk=conversation.pk).update(
                    unread_for_admin=F("unread_for_admin") + guest.unread_for_admin,
                    last_message_at=max(filter(None, [conversation.last_message_at, guest.last_message_at]), default=None),
                )
                guest.delete()
                conversation.refresh_from_db()
        if conversation is None and create:
            conversation = Conversation.objects.create(user=request.user)
        return conversation
    if not device:
        return None
    conversation = queryset.filter(user__isnull=True, guest_key=device).first()
    if conversation is None and create:
        conversation = Conversation.objects.create(
            guest_key=device, guest_ip=masked_ip(request), guest_network=network_key(request), resume_code=fresh_resume_code()
        )
    return conversation


def fresh_resume_code():
    for _ in range(10):
        code = new_access_code()
        if not Conversation.objects.filter(resume_code=code).exists():
            return code
    raise RuntimeError("Couldn't make a unique chat code")


def earlier_thread_on_network(request):
    """A recent guest thread from this network, offered (never shown) to a device that lost its id."""
    network = network_key(request)
    if not network:
        return None
    since = timezone.now() - timedelta(days=RESUME_DAYS)
    return (
        Conversation.objects.filter(user__isnull=True, guest_network=network, last_message_at__gte=since)
        .order_by("-last_message_at")
        .first()
    )


class GuestDetails(serializers.Serializer):
    name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)


class MyConversationView(APIView):
    """GET /api/support/ → my thread (opening it marks support replies as read).

    Works without an account (the browser's X-Viewer-Id identifies the device).
    PATCH {name, email} lets a guest say how to reach them.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        conversation = conversation_for(request, create=request.user.is_authenticated)
        if conversation is None:
            if not request.user.is_authenticated and not device_key(request):
                return Response({"detail": "Allow this site to store data so we can keep your conversation."}, status=400)
            earlier = earlier_thread_on_network(request)
            return Response(
                {
                    "id": None,
                    "messages": [],
                    "user": {"is_guest": True, "first_name": "", "email": ""},
                    # Only says that a thread exists here; proving it's yours needs the email or the chat code.
                    "resume": {"available": bool(earlier), "with_email": bool(earlier and earlier.guest_email)},
                }
            )
        if conversation.unread_for_user:
            Conversation.objects.filter(pk=conversation.pk).update(unread_for_user=0)
            conversation.unread_for_user = 0
        return Response(my_thread(conversation))

    def patch(self, request):
        if request.user.is_authenticated:
            return Response({"detail": "Your account details are used."}, status=400)
        data = GuestDetails(data=request.data)
        data.is_valid(raise_exception=True)
        conversation = conversation_for(request, create=True)
        if conversation is None:
            return Response({"detail": "Allow this site to store data so we can keep your conversation."}, status=400)
        conversation.guest_name = data.validated_data.get("name", conversation.guest_name).strip()
        conversation.guest_email = data.validated_data.get("email", conversation.guest_email).strip()
        conversation.save(update_fields=["guest_name", "guest_email"])
        return Response(my_thread(conversation))


def my_thread(conversation):
    """The reader's own view of their thread (guests also get their chat code)."""
    data = {**serialize_conversation(conversation), "messages": history(conversation)}
    if conversation.user_id is None:
        if not conversation.resume_code:
            conversation.resume_code = fresh_resume_code()
            conversation.save(update_fields=["resume_code"])
        data["resume_code"] = conversation.resume_code
    return data


class ResumeView(APIView):
    """POST /api/support/resume/ {email} or {code} — continue an earlier guest conversation on this device.

    The email works from the same network the conversation came from; the chat code works anywhere.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_claim"

    def post(self, request):
        if request.user.is_authenticated:
            return Response({"detail": "Signed-in readers already keep their conversation."}, status=400)
        device = device_key(request)
        if not device:
            return Response({"detail": "Allow this site to store data so we can keep your conversation."}, status=400)
        raw = str(request.data.get("code", "")).upper()
        code = "".join(ch for ch in raw if ch.isalnum())
        email = str(request.data.get("email", "")).strip()
        found = None
        if len(code) == 8:
            found = Conversation.objects.filter(user__isnull=True, resume_code=f"{code[:4]}-{code[4:]}").first()
        elif email:
            earlier = earlier_thread_on_network(request)
            if earlier and earlier.guest_email and earlier.guest_email.lower() == email.lower():
                found = earlier
        if found is None:
            return Response({"detail": "That doesn't match an earlier conversation."}, status=400)
        with transaction.atomic():
            mine = Conversation.objects.filter(user__isnull=True, guest_key=device).exclude(pk=found.pk).first()
            if mine:  # a fresh thread on this device joins the earlier one
                mine.messages.update(conversation=found)
                mine.delete()
            found.guest_key = device
            found.guest_network = network_key(request) or found.guest_network
            found.save(update_fields=["guest_key", "guest_network"])
        return Response(my_thread(found))


class MySendView(APIView):
    """POST /api/support/messages/ {body, gif_url?, file?} → message; pushed to every admin instantly."""

    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]

    @property
    def throttle_scope(self):
        return "chat" if self.request.user.is_authenticated else "chat_guest"

    def post(self, request):
        if not request.user.is_authenticated and not device_key(request):
            return Response({"detail": "Allow this site to store data so we can keep your conversation."}, status=400)
        fields = message_fields(request)
        sender = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            conversation = conversation_for(request, create=True, lock=True)
            if sender is None:
                conversation.guest_ip = masked_ip(request)  # where they last wrote from
                conversation.guest_network = network_key(request) or conversation.guest_network
                conversation.save(update_fields=["guest_ip", "guest_network"])
            first_unread = conversation.unread_for_admin == 0
            message = Message.objects.create(conversation=conversation, sender=sender, **fields)
            Conversation.objects.filter(pk=conversation.pk).update(
                last_message_at=message.created_at, unread_for_admin=F("unread_for_admin") + 1
            )
            conversation.refresh_from_db()
            payload = serialize_conversation(conversation, message)
            push_admins("support.message", payload)
            if sender:
                push_user(sender.pk, "support.message", payload)
            if first_unread:
                who = (
                    f"{first_name(sender)} ({sender.email})"
                    if sender
                    else f"guest {conversation.guest_name or ''}{f' ({conversation.guest_email})' if conversation.guest_email else ''}".strip()
                )
                notify_admins("support_message", f"New message from {who}", preview_text(message), "/admin/support")
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
            conversation = get_object_or_404(Conversation.objects.select_for_update(of=("self",)).select_related("user"), pk=pk)
            first_unread = conversation.unread_for_user == 0
            message = Message.objects.create(conversation=conversation, sender=request.user, from_admin=True, **fields)
            Conversation.objects.filter(pk=pk).update(
                last_message_at=timezone.now(), unread_for_user=F("unread_for_user") + 1, unread_for_admin=0
            )
            conversation.refresh_from_db()
            payload = serialize_conversation(conversation, message)
            if conversation.user_id:
                push_user(conversation.user_id, "support.message", payload)
            push_admins("support.message", payload)
            if first_unread and conversation.user_id:
                notify([conversation.user_id], "support_reply", "Support replied to you", preview_text(message), "?chat=open")
            elif first_unread and conversation.guest_email:
                transaction.on_commit(lambda: email_guest(conversation, message))
        return Response(serialize_message(message), status=201)


def email_guest(conversation, message):
    link = f"{settings.FRONTEND_BASE_URL}/?chat=open"
    try:
        send_email(
            to_email=conversation.guest_email,
            to_name=conversation.guest_name,
            subject="Publish Stories support replied to you",
            text=f"{preview_text(message)}\n\nOpen the chat on the same phone or computer to reply: {link}",
            html=(
                f"<p>{preview_text(message)}</p>"
                f'<p><a href="{link}">Open the chat</a> on the same phone or computer you wrote from to reply.</p>'
            ),
        )
    except EmailSendError:
        logger.warning("Couldn't email guest conversation %s", conversation.pk)


class FileView(APIView):
    """GET /api/support/files/<message id>/ - the attachment, for that conversation's reader or an admin."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        message = get_object_or_404(Message.objects.select_related("conversation"), pk=pk)
        conversation, user, device = message.conversation, request.user, device_key(request)
        allowed = (user.is_authenticated and (user.is_admin or conversation.user_id == user.pk)) or (
            conversation.user_id is None and device and conversation.guest_key == device
        )
        if not message.file_key or not allowed:
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
