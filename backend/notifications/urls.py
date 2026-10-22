from django.urls import path

from . import views

urlpatterns = [
    path("notifications/", views.NotificationListView.as_view()),
    path("notifications/read-all/", views.NotificationReadAllView.as_view()),
    path("notifications/<int:pk>/read/", views.NotificationReadView.as_view()),
]
