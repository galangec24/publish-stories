from django.urls import path

from . import views
from .about import AboutView
from .community import CommentDetailView, CommentListView, LikeView

urlpatterns = [
    path("home/", views.HomeView.as_view()),
    path("genres/", views.GenreListView.as_view()),
    path("columns/", views.ColumnListView.as_view()),
    path("columns/<slug:slug>/", views.ColumnDetailView.as_view()),
    path("stories/", views.StoryListView.as_view()),
    path("stories/<slug:slug>/", views.StoryDetailView.as_view()),
    path("stories/<slug:slug>/view/", views.RecordViewView.as_view()),
    path("stories/<slug:slug>/like/", LikeView.as_view()),
    path("stories/<slug:slug>/comments/", CommentListView.as_view()),
    path("comments/<int:pk>/", CommentDetailView.as_view()),
    path("stats/", views.StatsView.as_view()),
    path("about/", AboutView.as_view()),
]
