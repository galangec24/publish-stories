"""Authenticate WebSocket connections with the same JWT access token the API uses.

Browsers can't set headers on WebSocket requests, so the token travels as
`?token=<access>`; it is short-lived (15 min) and the socket only receives.
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def _user_for(token):
    try:
        user_id = AccessToken(token)["user_id"]
    except (TokenError, KeyError):
        return AnonymousUser()
    return get_user_model().objects.filter(pk=user_id, is_active=True).first() or AnonymousUser()


class JwtAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        token = parse_qs(scope.get("query_string", b"").decode()).get("token", [""])[0]
        scope["user"] = await _user_for(token) if token else AnonymousUser()
        return await self.app(scope, receive, send)
