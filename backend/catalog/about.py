"""Editable "About Me" and "From the Author's Desk" content for the home page.

A single row holds everything; it is created with the original text the first
time it's read, so the site looks the same until an admin edits it.
"""
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import AboutProfile

# Icon names the website knows how to draw (see web/src/components/AboutMe.jsx).
ICONS = ["school", "newspaper", "graduation", "book", "pen", "award", "mic", "heart", "globe", "users", "briefcase", "star"]

DEFAULTS = {
    "name": "Maria Gemima Valderrama",
    "tagline": "Davao City · Education communicator · Journalist · Columnist",
    "intro": (
        "A Davao-based education communications professional, journalist, columnist, and former university "
        "educator. Her work has focused on education, public service, journalism, and community storytelling."
    ),
    "closing": (
        "Her public work reflects a combination of education communication, journalism, mentoring, and "
        "storytelling, particularly in highlighting the people and communities behind public education in Davao Region."
    ),
    "photo_url": "/about/maria-gemima-valderrama-v2.webp",
    "roles": [
        {
            "icon": "school",
            "title": "DepEd Davao Region",
            "text": "Served as regional information and communications officer and headed the Public Affairs Unit (PAU), "
            "supporting public information, media relations, and education communications.",
        },
        {
            "icon": "newspaper",
            "title": "Journalism & writing",
            "text": "Writes for SunStar Davao, including opinion columns on education, leadership, personal reflections, "
            "and social issues.",
        },
        {
            "icon": "graduation",
            "title": "Teaching",
            "text": "Taught Mass Communication at Ateneo de Davao University, with an emphasis on learning through "
            "real-world exposure and storytelling.",
        },
        {
            "icon": "book",
            "title": "Publications",
            "text": "Contributed to DepEd Davao Dispatch, DepEd Davao Region's official publication, including articles "
            "about education leaders and regional initiatives.",
        },
    ],
    "links": [
        {"label": "Read her columns on SunStar Davao", "url": "https://www.sunstar.com.ph/author/maria-gemima-c-valderrama"},
        {"label": "Education stories on DepEd", "url": "https://www.deped.gov.ph"},
    ],
    "blog_heading": "Stories, columns and reflections from Davao",
    "blog_intro": (
        "Welcome to my corner of the internet. Here I share the stories I write: from my newspaper columns and "
        "education features to my own book. Every reader who stops by is part of this journey. Thank you for reading."
    ),
    "blog_cards": [
        {"icon": "newspaper", "title": "Newspaper columns", "text": "Opinion columns in SunStar Davao on education, leadership, personal reflections, and social issues."},
        {"icon": "book", "title": "Her own book", "text": "Long-form storytelling in her own voice, for readers who want to go deeper."},
        {"icon": "school", "title": "Education features", "text": "Stories about education leaders and regional initiatives for DepEd Davao Dispatch."},
    ],
}


def get_profile():
    profile, _ = AboutProfile.objects.get_or_create(pk=1, defaults=DEFAULTS)
    return profile


class CardSerializer(serializers.Serializer):
    icon = serializers.ChoiceField(choices=ICONS)
    title = serializers.CharField(max_length=80)
    text = serializers.CharField(max_length=400, allow_blank=True)


class LinkSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    url = serializers.URLField(max_length=500)


class AboutSerializer(serializers.ModelSerializer):
    roles = CardSerializer(many=True)
    links = LinkSerializer(many=True)
    blog_cards = CardSerializer(many=True)

    class Meta:
        model = AboutProfile
        fields = ["name", "tagline", "intro", "closing", "photo_url", "roles", "links", "blog_heading", "blog_intro", "blog_cards", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_photo_url(self, value):
        # Uploaded images (absolute API URLs) or the built-in photo shipped with the website.
        if value and not value.startswith(("https://", "http://", "/")):
            raise serializers.ValidationError("Upload a photo or use a full https:// link.")
        return value

    def validate_roles(self, value):
        if len(value) > 8:
            raise serializers.ValidationError("Use at most 8 cards.")
        return value

    def validate_links(self, value):
        if len(value) > 6:
            raise serializers.ValidationError("Use at most 6 links.")
        return value

    def validate_blog_cards(self, value):
        if len(value) > 6:
            raise serializers.ValidationError("Use at most 6 cards.")
        return value


class AboutView(APIView):
    """GET /api/about/ — public content for the home page."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({**AboutSerializer(get_profile()).data, "icons": ICONS})


class AdminAboutView(APIView):
    """GET/PUT /api/admin/about/ — edit the About Me and author's-desk content."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({**AboutSerializer(get_profile()).data, "icons": ICONS, "defaults": DEFAULTS})

    def put(self, request):
        data = AboutSerializer(get_profile(), data=request.data)
        data.is_valid(raise_exception=True)
        data.save()
        return Response({**data.data, "icons": ICONS})
