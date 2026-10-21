from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from catalog.models import Genre
from catalog.serializers import GenreSerializer

from .models import EmailOTP, UserTheme

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    theme = serializers.SerializerMethodField()
    preferred_genres = GenreSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "display_name",
            "avatar_url",
            "auth_provider",
            "email_verified",
            "is_admin",
            "onboarded",
            "reading_mode",
            "theme",
            "preferred_genres",
            "date_joined",
        ]
        read_only_fields = [f for f in fields if f not in ("display_name", "avatar_url", "reading_mode")]

    def get_theme(self, user):
        theme = getattr(user, "theme", None)
        return theme.theme_name if theme else UserTheme.Theme.LIGHT


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        validate_password(attrs["password"], user=User(email=attrs["email"], display_name=attrs.get("display_name", "")))
        return attrs


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class LoginSerializer(EmailSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class VerifyEmailSerializer(EmailSerializer):
    code = serializers.RegexField(r"^\s*\d{6}\s*$", error_messages={"invalid": "Enter the 6-digit code."})


class ResendCodeSerializer(EmailSerializer):
    purpose = serializers.ChoiceField(choices=EmailOTP.Purpose.choices, default=EmailOTP.Purpose.VERIFY_EMAIL)


class PasswordResetConfirmSerializer(VerifyEmailSerializer):
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        validate_password(attrs["new_password"], user=User(email=attrs["email"]))
        return attrs


class GoogleLoginSerializer(serializers.Serializer):
    """Either an ID token (Android/iOS/web) or a PKCE authorization code (Windows)."""

    id_token = serializers.CharField(required=False)
    code = serializers.CharField(required=False)
    code_verifier = serializers.CharField(required=False)
    redirect_uri = serializers.URLField(required=False)

    def validate(self, attrs):
        if attrs.get("id_token"):
            return attrs
        if attrs.get("code") and attrs.get("code_verifier") and attrs.get("redirect_uri"):
            return attrs
        raise serializers.ValidationError("Provide id_token, or code + code_verifier + redirect_uri.")


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class ThemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserTheme
        fields = ["theme_name"]


class GenrePreferenceSerializer(serializers.Serializer):
    genre_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Genre.objects.filter(is_active=True), allow_empty=True
    )
