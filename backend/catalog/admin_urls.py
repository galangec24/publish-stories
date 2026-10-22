from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views as views
from .about import AdminAboutView
from .community import AdminCommentListView, AdminCommentModerateView
from .images import ImageUploadView

router = SimpleRouter()
router.register("genres", views.AdminGenreViewSet, basename="admin-genre")
router.register("columns", views.AdminColumnViewSet, basename="admin-column")
router.register("stories", views.AdminStoryViewSet, basename="admin-story")

urlpatterns = [
    # Declared before the router so "import" isn't captured as a story pk.
    path("stories/import/", views.AdminStoryImportView.as_view()),
    path("stories/import-one/", views.AdminImportOneView.as_view()),
    path("images/", ImageUploadView.as_view()),
    path("about/", AdminAboutView.as_view()),
    path("comments/", AdminCommentListView.as_view()),
    path("comments/<int:pk>/<str:action>/", AdminCommentModerateView.as_view()),
    path("stories/<int:story_id>/chapters/", views.AdminChapterListView.as_view()),
    path("stories/<int:story_id>/chapters/reorder/", views.AdminChapterReorderView.as_view()),
    path("chapters/<int:pk>/", views.AdminChapterDetailView.as_view()),
    *router.urls,
]
