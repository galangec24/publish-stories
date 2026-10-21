from django.urls import path

from . import views

urlpatterns = [
    path("payments/logs/", views.AdminPaymentLogView.as_view()),
    path("payments/subscriptions/", views.AdminSubscriptionView.as_view()),
]
