"""Daily summary report for posting activity.

Queries ``post_logs`` for the current day and produces a structured report
covering success/failure counts per account, top failure reasons, and
intensity distribution.
"""

import json
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def generate_daily_summary(date: Optional[datetime] = None) -> Dict[str, Any]:
    """Build a summary dict for one day of posting activity.

    Args:
        date: the day to summarize (defaults to today UTC).

    Returns:
        A dict with keys ``date``, ``accounts``, ``totals``,
        ``intensity_distribution``, and ``top_failure_reasons``.
    """
    supabase = get_supabase_client()
    if supabase is None:
        logger.warning("Supabase not configured -- returning empty summary")
        return {"error": "Supabase not configured"}

    if date is None:
        date = datetime.now(timezone.utc)

    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)

    try:
        response = (
            supabase.table("post_logs")
            .select("account_id, template_id, post_type, status, error_message, created_at")
            .gte("created_at", day_start.isoformat())
            .lte("created_at", day_end.isoformat())
            .execute()
        )
        rows = response.data if hasattr(response, "data") and response.data else []
    except Exception as e:
        logger.error("Failed to fetch post_logs for summary: %s", e)
        return {"error": str(e)}

    # Fetch template intensities for rows
    template_ids = list({r["template_id"] for r in rows if r.get("template_id")})
    intensity_map: Dict[str, str] = {}
    if template_ids:
        try:
            tmpl_resp = (
                supabase.table("templates")
                .select("id, intensity")
                .in_("id", template_ids)
                .execute()
            )
            for t in (tmpl_resp.data or []):
                intensity_map[t["id"]] = t.get("intensity", "T0")
        except Exception:
            pass

    # Aggregate
    per_account: Dict[str, Dict[str, int]] = {}
    total_success = 0
    total_failed = 0
    intensity_counts: Counter = Counter()
    error_messages: List[str] = []

    for row in rows:
        acct = row.get("account_id", "unknown")
        status = row.get("status", "unknown")

        if acct not in per_account:
            per_account[acct] = {"attempted": 0, "success": 0, "failed": 0}
        per_account[acct]["attempted"] += 1

        if status == "success":
            per_account[acct]["success"] += 1
            total_success += 1
        else:
            per_account[acct]["failed"] += 1
            total_failed += 1
            err = row.get("error_message")
            if err:
                error_messages.append(err)

        tid = row.get("template_id", "")
        intensity = intensity_map.get(tid, "T0")
        intensity_counts[intensity] += 1

    # Top N failure reasons
    error_counter = Counter(error_messages)
    top_errors = error_counter.most_common(5)

    summary = {
        "date": day_start.strftime("%Y-%m-%d"),
        "totals": {
            "attempted": total_success + total_failed,
            "success": total_success,
            "failed": total_failed,
        },
        "accounts": per_account,
        "intensity_distribution": dict(intensity_counts),
        "top_failure_reasons": [
            {"reason": reason, "count": count} for reason, count in top_errors
        ],
    }
    return summary


def print_daily_summary(summary: Dict[str, Any]) -> None:
    """Pretty-print a daily summary to the terminal."""
    if "error" in summary:
        print(f"Error generating summary: {summary['error']}")
        return

    print(f"\n{'='*60}")
    print(f"  Daily Summary for {summary['date']}")
    print(f"{'='*60}")

    totals = summary["totals"]
    print(f"\n  Total Posts:  {totals['attempted']}")
    print(f"  Succeeded:   {totals['success']}")
    print(f"  Failed:      {totals['failed']}")

    print(f"\n  Intensity Distribution:")
    for tier, count in sorted(summary.get("intensity_distribution", {}).items()):
        print(f"    {tier}: {count}")

    accounts = summary.get("accounts", {})
    if accounts:
        print(f"\n  Per-Account Breakdown:")
        for acct_id, stats in sorted(accounts.items()):
            print(f"    {acct_id}: {stats['success']} ok / {stats['failed']} fail (of {stats['attempted']})")

    top_errors = summary.get("top_failure_reasons", [])
    if top_errors:
        print(f"\n  Top Failure Reasons:")
        for i, entry in enumerate(top_errors, 1):
            reason = entry["reason"][:80]
            print(f"    {i}. [{entry['count']}x] {reason}")

    print(f"\n{'='*60}\n")
