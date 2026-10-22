import hashlib

from django.db import models


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Translation(models.Model):
    """Cache of machine translations. Each distinct string is paid for once per language."""

    source_hash = models.CharField(max_length=64)
    target = models.CharField(max_length=10)
    source_text = models.TextField()
    translated_text = models.TextField()
    provider = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source_hash", "target"], name="one_translation_per_language")]

    def __str__(self):
        return f"[{self.target}] {self.source_text[:40]}"
