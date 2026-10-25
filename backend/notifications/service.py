from django.contrib.auth import get_user_model

from .models import Notification
from .realtime import push_user


def serialize(notification):
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "link": notification.link,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


def notify(users, kind, title, body="", link=""):
    """Create a notification for each user and push it to their open tabs."""
    user_ids = [getattr(u, "pk", u) for u in users]
    created = Notification.objects.bulk_create(
        [Notification(user_id=uid, kind=kind, title=title[:200], body=body[:500], link=link) for uid in user_ids]
    )
    for notification in created:
        # bulk_create sets pk on PostgreSQL and SQLite 3.35+; re-read otherwise.
        if notification.pk is None or notification.created_at is None:
            notification = Notification.objects.filter(user_id=notification.user_id).first()
        push_user(notification.user_id, "notification", serialize(notification))
    return created


def notify_admins(kind, title, body="", link=""):
    admins = get_user_model().objects.filter(is_admin=True, is_active=True).values_list("pk", flat=True)
    return notify(list(admins), kind, title, body, link)


def first_name(user):
    """Best available first name for display in chat and admin lists."""
    if getattr(user, "first_name", ""):
        return user.first_name
    if user.display_name:
        return user.display_name.split()[0]
    return user.email.split("@")[0]


def mark_read(queryset):
    """Mark these notifications read and update each owner's bell live."""
    by_user = {}
    for pk, user_id in queryset.values_list("pk", "user_id"):
        by_user.setdefault(user_id, []).append(pk)
    if not by_user:
        return
    Notification.objects.filter(pk__in=[pk for ids in by_user.values() for pk in ids]).update(is_read=True)
    for user_id, ids in by_user.items():
        unread = Notification.objects.filter(user_id=user_id, is_read=False).count()
        push_user(user_id, "notifications.read", {"ids": ids, "unread_count": unread})
