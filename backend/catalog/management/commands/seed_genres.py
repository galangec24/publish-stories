from django.core.management.base import BaseCommand

from catalog.models import Genre

DEFAULT_GENRES = [
    ("Romance", "#D81B60"),
    ("Drama", "#8E24AA"),
    ("Horror", "#424242"),
    ("Mystery & Thriller", "#3949AB"),
    ("Fantasy", "#00897B"),
    ("Science Fiction", "#1E88E5"),
    ("Comedy", "#F9A825"),
    ("Action & Adventure", "#E53935"),
    ("Historical", "#6D4C41"),
    ("Teen Fiction", "#FB8C00"),
    ("Philippine Folklore", "#43A047"),
    ("Poetry", "#5E35B1"),
    ("Non-fiction", "#546E7A"),
]


class Command(BaseCommand):
    help = "Create the starter genres on a brand-new site (skipped once any genre exists)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Add any missing starter genres even if genres exist")

    def handle(self, *args, **options):
        # Runs on every server start; genres an admin deleted must not come back.
        if Genre.objects.exists() and not options["force"]:
            self.stdout.write("Genres already set up; skipping starter genres.")
            return
        created = 0
        for order, (name, color) in enumerate(DEFAULT_GENRES):
            _, was_created = Genre.objects.get_or_create(name=name, defaults={"color": color, "sort_order": order})
            created += was_created
        self.stdout.write(self.style.SUCCESS(f"{created} genre(s) created, {len(DEFAULT_GENRES) - created} already existed."))
