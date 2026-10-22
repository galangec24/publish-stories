"""Push events to browsers over WebSockets (Django Channels).

Every signed-in socket joins `user.<id>`; admins also join `admins`.
Pushes are sent after the surrounding transaction commits, and a channel
layer outage (e.g. Redis restarting) never breaks the HTTP request; clients
re-fetch on reconnect, so nothing is lost.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)

ADMINS_GROUP = "admins"


def user_group(user_id):
    return f"user.{user_id}"


def _send(group, event, data):
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(group, {"type": "push", "event": event, "data": data})
    except Exception:  # pragma: no cover - depends on the live channel layer
        logger.warning("Realtime push to %s failed", group, exc_info=True)


def push(group, event, data):
    transaction.on_commit(lambda: _send(group, event, data))


def push_user(user_id, event, data):
    push(user_group(user_id), event, data)


def push_admins(event, data):
    push(ADMINS_GROUP, event, data)
