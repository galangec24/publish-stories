"""QR payments: the reader scans the author's GCash or bank QR, then sends the reference number.

The admin checks the transfer arrived and approves it; that unlocks the story for
the reader's account (if signed in), the device they paid on, devices on the same
network, and anyone who enters the purchase's access code (within the device cap).
"""
import html
import logging
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.brevo import EmailSendError, send_email
from accounts.permissions import IsAdmin
from catalog.images import InvalidImage, normalize_image
from catalog.models import Story
from notifications.realtime import push_admins
from notifications.service import first_name, notify, notify_admins

from .access import add_device, device_key, has_full_access, network_key, purchases_for
from .models import PaymentMethod, PaymentProof, Subscription, new_access_code

logger = logging.getLogger(__name__)
_REFERENCE = re.compile(r"^[A-Za-z0-9-]{4,40}$")


def _crc16(text):
    """CRC-16/CCITT-FALSE, the checksum QR Ph puts in its last field (tag 63)."""
    crc = 0xFFFF
    for byte in text.encode():
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def is_qrph(payload):
    """A QR Ph / EMVCo payment code with an intact checksum."""
    return payload.startswith("000201") and len(payload) > 8 and payload[-8:-4] == "6304" and _crc16(payload[:-4]) == payload[-4:].upper()


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "name", "account_name", "account_number", "qr_url", "qr_payload", "instructions", "is_active", "sort_order"]

    def validate_qr_payload(self, value):
        value = value.strip()
        if value and not is_qrph(value):
            raise serializers.ValidationError("That isn't a valid QR Ph payment code.")
        return value

    def validate_qr_url(self, value):
        if not value.startswith("https://") and not settings.DEBUG:
            raise serializers.ValidationError("Upload the QR image or use a full https:// link.")
        return value


class PurchaseSerializer(serializers.ModelSerializer):
    """What the reader sees about their own purchase."""

    story_slug = serializers.CharField(source="story.slug", read_only=True)
    story_title = serializers.CharField(source="story.title", read_only=True)
    method_name = serializers.CharField(source="method.name", read_only=True, default="")

    class Meta:
        model = Subscription
        fields = [
            "id", "story_slug", "story_title", "status", "provider", "amount", "method_name",
            "reference_number", "access_code", "admin_note", "created_at", "paid_at",
        ]


class AdminPurchaseSerializer(PurchaseSerializer):
    user = serializers.SerializerMethodField()
    has_proof = serializers.SerializerMethodField()
    devices = serializers.IntegerField(source="grants.count", read_only=True)
    reviewed_by = serializers.EmailField(source="reviewed_by.email", read_only=True, default=None)

    class Meta(PurchaseSerializer.Meta):
        fields = PurchaseSerializer.Meta.fields + [
            "story", "user", "payer_name", "payer_email", "has_proof", "devices", "reviewed_by", "reviewed_at",
        ]

    def get_user(self, purchase):
        if not purchase.user_id:
            return None
        return {"id": purchase.user_id, "email": purchase.user.email, "first_name": first_name(purchase.user)}

    def get_has_proof(self, purchase):
        return hasattr(purchase, "proof")


