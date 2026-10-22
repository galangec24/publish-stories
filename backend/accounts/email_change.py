"""Admin-approved email changes.

1. Reader asks:          POST /api/user/email-change/ {new_email, reason}
2. Admin decides:        POST /api/admin/email-requests/<id>/decide/ {decision, note}
3. Reader gets a code:   POST /api/user/email-change/send-code/   (sent to the NEW address)
4. Reader confirms:      POST /api/user/email-change/confirm/
                         {code, password_choice: "keep" | "change", new_password?}
An approval is valid for 7 days. All other sessions are signed out on completion.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from notifications.realtime import push_admins
from notifications.service import first_name, notify, notify_admins

from .models import EmailChangeRequest, EmailOTP
from .otp_guard import check_code
from .permissions import IsAdmin

User = get_user_model()
Status = EmailChangeRequest.Status


def serialize(req):
    return {
        "id": req.id,
        "user": {"id": req.user_id, "first_name": first_name(req.user), "last_name": req.user.last_name},
        "old_email": req.old_email,
        "new_email": req.new_email,
        "reason": req.reason,
        "status": req.status,
        "admin_note": req.admin_note,
        "approval_expired": req.approval_expired,
        "decided_at": req.decided_at.isoformat() if req.decided_at else None,
        "created_at": req.created_at.isoformat(),
    }


def open_request(user):
    req = EmailChangeRequest.objects.filter(user=user, status__in=EmailChangeRequest.OPEN).first()
    if req and req.approval_expired:
        # Approvals last 7 days; after that the reader has to ask again.
        req.status = Status.CANCELLED
        req.admin_note = req.admin_note or "Approval expired after 7 days."
        req.save(update_fields=["status", "admin_note"])
        return None
    return req


class RequestInput(serializers.Serializer):
    new_email = serializers.EmailField()
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_new_email(self, value):
        value = value.strip().lower()
        user = self.context["user"]
        if value == user.email.lower():
            raise serializers.ValidationError("That's already your email.")
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Another account already uses this email.")
        return value


class ConfirmInput(serializers.Serializer):
    code = serializers.RegexField(r"^\s*\d{6}\s*$", error_messages={"invalid": "Enter the 6-digit code."})
    password_choice = serializers.ChoiceField(choices=["keep", "change"])
    new_password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password_choice"] == "change":
            if not attrs.get("new_password"):
                raise serializers.ValidationError({"new_password": ["Enter a new password."]})
            validate_password(attrs["new_password"], user=self.context["user"])
        return attrs


class MyEmailChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        req = open_request(request.user) or EmailChangeRequest.objects.filter(user=request.user).first()
        return Response(serialize(req) if req else None)

    def post(self, request):
        if open_request(request.user):
            return Response({"detail": "You already have an email change request in progress."}, status=400)
        data = RequestInput(data=request.data, context={"user": request.user})
        data.is_valid(raise_exception=True)
        req = EmailChangeRequest.objects.create(
            user=request.user,
            old_email=request.user.email,
            new_email=data.validated_data["new_email"],
            reason=data.validated_data.get("reason", ""),
        )
        notify_admins(
            "email_request",
            f"{first_name(request.user)} asked to change their email",
            f"{req.old_email} → {req.new_email}",
            "/admin/email-requests",
        )
        push_admins("email_request", serialize(req))
        return Response(serialize(req), status=status.HTTP_201_CREATED)

    def delete(self, request):
        req = open_request(request.user)
        if req:
            req.status = Status.CANCELLED
            req.save(update_fields=["status"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SendChangeCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        from .views import send_code  # avoid a circular import

        req = open_request(request.user)
        if not req or req.status != Status.APPROVED:
            return Response({"detail": "Your email change hasn't been approved yet."}, status=400)
        if req.approval_expired:
            return Response({"detail": "This approval expired. Please send a new request."}, status=400)
        sent = send_code(request.user, EmailOTP.Purpose.CHANGE_EMAIL, to_email=req.new_email)  # 429 when rate-limited
        return Response({"detail": f"We sent a code to {req.new_email}.", "email_sent": sent})


class ConfirmChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .views import issue_tokens, revoke_all_refresh_tokens

        req = open_request(request.user)
        if not req or req.status != Status.APPROVED or req.approval_expired:
            return Response({"detail": "There's no approved email change to confirm."}, status=400)
        data = ConfirmInput(data=request.data, context={"user": request.user})
        data.is_valid(raise_exception=True)
        if not check_code(request.user, EmailOTP.Purpose.CHANGE_EMAIL, data.validated_data["code"]):
            return Response({"code": ["Invalid or expired code."]}, status=400)
        if User.objects.filter(email__iexact=req.new_email).exclude(pk=request.user.pk).exists():
            return Response({"detail": "Another account started using this email. Please request a different one."}, status=409)

        with transaction.atomic():
            user = request.user
            user.email = req.new_email
            user.email_verified = True
            fields = ["email", "email_verified"]
            if data.validated_data["password_choice"] == "change":
                user.set_password(data.validated_data["new_password"])
                fields.append("password")
            user.save(update_fields=fields)
            req.status = Status.COMPLETED
            req.completed_at = timezone.now()
            req.save(update_fields=["status", "completed_at"])
            revoke_all_refresh_tokens(user)
        notify([user], "email_changed", "Your email was changed", f"You now sign in with {user.email}.", "/profile")
        return Response(issue_tokens(user))


class AdminEmailRequestListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        queryset = EmailChangeRequest.objects.select_related("user")
        if request.query_params.get("status"):
            queryset = queryset.filter(status=request.query_params["status"])
        return Response(
            {
                "pending_count": EmailChangeRequest.objects.filter(status=Status.PENDING).count(),
                "results": [serialize(r) for r in queryset[:200]],
            }
        )


class DecideInput(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "deny"])
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class AdminDecideView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        req = get_object_or_404(EmailChangeRequest.objects.select_related("user"), pk=pk)
        if req.status != Status.PENDING:
            return Response({"detail": "This request was already decided."}, status=400)
        data = DecideInput(data=request.data)
        data.is_valid(raise_exception=True)
        approve = data.validated_data["decision"] == "approve"
        req.status = Status.APPROVED if approve else Status.DENIED
        req.admin_note = data.validated_data.get("note", "")
        req.decided_by = request.user
        req.decided_at = timezone.now()
        req.save(update_fields=["status", "admin_note", "decided_by", "decided_at"])
        if approve:
            notify(
                [req.user_id],
                "email_approved",
                "Your email change was approved",
                f"Open your profile to confirm {req.new_email} with a code.",
                "/profile",
            )
        else:
            notify(
                [req.user_id],
                "email_denied",
                "Your email change was declined",
                req.admin_note or "Contact support if you have questions.",
                "/profile",
            )
        push_admins("email_request", serialize(req))
        return Response(serialize(req))
