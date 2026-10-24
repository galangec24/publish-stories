from django.urls import path

from .views import AdminLogListView

urlpatterns = [path("activity/", AdminLogListView.as_view())]
