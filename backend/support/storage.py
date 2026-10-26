"""Where chat attachments are kept.

Production: a private Supabase Storage bucket (SUPABASE_URL + SUPABASE_SERVICE_KEY in
Render). Without those settings, small files go in the database so the feature still
works. Either way files are only served through the API, to the conversation's reader
and to admins.
"""
import uuid

import requests
from django.conf import settings

from .models import StoredFile

BUCKET = "chat-attachments"


class StorageError(Exception):
    pass


def _supabase():
    return settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY


def _headers(**extra):
    key = settings.SUPABASE_SERVICE_KEY
    return {"Authorization": f"Bearer {key}", "apikey": key, **extra}


def max_size():
    return settings.CHAT_FILE_MAX_BYTES if _supabase() else settings.CHAT_FILE_DB_MAX_BYTES


def _ensure_bucket():
    response = requests.post(
        f"{settings.SUPABASE_URL}/storage/v1/bucket",
        json={"id": BUCKET, "name": BUCKET, "public": False},
        headers=_headers(),
        timeout=15,
    )
    if response.status_code >= 300 and "already exists" not in response.text.lower() and response.status_code != 409:
        raise StorageError(f"Couldn't create the storage bucket ({response.status_code})")


def save(data, content_type, extension):
    key = f"{uuid.uuid4().hex}{extension}"
    if not _supabase():
        StoredFile.objects.create(key=key, data=data)
        return key
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}"
    for attempt in range(2):
        try:
            response = requests.post(url, data=data, headers=_headers(**{"Content-Type": content_type}), timeout=60)
        except requests.RequestException as exc:
            raise StorageError(str(exc)) from exc
        if response.status_code < 300:
            return key
        if attempt == 0 and response.status_code in (400, 404) and "bucket" in response.text.lower():
            _ensure_bucket()
            continue
        raise StorageError(f"Upload failed ({response.status_code})")
    raise StorageError("Upload failed")


def load(key):
    stored = StoredFile.objects.filter(key=key).first()
    if stored:
        return bytes(stored.data)
    if not _supabase():
        raise StorageError("File not found")
    try:
        response = requests.get(f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}", headers=_headers(), timeout=60)
    except requests.RequestException as exc:
        raise StorageError(str(exc)) from exc
    if response.status_code >= 300:
        raise StorageError(f"Download failed ({response.status_code})")
    return response.content


def delete(key):
    """Remove a stored attachment (best effort: a file that's already gone is fine)."""
    StoredFile.objects.filter(key=key).delete()
    if _supabase():
        try:
            requests.delete(f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}", headers=_headers(), timeout=15)
        except requests.RequestException:
            pass
