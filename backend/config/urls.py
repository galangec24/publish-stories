from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from catalog.images import serve_image

urlpatterns = [
    path("api/auth/", include("accounts.auth_urls")),
    path("api/user/", include("accounts.user_urls")),
    path("api/admin/", include("catalog.admin_urls")),
    path("api/admin/", include("accounts.admin_urls")),
    path("api/admin/", include("payments.admin_urls")),
    path("api/admin/", include("audit.urls")),
    path("api/admin/", include("ai_media.admin_urls")),
    path("api/", include("catalog.urls")),
    path("api/media/images/<uuid:pk>.webp", serve_image),
    path("api/", include("payments.urls")),
    path("api/", include("translations.urls")),
    path("api/", include("notifications.urls")),
    path("api/", include("support.urls")),
    path("api/", include("ai_media.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
