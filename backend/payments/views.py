import json
import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from catalog.models import Story

from .models import PaymentLog, Subscription
from .paymongo import PayMongoError, create_checkout_session, verify_signature

logger = logging.getLogger(__name__)
PAID_EVENT = "checkout_session.payment.paid"


class SubscriptionSerializer(serializers.ModelSerializer):
    story_slug = serializers.CharField(source="story.slug", read_only=True)
    story_title = serializers.CharField(source="story.title", read_only=True)

    class Meta:
        model = Subscription
        fields = ["id", "story", "story_slug", "story_title", "status", "amount", "checkout_url", "paid_at", "created_at"]


class AdminSubscriptionSerializer(SubscriptionSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta(SubscriptionSerializer.Meta):
        fields = SubscriptionSerializer.Meta.fields + ["user_email", "checkout_session_id"]


class PaymentLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentLog
        fields = ["id", "subscription", "event_type", "status", "signature_valid", "raw_webhook", "created_at"]


class SubscribeView(APIView):
    """POST /api/subscribe/<story_id>/ → {"checkout_url": ..., "subscription": {...}}"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, story_id):
        story = get_object_or_404(Story, pk=story_id, status=Story.Status.PUBLISHED)
        if story.is_free:
            return Response({"detail": "This story is free to read."}, status=400)
        if Subscription.objects.filter(user=request.user, story=story, status=Subscription.Status.PAID).exists():
            return Response({"detail": "You've already unlocked this story."}, status=400)

        subscription = Subscription.objects.create(user=request.user, story=story, amount=story.price)
        try:
            session_id, checkout_url = create_checkout_session(subscription=subscription, story=story)
        except PayMongoError:
            logger.exception("Checkout creation failed for subscription %s", subscription.pk)
            subscription.status = Subscription.Status.FAILED
            subscription.save(update_fields=["status"])
            return Response({"detail": "Payments are unavailable right now. Please try again."}, status=502)
        subscription.checkout_session_id = session_id
        subscription.checkout_url = checkout_url
        subscription.save(update_fields=["checkout_session_id", "checkout_url"])
        return Response(
            {"checkout_url": checkout_url, "subscription": SubscriptionSerializer(subscription).data},
            status=status.HTTP_201_CREATED,
        )


class MySubscriptionsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        return Subscription.objects.filter(user=self.request.user).select_related("story")


class MySubscriptionDetailView(generics.RetrieveAPIView):
    """Polled by the app after it opens checkout, until status becomes "paid"."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        return Subscription.objects.filter(user=self.request.user).select_related("story")


class PayMongoWebhookView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.body
        signature_ok = verify_signature(raw, request.headers.get("Paymongo-Signature", ""))
        try:
            payload = json.loads(raw or b"{}")
        except ValueError:
            payload = {}
        attributes = payload.get("data", {}).get("attributes", {})
        event_type = attributes.get("type", "unknown")

        if not signature_ok:
            PaymentLog.objects.create(event_type=event_type, status="rejected", raw_webhook=payload)
            return Response({"detail": "Invalid signature."}, status=400)

        session = attributes.get("data", {}) or {}
        session_id = session.get("id")
        metadata = session.get("attributes", {}).get("metadata") or {}

        with transaction.atomic():
            subscription = None
            if session_id:
                subscription = Subscription.objects.select_for_update().filter(checkout_session_id=session_id).first()
            if subscription is None and metadata.get("subscription_id", "").isdigit():
                subscription = Subscription.objects.select_for_update().filter(pk=metadata["subscription_id"]).first()

            outcome = "ignored"
            if event_type == PAID_EVENT and subscription:
                if subscription.status != Subscription.Status.PAID:  # idempotency guard for retries
                    subscription.status = Subscription.Status.PAID
                    subscription.paid_at = timezone.now()
                    subscription.save(update_fields=["status", "paid_at"])
                    outcome = "paid"
                else:
                    outcome = "duplicate"
            elif event_type == PAID_EVENT:
                outcome = "unmatched"
            PaymentLog.objects.create(
                subscription=subscription,
                event_type=event_type,
                status=outcome,
                signature_valid=True,
                raw_webhook=payload,
            )
        return Response({"status": outcome})


class AdminPaymentLogView(generics.ListAPIView):
    permission_classes = [IsAdmin]
    serializer_class = PaymentLogSerializer

    def get_queryset(self):
        queryset = PaymentLog.objects.all()
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset


class AdminSubscriptionView(generics.ListAPIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminSubscriptionSerializer

    def get_queryset(self):
        queryset = Subscription.objects.select_related("user", "story")
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset
