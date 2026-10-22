from django.urls import path

from . import views

urlpatterns = [
    path("support/", views.MyConversationView.as_view()),
    path("support/messages/", views.MySendView.as_view()),
    path("admin/support/", views.AdminConversationListView.as_view()),
    path("admin/support/<int:pk>/", views.AdminConversationView.as_view()),
    path("admin/support/<int:pk>/messages/", views.AdminReplyView.as_view()),
]
