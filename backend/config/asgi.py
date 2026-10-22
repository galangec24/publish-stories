import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()  # set up Django before importing consumers

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402
from django.urls import path  # noqa: E402

from notifications.consumers import EventsConsumer  # noqa: E402
from notifications.ws_auth import JwtAuthMiddleware  # noqa: E402

# Only our own web app may open sockets (same list as CORS).
allowed_origins = list(settings.CORS_ALLOWED_ORIGINS) or ["*"]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": OriginValidator(
            JwtAuthMiddleware(URLRouter([path("ws/", EventsConsumer.as_asgi())])),
            allowed_origins,
        ),
    }
)
