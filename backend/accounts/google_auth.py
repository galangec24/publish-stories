"""Verify Google identities for "Sign in with Google".

Android, iOS and web clients send an ID token they got from Google directly.
The Windows client can't use the google_sign_in plugin, so it runs the OAuth
loopback + PKCE flow and sends us the authorization code; we exchange it for
an ID token here so the desktop client secret never ships inside the app.
"""
import requests
from django.conf import settings
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleAuthError(Exception):
    pass


def verify_id_token(token):
    if not settings.GOOGLE_CLIENT_IDS:
        raise GoogleAuthError("Google sign-in is not configured")
    try:
        info = google_id_token.verify_oauth2_token(token, google_requests.Request())
    except ValueError as exc:
        raise GoogleAuthError(f"Invalid Google token: {exc}") from exc
    if info.get("aud") not in settings.GOOGLE_CLIENT_IDS:
        raise GoogleAuthError("Google token was issued for an unknown client")
    if not info.get("email") or not info.get("email_verified"):
        raise GoogleAuthError("Google account email is not verified")
    return info


def exchange_desktop_code(code, code_verifier, redirect_uri):
    if not settings.GOOGLE_DESKTOP_CLIENT_ID:
        raise GoogleAuthError("Desktop Google sign-in is not configured")
    try:
        response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
                "client_id": settings.GOOGLE_DESKTOP_CLIENT_ID,
                "client_secret": settings.GOOGLE_DESKTOP_CLIENT_SECRET,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise GoogleAuthError(str(exc)) from exc
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.status_code != 200 or "id_token" not in body:
        raise GoogleAuthError("Google rejected the authorization code")
    return verify_id_token(body["id_token"])
