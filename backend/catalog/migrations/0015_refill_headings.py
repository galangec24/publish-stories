from django.db import migrations


def refill(apps, schema_editor):
    # Bold one-line titles now count as sections too.
    from catalog.delta import headings

    Chapter = apps.get_model("catalog", "Chapter")
    for chapter in Chapter.objects.all().only("id", "content"):
        Chapter.objects.filter(pk=chapter.pk).update(headings=headings(chapter.content))


class Migration(migrations.Migration):
    dependencies = [("catalog", "0014_chapter_headings")]

    operations = [migrations.RunPython(refill, migrations.RunPython.noop)]
