"""GIF search for the chat through GIPHY. The key stays on the server."""
from urllib.parse import urlparse

import requests
from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

GIF_HOSTS = ("giphy.com",)


def is_gif_url(url):
    host = urlparse(url).hostname or ""
    return urlparse(url).scheme == "https" and any(host == h or host.endswith(f".{h}") for h in GIF_HOSTS)


class GifSearchView(APIView):
    """GET /api/support/gifs/?q=happy → {"enabled": bool, "results": [{id, url, preview, width, height}]}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat"

    def get(self, request):
        if not settings.GIPHY_API_KEY:
            return Response({"enabled": False, "results": []})
        q = request.query_params.get("q", "").strip()[:50]
        endpoint = "search" if q else "trending"
        try:
            response = requests.get(
                f"https://api.giphy.com/v1/gifs/{endpoint}",
                params={"api_key": settings.GIPHY_API_KEY, "q": q, "limit": 24, "rating": "pg", "lang": "en"},
                timeout=8,
            )
            data = response.json().get("data", []) if response.ok else []
        except (requests.RequestException, ValueError):
            data = []
        results = []
        for gif in data:
            images = gif.get("images", {})
            full, small = images.get("downsized_medium") or images.get("original") or {}, images.get("fixed_width_small") or {}
            if full.get("url") and is_gif_url(full["url"]):
                results.append(
                    {
                        "id": gif.get("id"),
                        "url": full["url"],
                        "preview": small.get("url") or full["url"],
                        "width": int(full.get("width") or 0),
                        "height": int(full.get("height") or 0),
                        "title": gif.get("title", "")[:80],
                    }
                )
        return Response({"enabled": True, "results": results})
