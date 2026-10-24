"""Upload and serve images used inside stories."""
import io

from django.http import Http404, HttpResponse
from django.views.decorators.http import require_GET
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import StoryImage

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1600  # px; plenty for a reading column at 2x density


class InvalidImage(ValueError):
    pass


def store_image(raw, user=None):
    """Normalise an image and save it. Returns the StoryImage."""
    data, width, height = normalize_image(raw)
    return StoryImage.objects.create(data=data, width=width, height=height, size=len(data), uploaded_by=user)


def normalize_image(raw):
    """Fix orientation, fit within 1600 px and re-encode as WebP (dropping metadata). Returns (bytes, w, h)."""
    try:
        img = Image.open(io.BytesIO(raw) if isinstance(raw, (bytes, bytearray)) else raw)
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidImage("That file isn't a supported image (JPG, PNG, WebP, GIF).") from exc
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=84, method=6)
    return out.getvalue(), img.width, img.height


def image_url(request, stored):
    return request.build_absolute_uri(f"/api/media/images/{stored.id}.webp")


class ImageUploadView(APIView):
    """POST /api/admin/images/ (multipart "image") → {url, width, height}."""

    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("image")
        if not upload:
            return Response({"image": ["Choose an image."]}, status=400)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"image": ["Images must be 10 MB or smaller."]}, status=400)
        try:
            stored = store_image(upload, request.user)
        except InvalidImage as exc:
            return Response({"image": [str(exc)]}, status=400)
        return Response(
            {"url": image_url(request, stored), "width": stored.width, "height": stored.height},
            status=status.HTTP_201_CREATED,
        )


@require_GET
def serve_image(request, pk):
    image = StoryImage.objects.filter(pk=pk).only("data", "content_type").first()
    if not image:
        raise Http404
    response = HttpResponse(bytes(image.data), content_type=image.content_type)
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    response["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response
