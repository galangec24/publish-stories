"""Machine translation with a database cache.

Provider order:
  1. Google Cloud Translation v2, when GOOGLE_TRANSLATE_API_KEY is set
     (supports Filipino, Cebuano, Ilocano and 100+ others; billed per character
     after the free monthly allowance).
  2. MyMemory (free, no key; a small daily quota per server IP, larger when
     MYMEMORY_EMAIL is set). Good enough for testing.
Only strings not already in the cache are sent to a provider.
"""
import html
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from django.db import IntegrityError

from .models import Translation, text_hash

logger = logging.getLogger(__name__)

# code → (English name, native name). Google codes; MyMemory accepts the same.
LANGUAGES = {
    "en": ("English", "English"),
    "fil": ("Filipino", "Filipino"),
    "ceb": ("Cebuano", "Bisaya"),
    "ilo": ("Ilocano", "Ilokano"),
    "es": ("Spanish", "Español"),
    "zh-CN": ("Chinese (Simplified)", "简体中文"),
    "ja": ("Japanese", "日本語"),
    "ko": ("Korean", "한국어"),
    "ar": ("Arabic", "العربية"),
}

GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2"
MYMEMORY_URL = "https://api.mymemory.translated.net/get"
GOOGLE_BATCH = 100  # max segments per Google request


class TranslationError(Exception):
    pass


def _google(texts, target):
    out = []
    for start in range(0, len(texts), GOOGLE_BATCH):
        chunk = texts[start : start + GOOGLE_BATCH]
        response = requests.post(
            GOOGLE_URL,
            params={"key": settings.GOOGLE_TRANSLATE_API_KEY},
            # Google's code for Filipino is "tl".
            json={"q": chunk, "source": "en", "target": "tl" if target == "fil" else target, "format": "text"},
            timeout=20,
        )
        if response.status_code != 200:
            raise TranslationError(f"Google Translate responded {response.status_code}: {response.text[:200]}")
        out.extend(html.unescape(t["translatedText"]).strip() for t in response.json()["data"]["translations"])
    return out


def _mymemory_one(text, target):
    lang = "tl" if target == "fil" else target
    params = {"q": text, "langpair": f"en|{lang}"}
    if settings.MYMEMORY_EMAIL:
        params["de"] = settings.MYMEMORY_EMAIL
    response = requests.get(MYMEMORY_URL, params=params, timeout=15)
    data = response.json() if response.ok else {}
    if str(data.get("responseStatus")) != "200":
        raise TranslationError(f"MyMemory: {data.get('responseDetails') or response.status_code}")
    return html.unescape(data["responseData"]["translatedText"]).strip()


def _mymemory(texts, target):
    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(lambda t: _mymemory_one(t, target), texts))


def provider_name():
    return "google" if settings.GOOGLE_TRANSLATE_API_KEY else "mymemory"


def translate_texts(texts, target):
    """Translate English `texts` into `target`, returning a list in the same order."""
    if target == "en":
        return list(texts)
    hashes = [text_hash(t) for t in texts]
    cached = dict(
        Translation.objects.filter(target=target, source_hash__in=set(hashes)).values_list(
            "source_hash", "translated_text"
        )
    )
    missing = list(dict.fromkeys(t for t, h in zip(texts, hashes) if h not in cached))
    if missing:
        provider = provider_name()
        fresh = _google(missing, target) if provider == "google" else _mymemory(missing, target)
        for source, translated in zip(missing, fresh):
            h = text_hash(source)
            cached[h] = translated
            try:
                Translation.objects.create(
                    source_hash=h, target=target, source_text=source, translated_text=translated, provider=provider
                )
            except IntegrityError:
                pass  # another request cached it first
    return [cached[h] for h in hashes]
