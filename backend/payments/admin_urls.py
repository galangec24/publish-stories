from django.urls import path
from rest_framework.routers import SimpleRouter

from . import manual, views

router = SimpleRouter()
router.register("payment-methods", manual.AdminPaymentMethodViewSet, basename="admin-payment-methods")

urlpatterns = [
    path("payments/logs/", views.AdminPaymentLogView.as_view()),
    path("payments/subscriptions/", views.AdminSubscriptionView.as_view()),
    path("payments/pending/", views.AdminPendingCheckoutsView.as_view()),
    path("payments/unpaid-readers/", views.AdminUnpaidReadersView.as_view()),
    path("payments/manual/", manual.AdminManualPaymentListView.as_view()),
    path("payments/manual/<int:pk>/proof/", manual.AdminPaymentProofView.as_view()),
    path("payments/manual/<int:pk>/approve/", manual.AdminReviewPaymentView.as_view(decision="approve")),
    path("payments/manual/<int:pk>/reject/", manual.AdminReviewPaymentView.as_view(decision="reject")),
    *router.urls,
]
