from django.db.models import Q
from rest_framework import generics, serializers

from accounts.permissions import IsAdmin

from .models import AdminLog


class AdminLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminLog
        fields = ["id", "actor_email", "action", "target_type", "target_id", "target_label", "changes", "count", "created_at", "updated_at"]


class AdminLogListView(generics.ListAPIView):
    """GET /api/admin/activity/?q=text&actor=email&type=story — newest first."""

    permission_classes = [IsAdmin]
    serializer_class = AdminLogSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = AdminLog.objects.all()
        if params.get("q"):
            q = params["q"].strip()
            queryset = queryset.filter(Q(target_label__icontains=q) | Q(action__icontains=q) | Q(actor_email__icontains=q))
        if params.get("actor"):
            queryset = queryset.filter(actor_email__iexact=params["actor"])
        if params.get("type"):
            queryset = queryset.filter(target_type=params["type"])
        return queryset
