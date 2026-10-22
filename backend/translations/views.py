import logging

from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .service import LANGUAGES, provider_name, translate_texts

logger = logging.getLogger(__name__)

MAX_TEXTS = 200
MAX_CHARS = 5000


class TranslateSerializer(serializers.Serializer):
    target = serializers.ChoiceField(choices=list(LANGUAGES))
    texts = serializers.ListField(
        child=serializers.CharField(max_length=MAX_CHARS, trim_whitespace=False), max_length=MAX_TEXTS
    )


class LanguageListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "provider": provider_name(),
                "languages": [{"code": code, "name": name, "native": native} for code, (name, native) in LANGUAGES.items()],
            }
        )


class TranslateView(APIView):
    """POST /api/translate/ {"target": "fil", "texts": ["Sign in", ...]} → {"translations": [...]}.

    Used by the web app's live translator. Results are cached server-side, so
    each distinct string is only sent to the translation provider once.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "translate"

    def post(self, request):
        data = TranslateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            translations = translate_texts(data.validated_data["texts"], data.validated_data["target"])
        except Exception as exc:  # a provider outage must not break the page
            logger.warning("Translation failed: %s", exc)
            return Response({"detail": "Translation is unavailable right now."}, status=503)
        return Response({"translations": translations})
