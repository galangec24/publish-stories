from django.db import migrations

NEW = "/about/maria-gemima-valderrama-v2.webp"
# The old built-in photo, and the low-resolution transparent cut-out that was
# uploaded over it before the white-background portrait was ready.
REPLACED = [
    "/about/maria-gemima-valderrama.webp",
    "/api/media/images/e016db6d-b546-4446-904a-c582b8400b72.webp",
]


def forwards(apps, schema_editor):
    AboutProfile = apps.get_model("catalog", "AboutProfile")
    for profile in AboutProfile.objects.all():
        if any(profile.photo_url.endswith(old) for old in REPLACED):
            profile.photo_url = NEW
            profile.save(update_fields=["photo_url"])


class Migration(migrations.Migration):
    dependencies = [("catalog", "0006_column_url_story_comment_count_story_like_count_and_more")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
