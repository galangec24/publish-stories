from django.urls import path

from . import email_change, views

urlpatterns = [
    path("me/", views.MeView.as_view()),
    path("theme/", views.ThemeView.as_view()),
    path("genres/", views.GenrePreferenceView.as_view()),
    path("email-change/", email_change.MyEmailChangeView.as_view()),
    path("email-change/send-code/", email_change.SendChangeCodeView.as_view()),
    path("email-change/confirm/", email_change.ConfirmChangeView.as_view()),
]