class PaymentMethodListView(APIView):
    """GET /api/payment-methods/ — QR codes readers can pay with."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        methods = PaymentMethod.objects.filter(is_active=True)
        return Response(
            {
                "methods": PaymentMethodSerializer(methods, many=True).data,
                "online_checkout": bool(settings.PAYMONGO_SECRET_KEY),
            }
        )


class ManualPaymentView(APIView):
    """POST /api/payments/manual/ (multipart) — "I paid": story, method, reference, payer_name?, payer_email?, proof?"""

    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_submit"

    def post(self, request):
        data = request.data
        story = get_object_or_404(Story, pk=_int(data.get("story")), status=Story.Status.PUBLISHED)
        if story.is_free:
            return Response({"detail": "This story is free to read."}, status=400)
        if has_full_access(request, story):
            return Response({"detail": "You can already read this story."}, status=400)
        method = PaymentMethod.objects.filter(pk=_int(data.get("method")), is_active=True).first()
        if method is None:
            return Response({"method": ["Choose how you paid."]}, status=400)

        reference = re.sub(r"\s+", "", str(data.get("reference", "")))
        if not _REFERENCE.match(reference):
            return Response({"reference": ["Enter the reference number from your receipt (letters and digits)."]}, status=400)
        used = Subscription.objects.filter(reference_number__iexact=reference).filter(
            Q(status=Subscription.Status.PAID) | Q(status=Subscription.Status.PENDING)
        )
        if used.exists():
            return Response({"reference": ["This reference number was already sent."]}, status=400)

        waiting = purchases_for(request, story).filter(status=Subscription.Status.PENDING, provider=Subscription.Provider.MANUAL).first()
        if waiting:
            return Response(
                {"detail": "We're still checking your earlier payment for this story.", "purchase": PurchaseSerializer(waiting).data},
                status=400,
            )

        user = request.user if request.user.is_authenticated else None
        payer_name = str(data.get("payer_name", "")).strip()[:120] or (first_name(user) if user else "")
        payer_email = str(data.get("payer_email", "")).strip()[:254] or (user.email if user else "")
        if payer_email:
            try:
                payer_email = serializers.EmailField().run_validation(payer_email)
            except serializers.ValidationError:
                return Response({"payer_email": ["Enter a valid email, or leave it blank."]}, status=400)

        proof_bytes = None
        upload = request.FILES.get("proof")
        if upload:
            if upload.size > settings.PAYMENT_PROOF_MAX_BYTES:
                return Response({"proof": ["Screenshots must be 5 MB or smaller."]}, status=400)
            try:
                proof_bytes, _, _ = normalize_image(upload)
            except InvalidImage as exc:
                return Response({"proof": [str(exc)]}, status=400)

        with transaction.atomic():
            purchase = Subscription(
                user=user,
                story=story,
                amount=story.price,
                provider=Subscription.Provider.MANUAL,
                method=method,
                reference_number=reference,
                payer_name=payer_name,
                payer_email=payer_email,
            )
            for _ in range(5):
                purchase.access_code = new_access_code()
                try:
                    with transaction.atomic():
                        purchase.save()
                    break
                except IntegrityError:
                    continue
            if proof_bytes:
                PaymentProof.objects.create(subscription=purchase, data=proof_bytes)
            add_device(purchase, device_key(request), network_key(request))

        who = f"{first_name(user)} ({user.email})" if user else (payer_name or "A guest")
        notify_admins(
            "payment_submitted",
            f"QR payment to check: {story.title}",
            f"{who} · ₱{purchase.amount} via {method.name} · ref {reference}",
            "/admin/qr-payments",
        )
        push_admins("payments.changed", {"subscription": purchase.pk})
        return Response({"purchase": PurchaseSerializer(purchase).data}, status=status.HTTP_201_CREATED)


class PurchaseStatusView(APIView):
    """GET /api/payments/manual/<code>/ — polled while the admin checks the payment."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "views"

    def get(self, request, code):
        purchase = get_object_or_404(Subscription.objects.select_related("story", "method"), access_code=code.upper())
        return Response({"purchase": PurchaseSerializer(purchase).data})


