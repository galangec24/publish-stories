"""Readers' own purchase history, and the admin's sales report."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek, TruncYear
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .access import purchases_for
from .models import Subscription

CHECKOUT_TIMEOUT = timedelta(hours=1)


def reader_status(purchase):
    """What the reader sees: success, waiting, or failed (with a short reason)."""
    if purchase.status == Subscription.Status.PAID:
        if purchase.provider == Subscription.Provider.MANUAL and not purchase.reviewed_at:
            return "success", "Unlocked. The author will check your receipt."
        return "success", "Payment confirmed."
    if purchase.status == Subscription.Status.REJECTED:
        return "failed", purchase.admin_note or "The payment couldn't be found, so access was removed."
    if purchase.status == Subscription.Status.PENDING:
        if purchase.provider == Subscription.Provider.PAYMONGO and timezone.now() - purchase.created_at > CHECKOUT_TIMEOUT:
            return "failed", "The online payment wasn't completed."
        return "pending", "Waiting for the payment to go through."
    return "failed", "The payment didn't go through."


class MyPurchasesView(APIView):
    """GET /api/my-purchases/ — this reader's payments (by account, or by this device for guests)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        purchases = purchases_for(request).select_related("story", "method").order_by("-created_at")[:100]
        results = []
        for p in purchases:
            state, message = reader_status(p)
            results.append(
                {
                    "id": p.id,
                    "story": {"title": p.story.title, "slug": p.story.slug},
                    "amount": str(p.amount),
                    "method": p.method.name if p.method_id else ("Online QR Ph" if p.provider == Subscription.Provider.PAYMONGO else "QR"),
                    "reference_number": p.reference_number,
                    "access_code": p.access_code if state == "success" else None,
                    "state": state,
                    "message": message,
                    "created_at": p.created_at.isoformat(),
                }
            )
        return Response({"results": results})


def money(value):
    """Pesos with two decimals, whatever the database returns."""
    return f"{Decimal(value or 0):.2f}"


PERIODS = {"day": TruncDay, "week": TruncWeek, "month": TruncMonth, "year": TruncYear}
DEFAULT_SPAN = {"day": 30, "week": 7 * 12, "month": 365, "year": 365 * 5}


def _date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


class SalesReportView(APIView):
    """GET /api/admin/sales/?period=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD&story=1,2

    Money from paid purchases (QR transfers and online checkout). Revoked payments are left
    out; QR payments not yet checked are counted but also shown separately.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        params = request.query_params
        period = params.get("period") if params.get("period") in PERIODS else "day"
        today = timezone.localdate()
        end = _date(params.get("to")) or today
        start = _date(params.get("from")) or end - timedelta(days=DEFAULT_SPAN[period] - 1)
        if start > end:
            start, end = end, start
        tz = timezone.get_current_timezone()
        window = (timezone.make_aware(datetime.combine(start, time.min), tz), timezone.make_aware(datetime.combine(end, time.max), tz))

        sales = Subscription.objects.filter(status=Subscription.Status.PAID, paid_at__range=window)
        story_ids = [int(x) for x in params.get("story", "").split(",") if x.strip().isdigit()]
        if story_ids:
            sales = sales.filter(story_id__in=story_ids)
        unchecked = Q(provider=Subscription.Provider.MANUAL, reviewed_at__isnull=True)

        def totals(queryset):
            row = queryset.aggregate(
                n=Count("id"),
                total=Sum("amount"),
                unchecked_total=Sum("amount", filter=unchecked),
                unchecked_n=Count("id", filter=unchecked),
            )
            return {
                "count": row["n"],
                "amount": money(row["total"]),
                "unchecked_count": row["unchecked_n"],
                "unchecked_amount": money(row["unchecked_total"]),
            }

        buckets = (
            sales.annotate(bucket=PERIODS[period]("paid_at", tzinfo=tz))
            .values("bucket")
            .annotate(n=Count("id"), total=Sum("amount"))
            .order_by("bucket")
        )
        by_story = (
            sales.values("story_id", "story__title")
            .annotate(n=Count("id"), total=Sum("amount"))
            .order_by("-total")
        )
        revoked = Subscription.objects.filter(status=Subscription.Status.REJECTED, paid_at__range=window)
        if story_ids:
            revoked = revoked.filter(story_id__in=story_ids)
        return Response(
            {
                "period": period,
                "from": start.isoformat(),
                "to": end.isoformat(),
                "totals": totals(sales),
                "revoked": {"count": revoked.count(), "amount": money(revoked.aggregate(a=Sum("amount"))["a"])},
                "series": [
                    {"start": timezone.localtime(b["bucket"]).date().isoformat(), "count": b["n"], "amount": money(b["total"])}
                    for b in buckets
                ],
                "by_story": [
                    {"id": s["story_id"], "title": s["story__title"], "count": s["n"], "amount": money(s["total"])}
                    for s in by_story
                ],
            }
        )
