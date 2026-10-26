"""Records every change an admin makes through the API, for the admin's Activity log.

Done in one place (instead of in each view) so new admin screens are covered too.
Only successful requests are kept. Repeated autosaves of the same chapter within
a few minutes fold into one entry with a count.
"""
import json
import logging
import re
from datetime import timedelta

from django.apps import apps
from django.utils import timezone

logger = logging.getLogger(__name__)

FOLD_WINDOW = timedelta(minutes=10)
SECRET_KEYS = {"password", "new_password", "token", "access", "refresh", "code"}

# (methods, path pattern after /api/, action, target type, model used to name the target)
ROUTES = [
    ({"POST"}, r"admin/stories/$", "Created story", "story", None),
    ({"PATCH", "PUT"}, r"admin/stories/(?P<id>\d+)/$", "Edited story settings", "story", "catalog.Story"),
    ({"DELETE"}, r"admin/stories/(?P<id>\d+)/$", "Deleted story", "story", "catalog.Story"),
    ({"POST"}, r"admin/stories/(?P<id>\d+)/publish/$", "Published story", "story", "catalog.Story"),
    ({"POST"}, r"admin/stories/(?P<id>\d+)/unpublish/$", "Unpublished story", "story", "catalog.Story"),
    ({"POST"}, r"admin/stories/(?P<id>\d+)/chapters/$", "Added chapter", "story", "catalog.Story"),
    ({"POST"}, r"admin/stories/(?P<id>\d+)/chapters/reorder/$", "Reordered chapters", "story", "catalog.Story"),
    ({"PATCH", "PUT"}, r"admin/chapters/(?P<id>\d+)/$", "Edited chapter", "chapter", "catalog.Chapter"),
    ({"DELETE"}, r"admin/chapters/(?P<id>\d+)/$", "Deleted chapter", "chapter", "catalog.Chapter"),
    ({"POST"}, r"admin/chapters/(?P<id>\d+)/restore/$", "Restored chapter", "chapter", "catalog.Chapter"),
    ({"POST"}, r"admin/stories/import/$", "Bulk imported stories", "story", None),
    ({"POST"}, r"admin/stories/import-one/$", "Imported a manuscript", "story", None),
    ({"PUT", "PATCH"}, r"admin/about/$", "Edited About me", "about", None),
    ({"POST"}, r"admin/genres/$", "Added genre", "genre", None),
    ({"PATCH", "PUT"}, r"admin/genres/(?P<id>\d+)/$", "Edited genre", "genre", "catalog.Genre"),
    ({"DELETE"}, r"admin/genres/(?P<id>\d+)/$", "Deleted genre", "genre", "catalog.Genre"),
    ({"POST"}, r"admin/columns/$", "Added column", "column", None),
    ({"PATCH", "PUT"}, r"admin/columns/(?P<id>\d+)/$", "Edited column", "column", "catalog.Column"),
    ({"DELETE"}, r"admin/columns/(?P<id>\d+)/$", "Deleted column", "column", "catalog.Column"),
    ({"POST"}, r"admin/comments/(?P<id>\d+)/hide/$", "Hid comment", "comment", "catalog.Comment"),
    ({"POST"}, r"admin/comments/(?P<id>\d+)/unhide/$", "Unhid comment", "comment", "catalog.Comment"),
    ({"DELETE"}, r"comments/(?P<id>\d+)/$", "Deleted comment", "comment", "catalog.Comment"),
    ({"POST"}, r"admin/payment-methods/$", "Added QR code", "payment method", None),
    ({"PATCH", "PUT"}, r"admin/payment-methods/(?P<id>\d+)/$", "Edited QR code", "payment method", "payments.PaymentMethod"),
    ({"DELETE"}, r"admin/payment-methods/(?P<id>\d+)/$", "Deleted QR code", "payment method", "payments.PaymentMethod"),
    ({"POST"}, r"admin/payments/manual/(?P<id>\d+)/approve/$", "Confirmed payment", "payment", "payments.Subscription"),
    ({"POST"}, r"admin/payments/manual/(?P<id>\d+)/reject/$", "Revoked payment", "payment", "payments.Subscription"),
    ({"POST"}, r"admin/email-requests/(?P<id>\d+)/decide/$", "Decided email change", "email request", "accounts.EmailChangeRequest"),
]
ROUTES = [(methods, re.compile(f"^/api/{pattern}"), action, kind, model) for methods, pattern, action, kind, model in ROUTES]
FOLDED = {"Edited chapter", "Edited story settings", "Edited About me"}


