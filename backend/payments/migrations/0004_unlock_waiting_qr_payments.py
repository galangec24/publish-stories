from django.db import migrations
from django.db.models import F


def forwards(apps, schema_editor):
    # QR payments now unlock right away and are checked afterwards; open up the ones still waiting.
    Subscription = apps.get_model("payments", "Subscription")
    Subscription.objects.filter(provider="manual", status="pending").update(status="paid", paid_at=F("created_at"))


class Migration(migrations.Migration):
    dependencies = [("payments", "0003_paymentmethod_qr_payload")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
