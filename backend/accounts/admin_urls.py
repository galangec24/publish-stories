from django.urls import path

from . import email_change

urlpatterns = [
    path("email-requests/", email_change.AdminEmailRequestListView.as_view()),
    path("email-requests/<int:pk>/decide/", email_change.AdminDecideView.as_view()),
]
