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
            img = Image.open(upload)
            img = ImageOps.exif_transpose(img)
        except (UnidentifiedImageError, OSError):
            return Response({"image": ["That file isn't a supported image (JPG, PNG, WebP, GIF)."]}, status=400)
        img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "WEBP", quality=84, method=6)
        data = out.getvalue()
        stored = StoryImage.objects.create(
            data=data, width=img.width, height=img.height, size=len(data), uploaded_by=request.user
        )
        url = request.build_absolute_uri(f"/api/media/images/{stored.id}.webp")
        return Response({"url": url, "width": stored.width, "height": stored.height}, status=status.HTTP_201_CREATED)


@require_GET
def serve_image(request, pk):
    image = StoryImage.objects.filter(pk=pk).only("data", "content_type").first()
    if not image:
        raise Http404
    response = HttpResponse(bytes(image.data), content_type=image.content_type)
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    response["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response
