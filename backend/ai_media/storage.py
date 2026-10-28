"""Where narration audio and reel videos are kept: a private Supabase Storage bucket.

Files are never public. Readers get short-lived signed links, and only for chapters
they're allowed to read (reels are teasers, so everyone gets those).
"""
import uuid
from urllib.parse import quote, urlparse

import requests
from django.conf import settings

BUCKET = "ai-media"


class StorageError(Exception):
    pass


def configured():
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY)


def _headers(**extra):
    key = settings.SUPABASE_SERVICE_KEY
    return {"Authorization": f"Bearer {key}", "apikey": key, **extra}


def _base():
    return f"{settings.SUPABASE_URL}/storage/v1"


def _ensure_bucket():
    response = requests.post(
        f"{_base()}/bucket",
        json={"id": BUCKET, "name": BUCKET, "public": False},
        headers=_headers(),
        timeout=15,
    )
    if response.status_code >= 300 and response.status_code != 409 and "already exists" not in response.text.lower():
        raise StorageError(f"Couldn't create the storage bucket ({response.status_code})")


def save(data, content_type, extension):
    if not configured():
        raise StorageError("File storage isn't set up (SUPABASE_URL and SUPABASE_SERVICE_KEY in Render).")
    key = f"{uuid.uuid4().hex}{extension}"
    for attempt in range(2):
        try:
            response = requests.post(
                f"{_base()}/object/{BUCKET}/{key}", data=data, headers=_headers(**{"Content-Type": content_type}), timeout=120
            )
        except requests.RequestException as exc:
            raise StorageError(str(exc)) from exc
        if response.status_code < 300:
            return key
        if attempt == 0 and response.status_code in (400, 404) and "bucket" in response.text.lower():
            _ensure_bucket()
            continue
        raise StorageError(f"Upload failed ({response.status_code})")
    raise StorageError("Upload failed")


def signed_urls(keys, expires_in=6 * 3600):
    """{key: temporary link} for the given keys (missing or failed ones are left out)."""
    keys = [k for k in dict.fromkeys(keys) if k]
    if not keys or not configured():
        return {}
    try:
        response = requests.post(
            f"{_base()}/object/sign/{BUCKET}", json={"paths": keys, "expiresIn": expires_in}, headers=_headers(), timeout=15
        )
    except requests.RequestException:
        return {}
    if response.status_code >= 300:
        return {}
    links = {}
    for item in response.json():
        if item.get("error") or not item.get("signedURL"):
            continue
        url = urlparse(item["signedURL"])
        links[item["path"]] = f"{_base()}/{quote(url.path).lstrip('/')}?{url.query}"
    return links


def delete(*keys):
    keys = [k for k in keys if k]
    if not keys or not configured():
        return
    try:
        requests.delete(f"{_base()}/object/{BUCKET}", json={"prefixes": keys}, headers=_headers(), timeout=15)
    except requests.RequestException:
        pass
