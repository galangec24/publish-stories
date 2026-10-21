from django.urls import path

from . import views

urlpatterns = [
    path("subscribe/<int:story_id>/", views.SubscribeView.as_view()),
    path("subscriptions/", views.MySubscriptionsView.as_view()),
    path("subscriptions/<int:pk>/", views.MySubscriptionDetailView.as_view()),
    path("webhook/paymongo/", views.PayMongoWebhookView.as_view()),
]
