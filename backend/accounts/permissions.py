from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Allows access only to accounts flagged is_admin."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)
