from django.urls import path

from . import views

urlpatterns = [
    path("payments/logs/", views.AdminPaymentLogView.as_view()),
    path("payments/subscriptions/", views.AdminSubscriptionView.as_view()),
    path("payments/pending/", views.AdminPendingCheckoutsView.as_view()),
    path("payments/unpaid-readers/", views.AdminUnpaidReadersView.as_view()),
]