class ClaimAccessView(APIView):
    """POST /api/access/claim/ {"code": "ABCD-EFGH"} — unlock on this device with an access code."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "access_claim"

    def post(self, request):
        code = re.sub(r"[^A-Za-z0-9]", "", str(request.data.get("code", ""))).upper()
        code = f"{code[:4]}-{code[4:]}" if len(code) == 8 else ""
        purchase = Subscription.objects.select_related("story", "method").filter(access_code=code).first()
        if purchase is None:
            return Response({"code": ["That code doesn't match any purchase."]}, status=400)
        if purchase.status == Subscription.Status.PENDING:
            return Response({"code": ["This payment is still being checked. Try again in a little while."]}, status=400)
        if purchase.status != Subscription.Status.PAID:
            return Response({"code": ["This payment wasn't approved."]}, status=400)

        if request.user.is_authenticated and not request.user.is_admin:
            if purchase.user_id is None:
                Subscription.objects.filter(pk=purchase.pk, user__isnull=True).update(user=request.user)
            if purchase.user_id in (None, request.user.pk):
                add_device(purchase, device_key(request), network_key(request))
                return Response({"purchase": PurchaseSerializer(purchase).data})
        device = device_key(request)
        if not device:
            return Response({"code": ["Your browser is blocking site storage, so this device can't be remembered."]}, status=400)
        if not add_device(purchase, device, network_key(request)):
            return Response(
                {"code": [f"This code is already used on {settings.ACCESS_MAX_DEVICES} devices. Ask the author for help."]},
                status=400,
            )
        return Response({"purchase": PurchaseSerializer(purchase).data})


# --- admin -------------------------------------------------------------------


class AdminPaymentMethodViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = PaymentMethodSerializer
    pagination_class = None
    queryset = PaymentMethod.objects.all()


class AdminManualPaymentListView(APIView):
    """GET /api/admin/payments/manual/?status=pending|paid|rejected|all"""

    permission_classes = [IsAdmin]

    def get(self, request):
        queryset = Subscription.objects.filter(provider=Subscription.Provider.MANUAL).select_related(
            "story", "method", "user", "reviewed_by", "proof"
        ).prefetch_related("grants").defer("proof__data")
        wanted = request.query_params.get("status", "pending")
        if wanted != "all":
            queryset = queryset.filter(status=wanted)
        pending = Subscription.objects.filter(provider=Subscription.Provider.MANUAL, status=Subscription.Status.PENDING)
        return Response(
            {
                "pending_count": pending.count(),
                "results": AdminPurchaseSerializer(queryset[:300], many=True).data,
            }
        )


class AdminPaymentProofView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        proof = get_object_or_404(PaymentProof, subscription_id=pk)
        response = HttpResponse(bytes(proof.data), content_type="image/webp")
        response["Cache-Control"] = "private, max-age=3600"
        return response


class AdminReviewPaymentView(APIView):
    """POST /api/admin/payments/manual/<id>/approve/  or  .../reject/ {"note": "..."}"""

    permission_classes = [IsAdmin]
    decision = None

    def post(self, request, pk):
        with transaction.atomic():
            purchase = get_object_or_404(
                Subscription.objects.select_for_update().select_related("story", "user"),
                pk=pk,
                provider=Subscription.Provider.MANUAL,
            )
            now = timezone.now()
            purchase.reviewed_by, purchase.reviewed_at = request.user, now
            purchase.admin_note = str(request.data.get("note", "")).strip()[:300]
            if self.decision == "approve":
                purchase.status, purchase.paid_at = Subscription.Status.PAID, purchase.paid_at or now
            else:
                purchase.status = Subscription.Status.REJECTED
            purchase.save()
            transaction.on_commit(lambda: _tell_reader(purchase))
        push_admins("payments.changed", {"subscription": purchase.pk})
        return Response(AdminPurchaseSerializer(purchase).data)


def _tell_reader(purchase):
    story, approved = purchase.story, purchase.status == Subscription.Status.PAID
    if purchase.user_id:
        if approved:
            notify([purchase.user_id], "payment_paid", f"Unlocked: {story.title}", "Payment confirmed. Enjoy the full story!", f"/stories/{story.slug}")
        else:
            notify(
                [purchase.user_id],
                "payment_rejected",
                f"Payment not confirmed: {story.title}",
                purchase.admin_note or "We couldn't find this transfer. Check the reference number or send us a message.",
                f"/stories/{story.slug}",
            )
    if approved and purchase.payer_email:
        link = f"{settings.FRONTEND_BASE_URL}/stories/{story.slug}?code={purchase.access_code}"
        title = html.escape(story.title)
        try:
            send_email(
                to_email=purchase.payer_email,
                to_name=purchase.payer_name,
                subject=f"Unlocked: {story.title}",
                text=(
                    f"Your payment for {story.title} is confirmed.\n\nRead it here: {link}\n\n"
                    f"Your access code is {purchase.access_code}. Enter it on another phone or computer to read there too "
                    f"(up to {settings.ACCESS_MAX_DEVICES} devices)."
                ),
                html=(
                    f"<p>Your payment for <b>{title}</b> is confirmed. Thank you!</p>"
                    f'<p><a href="{html.escape(link)}">Start reading</a></p>'
                    f"<p>Your access code is <b style=\"font-size:20px;letter-spacing:2px\">{purchase.access_code}</b>.<br>"
                    f"Enter it on another phone or computer to read there too (up to {settings.ACCESS_MAX_DEVICES} devices).</p>"
                ),
            )
        except EmailSendError:
            logger.warning("Couldn't email the access code for purchase %s", purchase.pk)


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
