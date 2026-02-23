"""Track daily posting quotas and intensity ratios per account.

Queries ``post_logs`` for today's successful posts and determines which
intensity tier should be used next based on the target ratio (default
50% T0 / 30% T1 / 20% T2).
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

DEFAULT_INTENSITY_RATIO: Dict[str, float] = {"T0": 0.5, "T1": 0.3, "T2": 0.2}


def get_today_post_counts(account_id: str) -> Dict[str, int]:
    """Return ``{intensity: count}`` for today's successful posts.

    Falls back to an empty dict if Supabase is unavailable.
    """
    supabase = get_supabase_client()
    if supabase is None:
        return {}

    try:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        response = (
            supabase.table("post_logs")
            .select("template_id, status")
            .eq("account_id", account_id)
            .eq("status", "success")
            .gte("created_at", today_start.isoformat())
            .execute()
        )

        rows = response.data if hasattr(response, "data") and response.data else []

        # We need to look up each template's intensity from the templates table.
        # Batch-fetch templates for these template IDs.
        template_ids = list({r["template_id"] for r in rows if r.get("template_id")})
        intensity_map: Dict[str, str] = {}
        if template_ids:
            tmpl_resp = (
                supabase.table("templates")
                .select("id, intensity")
                .in_("id", template_ids)
                .execute()
            )
            for t in (tmpl_resp.data or []):
                intensity_map[t["id"]] = t.get("intensity", "T0")

        counts: Dict[str, int] = {"T0": 0, "T1": 0, "T2": 0}
        for row in rows:
            tid = row.get("template_id", "")
            intensity = intensity_map.get(tid, "T0")
            counts[intensity] = counts.get(intensity, 0) + 1

        return counts
    except Exception as e:
        logger.warning("Failed to fetch today's post counts for %s: %s", account_id, e)
        return {}


def get_total_posts_today(account_id: str) -> int:
    """Return the total number of successful posts today for an account."""
    counts = get_today_post_counts(account_id)
    return sum(counts.values())


def has_daily_quota(account_id: str, daily_target: int) -> bool:
    """Check whether the account still has room under its daily post target."""
    return get_total_posts_today(account_id) < daily_target


def choose_next_intensity(
    account_id: str,
    daily_target: int = 2,
    intensity_ratio: Optional[Dict[str, float]] = None,
) -> Optional[str]:
    """Determine which intensity tier is most needed next.

    Compares actual counts against the target ratio and picks the tier
    with the largest deficit.  Returns ``None`` if the daily quota is
    already met.
    """
    ratio = intensity_ratio or DEFAULT_INTENSITY_RATIO
    total_today = get_total_posts_today(account_id)

    if total_today >= daily_target:
        return None

    counts = get_today_post_counts(account_id)

    # Compute the deficit for each tier
    deficits: List[Tuple[str, float]] = []
    for tier, target_frac in ratio.items():
        target_count = daily_target * target_frac
        actual = counts.get(tier, 0)
        deficit = target_count - actual
        deficits.append((tier, deficit))

    # Sort by largest deficit first; on tie, preserve T0 > T1 > T2 order
    deficits.sort(key=lambda x: -x[1])

    # Return the tier with the biggest positive deficit
    for tier, deficit in deficits:
        if deficit > 0:
            return tier

    # All tiers are at or over quota — just return the first one in ratio
    return list(ratio.keys())[0]


def remaining_quota_by_intensity(
    account_id: str,
    daily_target: int = 2,
    intensity_ratio: Optional[Dict[str, float]] = None,
) -> Dict[str, int]:
    """Return how many more posts of each intensity can still be made today."""
    ratio = intensity_ratio or DEFAULT_INTENSITY_RATIO
    counts = get_today_post_counts(account_id)

    remaining: Dict[str, int] = {}
    for tier, frac in ratio.items():
        target = max(1, round(daily_target * frac))
        actual = counts.get(tier, 0)
        remaining[tier] = max(0, target - actual)
    return remaining
