from django.urls import path

from . import manual, reports, views

urlpatterns = [
    path("subscribe/<int:story_id>/", views.SubscribeView.as_view()),
    path("subscriptions/", views.MySubscriptionsView.as_view()),
    path("subscriptions/<int:pk>/", views.MySubscriptionDetailView.as_view()),
    path("webhook/paymongo/", views.PayMongoWebhookView.as_view()),
    path("payment-methods/", manual.PaymentMethodListView.as_view()),
    path("payments/manual/", manual.ManualPaymentView.as_view()),
    path("payments/manual/<str:code>/", manual.PurchaseStatusView.as_view()),
    path("access/claim/", manual.ClaimAccessView.as_view()),
    path("my-purchases/", reports.MyPurchasesView.as_view()),
]
