from django.urls import path

from . import views

urlpatterns = [
    path("reels/", views.ReelFeedView.as_view()),
    path("stories/<slug:slug>/chapters/<int:chapter_id>/narration/", views.NarrationView.as_view()),
]
