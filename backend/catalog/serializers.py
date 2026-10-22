from rest_framework import serializers

from . import delta
from .models import Chapter, Column, Genre, Story


class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ["id", "name", "slug", "description", "color", "sort_order", "is_active"]
        read_only_fields = ["slug"]


class ColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ["id", "title", "slug", "description", "is_public", "created_at"]
        read_only_fields = ["slug", "created_at"]


class ColumnMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ["id", "title", "slug", "is_public"]


class StoryListSerializer(serializers.ModelSerializer):
    column = ColumnMiniSerializer(read_only=True)
    genres = GenreSerializer(many=True, read_only=True)
    is_free = serializers.BooleanField(read_only=True)
    chapter_count = serializers.SerializerMethodField()

    class Meta:
        model = Story
        fields = [
            "id",
            "title",
            "slug",
            "author_name",
            "synopsis",
            "cover_image",
            "column",
            "genres",
            "price",
            "is_free",
            "preview_page_count",
            "font_family",
            "font_size",
            "word_count",
            "view_count",
            "reader_count",
            "chapter_count",
            "status",
            "published_at",
        ]

    def get_chapter_count(self, story):
        return len(story.chapters.all())  # uses the prefetch cache


class ChapterContentField(serializers.JSONField):
    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        try:
            delta.validate_ops(data)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return delta.normalize(data)


class ChapterSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Chapter
        fields = ["id", "title", "order", "word_count", "revision", "updated_at"]


class AdminChapterSerializer(serializers.ModelSerializer):
    content = ChapterContentField(required=False)

    class Meta:
        model = Chapter
        fields = ["id", "story", "title", "order", "content", "word_count", "revision", "updated_at"]
        read_only_fields = ["story", "word_count", "revision", "updated_at"]


class AdminStorySerializer(StoryListSerializer):
    column_id = serializers.PrimaryKeyRelatedField(
        source="column", queryset=Column.objects.all(), allow_null=True, required=False
    )
    genre_ids = serializers.PrimaryKeyRelatedField(
        source="genres", queryset=Genre.objects.all(), many=True, required=False
    )
    chapters = ChapterSummarySerializer(many=True, read_only=True)

    class Meta(StoryListSerializer.Meta):
        fields = StoryListSerializer.Meta.fields + [
            "column_id",
            "genre_ids",
            "chapters",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["word_count", "view_count", "reader_count", "published_at", "created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}}

    def validate_font_size(self, value):
        if not 14 <= value <= 26:
            raise serializers.ValidationError("Choose a size between 14 and 26.")
        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price can't be negative.")
        if 0 < value < 20:
            # PayMongo's minimum charge is PHP 20.00.
            raise serializers.ValidationError("Paid stories must cost at least PHP 20.00 (or 0 for free).")
        return value


class ImportOptionsSerializer(serializers.Serializer):
    """Defaults applied to every file in a bulk import; a manifest entry can override them per file."""

    title = serializers.CharField(max_length=200, required=False)
    synopsis = serializers.CharField(required=False, allow_blank=True)
    author_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    genre_ids = serializers.PrimaryKeyRelatedField(queryset=Genre.objects.all(), many=True, required=False)
    column_id = serializers.PrimaryKeyRelatedField(queryset=Column.objects.all(), allow_null=True, required=False)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    preview_page_count = serializers.IntegerField(min_value=0, required=False)
    status = serializers.ChoiceField(choices=Story.Status.choices, required=False)

    def validate_price(self, value):
        return AdminStorySerializer.validate_price(self, value)
