"""Django settings for the Story Platform API.

Every secret and environment-specific value comes from the environment
(see .env.example). Nothing sensitive is hard-coded here.
"""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off")
    SECRET_KEY = "dev-only-insecure-key"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
# Render sets this to the service's real hostname (e.g. story-api-x1y2.onrender.com).
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "accounts",
    "catalog",
    "payments",
    "translations",
    "notifications",
    "support",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Real-time events (notifications, support chat). Redis (Render Key Value) lets
# every server worker reach every socket; without it a single-process
# in-memory layer is used (fine for local development and tests).
REDIS_URL = os.environ.get("REDIS_URL", "")
CHANNEL_LAYERS = {
    "default": (
        {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [REDIS_URL]}}
        if REDIS_URL
        else {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    )
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        # Supabase's pooler may close idle connections; check before reuse.
        conn_health_checks=True,
    )
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Render's disk is wiped on every deploy, so uploaded covers go to a Firebase
# Storage (Google Cloud Storage) bucket when GS_BUCKET_NAME is set. Credentials
# come from GOOGLE_APPLICATION_CREDENTIALS (a service-account JSON secret file).
GS_BUCKET_NAME = os.environ.get("GS_BUCKET_NAME", "")
STORAGES = {
    "default": (
        {
            "BACKEND": "storages.backends.gcloud.GoogleCloudStorage",
            "OPTIONS": {"bucket_name": GS_BUCKET_NAME, "querystring_auth": False, "location": "media"},
        }
        if GS_BUCKET_NAME
        else {"BACKEND": "django.core.files.storage.FileSystemStorage"}
    ),
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Bulk import: allow several manuscripts per request.
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 50
IMPORT_MAX_FILES = 50
IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
# The web app sends a random per-browser id so guest story views are counted once a day.
CORS_ALLOW_HEADERS = (*default_headers, "x-viewer-id")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5000").rstrip("/")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        "auth": "20/min",
        "otp": "10/hour",
        "views": "300/hour",
        "translate": "600/hour",
        "chat": "60/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "30"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# Google Sign-In
GOOGLE_CLIENT_IDS = env_list("GOOGLE_CLIENT_IDS")
GOOGLE_DESKTOP_CLIENT_ID = os.environ.get("GOOGLE_DESKTOP_CLIENT_ID", "")
GOOGLE_DESKTOP_CLIENT_SECRET = os.environ.get("GOOGLE_DESKTOP_CLIENT_SECRET", "")
if GOOGLE_DESKTOP_CLIENT_ID and GOOGLE_DESKTOP_CLIENT_ID not in GOOGLE_CLIENT_IDS:
    GOOGLE_CLIENT_IDS.append(GOOGLE_DESKTOP_CLIENT_ID)

# Brevo transactional email
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "no-reply@example.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "Story Platform")
BREVO_VERIFY_TEMPLATE_ID = os.environ.get("BREVO_VERIFY_TEMPLATE_ID", "")
BREVO_RESET_TEMPLATE_ID = os.environ.get("BREVO_RESET_TEMPLATE_ID", "")
OTP_TTL_MINUTES = int(os.environ.get("OTP_TTL_MINUTES", "10"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_COOLDOWN_SECONDS = 60

# PayMongo
# Live translator (web app). Without a Google key the free MyMemory service is used.
GOOGLE_TRANSLATE_API_KEY = os.environ.get("GOOGLE_TRANSLATE_API_KEY", "")
MYMEMORY_EMAIL = os.environ.get("MYMEMORY_EMAIL", "")

PAYMONGO_SECRET_KEY = os.environ.get("PAYMONGO_SECRET_KEY", "")
PAYMONGO_WEBHOOK_SECRET = os.environ.get("PAYMONGO_WEBHOOK_SECRET", "")
PAYMONGO_LIVE_MODE = env_bool("PAYMONGO_LIVE_MODE", False)
PAYMONGO_WEBHOOK_TOLERANCE_SECONDS = 300

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
