from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("accounts.auth_urls")),
    path("api/user/", include("accounts.user_urls")),
    path("api/admin/", include("catalog.admin_urls")),
    path("api/admin/", include("payments.admin_urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("payments.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