def _label(obj):
    for attr in ("title", "name", "story_title"):
        value = getattr(obj, attr, None)
        if value:
            return str(value)
    if obj.__class__.__name__ == "Comment":
        return f"“{obj.body[:60]}” on {obj.story.title}"
    if obj.__class__.__name__ == "Subscription":
        who = obj.user.email if obj.user_id else (obj.payer_name or "guest")
        return f"₱{obj.amount} for {obj.story.title} ({who}, ref {obj.reference_number})"
    if hasattr(obj, "new_email"):
        return f"{obj.user.email} → {obj.new_email}"
    return str(obj)


def _lookup(model, pk):
    if not (model and pk):
        return None
    try:
        return apps.get_model(model).objects.filter(pk=pk).first()
    except LookupError:
        return None


def _small_changes(request_body):
    """Values worth showing (price, status, title...). Long text like chapter content is listed by name only."""
    changes, other = {}, []
    if not isinstance(request_body, dict):
        return changes
    for key, value in request_body.items():
        if key in SECRET_KEYS:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            if isinstance(value, str) and len(value) > 120:
                other.append(key)
            else:
                changes[key] = value
        elif isinstance(value, list) and len(value) <= 20 and all(isinstance(v, (int, str)) and len(str(v)) <= 40 for v in value):
            changes[key] = value
        else:
            other.append(key)
    if other:
        changes["_also"] = sorted(other)
    return changes


class AdminAuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        route = None
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.path.startswith("/api/"):
            for methods, pattern, action, kind, model in ROUTES:
                match = pattern.match(request.path) if request.method in methods else None
                if match:
                    route = (match, action, kind, model)
                    break
        if route is None:
            return self.get_response(request)

        match, action, kind, model = route
        body = {}
        if request.content_type == "application/json" and len(request.body or b"") < 2_000_000:
            try:
                body = json.loads(request.body or b"{}")
            except ValueError:
                body = {}
        before = _lookup(model, match.groupdict().get("id")) if request.method == "DELETE" else None
        before_label = _label(before) if before else ""

        response = self.get_response(request)
        try:
            user = getattr(request, "user", None)
            if 200 <= response.status_code < 300 and user is not None and user.is_authenticated and user.is_admin:
                data = getattr(response, "data", None)
                if request.path.endswith("import-one/") and not (isinstance(data, dict) and data.get("id")):
                    return response  # a manuscript preview changes nothing
                self._record(request, user, response, match, action, kind, model, body, before_label)
        except Exception:  # never let logging break the admin's action
            logger.exception("Couldn't record admin activity for %s", request.path)
        return response

    def _record(self, request, user, response, match, action, kind, model, body, before_label):
        from .models import AdminLog

        data = getattr(response, "data", None)
        target_id = match.groupdict().get("id") or (str(data.get("id", "")) if isinstance(data, dict) else "")
        label = before_label
        if not label:
            obj = _lookup(model, target_id)
            label = _label(obj) if obj else ""
        if not label and isinstance(data, dict):
            label = str(data.get("title") or data.get("name") or "")
        if not label and isinstance(data, dict) and "created" in data:
            created = data["created"]
            count = created if isinstance(created, int) else len(created)
            label = f"{count} {'story' if count == 1 else 'stories'}"
        changes = _small_changes(body)

        if action in FOLDED:
            recent = AdminLog.objects.filter(
                actor=user, action=action, path=request.path, updated_at__gte=timezone.now() - FOLD_WINDOW
            ).first()
            if recent:
                merged = {**recent.changes, **changes}
                if recent.changes.get("_also") or changes.get("_also"):
                    merged["_also"] = sorted(set(recent.changes.get("_also", [])) | set(changes.get("_also", [])))
                recent.changes, recent.count, recent.target_label = merged, recent.count + 1, label or recent.target_label
                recent.save(update_fields=["changes", "count", "target_label", "updated_at"])
                return
        AdminLog.objects.create(
            actor=user,
            actor_email=user.email,
            action=action,
            target_type=kind,
            target_id=target_id[:40],
            target_label=label[:200],
            changes=changes,
            path=request.path[:200],
        )
