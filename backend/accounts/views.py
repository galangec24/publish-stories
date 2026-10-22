import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from catalog.serializers import GenreSerializer

from . import serializers as s
from .brevo import EmailSendError, send_otp_email
from .google_auth import GoogleAuthError, exchange_desktop_code, verify_id_token
from .models import EmailOTP, UserTheme
from .otp_guard import OTPLimited, OTPSendThrottle, check_code, ensure_can_send

logger = logging.getLogger(__name__)
User = get_user_model()

INVALID_CODE = {"code": ["Invalid or expired code."]}
NO_ACCOUNT = {"email": ["No account uses this email. Check for typos, or create an account."]}


def issue_tokens(user, **extra):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": s.UserSerializer(user).data, **extra}


def send_code(user, purpose, to_email=None):
    """Issue an OTP and email it through Brevo. Returns whether the email went out.

    Raises OTPLimited (HTTP 429) when the anti-spam limits say no.
    """
    ensure_can_send(user, purpose)
    _, code = EmailOTP.issue(user, purpose)
    try:
        send_otp_email(user, purpose, code, to_email=to_email)
        return True
    except EmailSendError:
        logger.exception("Could not send %s code to user %s", purpose, user.pk)
        return False


def revoke_all_refresh_tokens(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def find_user(email):
    return User.objects.filter(email__iexact=email).first()


class PublicAuthView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(PublicAuthView):
    """Create an email/password account and mail a verification code via Brevo."""

    throttle_classes = [ScopedRateThrottle, OTPSendThrottle]

    def post(self, request):
        data = s.RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]
        display_name = data.validated_data.get("display_name", "")
        names = {k: data.validated_data.get(k, "") for k in ("first_name", "last_name")}
        display_name = display_name or " ".join(v for v in names.values() if v)

        user = find_user(email)
        if user and user.email_verified:
            return Response({"email": ["An account with this email already exists. Try signing in."]}, status=400)
        if user:
            # Unverified sign-up being retried: whoever proves the inbox owns the account.
            user.set_password(password)
            user.display_name = display_name or user.display_name
            user.first_name = names["first_name"] or user.first_name
            user.last_name = names["last_name"] or user.last_name
            user.save(update_fields=["password", "display_name", "first_name", "last_name"])
        else:
            user = User.objects.create_user(email=email, password=password, display_name=display_name, **names)

        sent = send_code(user, EmailOTP.Purpose.VERIFY_EMAIL)
        return Response(
            {
                "detail": "We sent a 6-digit code to your email.",
                "email": user.email,
                "email_sent": sent,
                "retry_after": settings.OTP_RESEND_COOLDOWN_SECONDS,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(PublicAuthView):
    def post(self, request):
        data = s.VerifyEmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = find_user(data.validated_data["email"])
        if not user:
            return Response(INVALID_CODE, status=400)
        if not check_code(user, EmailOTP.Purpose.VERIFY_EMAIL, data.validated_data["code"]):
            return Response(INVALID_CODE, status=400)
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        return Response(issue_tokens(user))


class ResendCodeView(PublicAuthView):
    throttle_scope = "otp"
    throttle_classes = [ScopedRateThrottle, OTPSendThrottle]

    def post(self, request):
        data = s.ResendCodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        purpose = data.validated_data["purpose"]
        if purpose == EmailOTP.Purpose.CHANGE_EMAIL:
            return Response({"purpose": ["Use the email change screen in your profile."]}, status=400)
        user = find_user(data.validated_data["email"])
        if not user or not user.is_active:
            return Response(NO_ACCOUNT, status=404)
        if purpose == EmailOTP.Purpose.VERIFY_EMAIL and user.email_verified:
            return Response({"detail": "This email is already verified. You can sign in."}, status=400)
        sent = send_code(user, purpose)
        return Response(
            {"detail": f"We sent a new code to {user.email}.", "email_sent": sent, "retry_after": settings.OTP_RESEND_COOLDOWN_SECONDS}
        )


class LoginView(PublicAuthView):
    def post(self, request):
        data = s.LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = find_user(data.validated_data["email"])
        if not user or not user.is_active or not user.check_password(data.validated_data["password"]):
            return Response({"detail": "Incorrect email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.email_verified:
            try:
                send_code(user, EmailOTP.Purpose.VERIFY_EMAIL)
                detail, wait = "Verify your email first. We sent you a new code.", settings.OTP_RESEND_COOLDOWN_SECONDS
            except OTPLimited as limited:
                detail, wait = "Verify your email first. Use the code we already sent you.", limited.wait
            return Response(
                {"code": "email_not_verified", "detail": detail, "retry_after": wait},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(issue_tokens(user))


class GoogleLoginView(PublicAuthView):
    """Sign in (or sign up) with Google. Links to an existing account with the same email."""

    def post(self, request):
        data = s.GoogleLoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            if v.get("id_token"):
                info = verify_id_token(v["id_token"])
            else:
                info = exchange_desktop_code(v["code"], v["code_verifier"], v["redirect_uri"])
        except GoogleAuthError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        sub, email = info["sub"], info["email"].lower()
        created = False
        with transaction.atomic():
            user = User.objects.select_for_update().filter(google_sub=sub).first()
            if not user:
                user = User.objects.select_for_update().filter(email__iexact=email).first()
                if user:
                    if not user.email_verified:
                        # The password on an unverified account was never proven to
                        # belong to the inbox owner; drop it now that Google has.
                        user.set_unusable_password()
                    user.google_sub = sub
                    user.email_verified = True
                    user.display_name = user.display_name or info.get("name", "")
                    user.first_name = user.first_name or info.get("given_name", "")[:60]
                    user.last_name = user.last_name or info.get("family_name", "")[:60]
                    user.avatar_url = user.avatar_url or info.get("picture", "")
                    user.save()
                else:
                    user = User.objects.create_user(
                        email=email,
                        google_sub=sub,
                        auth_provider=User.Provider.GOOGLE,
                        email_verified=True,
                        display_name=info.get("name", ""),
                        first_name=info.get("given_name", "")[:60],
                        last_name=info.get("family_name", "")[:60],
                        avatar_url=info.get("picture", ""),
                    )
                    created = True
        if not user.is_active:
            return Response({"detail": "This account is disabled."}, status=status.HTTP_403_FORBIDDEN)
        return Response(issue_tokens(user, created=created))


class PasswordResetRequestView(PublicAuthView):
    """Email a reset code. Unknown emails stop here (404) so no code is issued for them."""

    throttle_scope = "otp"
    throttle_classes = [ScopedRateThrottle, OTPSendThrottle]

    def post(self, request):
        data = s.EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = find_user(data.validated_data["email"])
        if not user or not user.is_active:
            return Response(NO_ACCOUNT, status=404)
        sent = send_code(user, EmailOTP.Purpose.RESET_PASSWORD)
        return Response(
            {"detail": f"We sent a 6-digit code to {user.email}.", "email_sent": sent, "retry_after": settings.OTP_RESEND_COOLDOWN_SECONDS}
        )


class PasswordResetConfirmView(PublicAuthView):
    def post(self, request):
        data = s.PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = find_user(data.validated_data["email"])
        if not user or not user.is_active:
            return Response(INVALID_CODE, status=400)
        if not check_code(user, EmailOTP.Purpose.RESET_PASSWORD, data.validated_data["code"]):
            return Response(INVALID_CODE, status=400)
        user.set_password(data.validated_data["new_password"])
        user.email_verified = True
        user.save(update_fields=["password", "email_verified"])
        revoke_all_refresh_tokens(user)
        return Response(issue_tokens(user))


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = s.LogoutSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            RefreshToken(data.validated_data["refresh"]).blacklist()
        except TokenError:
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = s.UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ThemeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        theme, _ = UserTheme.objects.get_or_create(user=request.user)
        return Response(s.ThemeSerializer(theme).data)

    def put(self, request):
        theme, _ = UserTheme.objects.get_or_create(user=request.user)
        data = s.ThemeSerializer(theme, data=request.data)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(data.data)


class GenrePreferenceView(APIView):
    """The genres a reader picked during onboarding; drives the "For you" shelf."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(GenreSerializer(request.user.preferred_genres.all(), many=True).data)

    def put(self, request):
        data = s.GenrePreferenceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        request.user.preferred_genres.set(data.validated_data["genre_ids"])
        request.user.onboarded = True
        request.user.save(update_fields=["onboarded"])
        return Response(GenreSerializer(request.user.preferred_genres.all(), many=True).data)
