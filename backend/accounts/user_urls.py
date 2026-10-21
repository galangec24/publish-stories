from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.MeView.as_view()),
    path("theme/", views.ThemeView.as_view()),
    path("genres/", views.GenrePreferenceView.as_view()),
]
