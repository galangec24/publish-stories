from django.urls import path

from . import views

urlpatterns = [
    path("ai/presenters/", views.AdminPresentersView.as_view()),
    path("chapters/<int:pk>/ai/", views.AdminChapterAIView.as_view()),
    path("chapters/<int:pk>/ai/narration/", views.AdminNarrationView.as_view()),
    path("chapters/<int:pk>/ai/reel/script/", views.AdminReelScriptView.as_view()),
    path("chapters/<int:pk>/ai/reel/", views.AdminReelView.as_view()),
]
