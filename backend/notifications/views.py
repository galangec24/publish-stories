from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .service import serialize


class NotificationListView(APIView):
    """GET /api/notifications/?before=<id> → {unread_count, results, has_more}."""

    permission_classes = [permissions.IsAuthenticated]
    page_size = 20

    def get(self, request):
        queryset = request.user.notifications.all()
        before = request.query_params.get("before")
        if before and before.isdigit():
            queryset = queryset.filter(id__lt=int(before))
        items = list(queryset[: self.page_size + 1])
        return Response(
            {
                "unread_count": request.user.notifications.filter(is_read=False).count(),
                "results": [serialize(n) for n in items[: self.page_size]],
                "has_more": len(items) > self.page_size,
            }
        )


class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response({"unread_count": request.user.notifications.filter(is_read=False).count()})


class NotificationReadAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.notifications.filter(is_read=False).update(is_read=True)
        return Response({"unread_count": 0})
