from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view()),
    path("verify-email/", views.VerifyEmailView.as_view()),
    path("resend-code/", views.ResendCodeView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("google/", views.GoogleLoginView.as_view()),
    path("password/reset/", views.PasswordResetRequestView.as_view()),
    path("password/reset/confirm/", views.PasswordResetConfirmView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("logout/", views.LogoutView.as_view()),
]
