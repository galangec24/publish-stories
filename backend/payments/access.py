"""Who may read a paid story.

A reader is let in when any of these holds for a paid purchase of the story:
  - it belongs to their account;
  - this device (the browser's random X-Viewer-Id) has a grant for it;
  - another device with a grant is used on this same network (the one it was
    unlocked on, seen recently), and the purchase has room for one more device. That lets a guest who paid on their
    phone read on the family laptop at home without an account.
An access code (shown after paying) adds a device anywhere, within the same cap.

Device ids and networks are stored only as keyed hashes. A network is the public
IPv4 address, or the /64 prefix for IPv6 (one home line).
"""
import hashlib
import hmac
import ipaddress
import re
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone

from .models import AccessGrant, Subscription

_VIEWER_ID = re.compile(r"^[A-Za-z0-9-]{16,64}$")


def _hash(raw):
    return hmac.new(settings.SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


def device_key(request):
    header = request.headers.get("X-Viewer-Id", "")
    return _hash(f"device:{header}") if _VIEWER_ID.match(header) else ""


def network_key(request):
    try:
        ip = ipaddress.ip_address(client_ip(request))
    except ValueError:
        return ""
    if ip.version == 6:
        if ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        else:
            return _hash(f"net:{ipaddress.ip_network(f'{ip}/64', strict=False)}")
    if not ip.is_global:
        return ""  # local/test traffic: never share by network
    return _hash(f"net:{ip}")


def _network_window():
    return timezone.now() - timedelta(days=settings.ACCESS_NETWORK_DAYS)


def add_device(subscription, device, network):
    """Give this device a grant. Returns False when the purchase is at its device limit."""
    if not device:
        return False
    grant = subscription.grants.filter(device_key=device).first()
    if grant is None:
        if subscription.grants.count() >= settings.ACCESS_MAX_DEVICES:
            return False
        try:
            grant = AccessGrant.objects.create(subscription=subscription, device_key=device)
        except IntegrityError:  # two tabs at once
            grant = subscription.grants.get(device_key=device)
    _touch(grant, network)
    return True


def _touch(grant, network):
    """Keep a device's home network fresh while it's used there (at most one write an hour).

    The network is the one the device was unlocked on; using the device elsewhere
    (a cafe, mobile data) never moves it, so strangers there don't get in.
    """
    if not network or grant.network_key not in ("", network):
        return
    now = timezone.now()
    if grant.network_key == network and grant.network_seen_at and now - grant.network_seen_at < timedelta(hours=1):
        return
    AccessGrant.objects.filter(pk=grant.pk).update(network_key=network, network_seen_at=now)


def has_full_access(request, story):
    if story.is_free:
        return True
    user = request.user
    if user.is_authenticated and user.is_admin:
        return True
    paid = Subscription.objects.filter(story=story, status=Subscription.Status.PAID)
    if user.is_authenticated and paid.filter(user=user).exists():
        return True

    device, network = device_key(request), network_key(request)
    if device:
        grant = AccessGrant.objects.filter(subscription__in=paid, device_key=device).first()
        if grant:
            _touch(grant, network)
            return True
    if device and network:
        nearby = (
            paid.filter(grants__network_key=network, grants__network_seen_at__gte=_network_window())
            .distinct()
            .order_by("-paid_at")
        )
        for subscription in nearby[:5]:
            if add_device(subscription, device, network):
                return True
    return False


def purchases_for(request, story=None):
    """Purchases this reader made (by account or this device), for one story or all of them."""
    q = Q()
    if request.user.is_authenticated:
        q |= Q(user=request.user)
    device = device_key(request)
    if device:
        q |= Q(grants__device_key=device)
    if not q:
        return Subscription.objects.none()
    queryset = Subscription.objects.filter(q)
    if story is not None:
        queryset = queryset.filter(story=story)
    return queryset.distinct()
