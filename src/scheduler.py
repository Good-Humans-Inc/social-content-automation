"""Posting schedule management with time windows."""

import random
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def get_scheduled_time(account_id: str, default_minutes: int = 120) -> int:
    """
    Get scheduled posting time for an account, respecting time windows.

    Args:
        account_id: Account ID
        default_minutes: Default minutes from now if no schedule configured

    Returns:
        Unix timestamp for scheduled time
    """
    supabase = get_supabase_client()

    if supabase is None:
        # Fallback to default
        return int(datetime.now(timezone.utc).timestamp()) + (default_minutes * 60)

    try:
        # Get posting schedule for account
        response = supabase.table("posting_schedules").select("*").eq("account_id", account_id).execute()

        if hasattr(response, "data") and response.data:
            schedule = response.data[0]
            time_windows = schedule.get("time_windows", [])

            if time_windows:
                # Pick a random time window
                window = random.choice(time_windows)
                scheduled_time = _get_random_time_in_window(window, default_minutes)
                return int(scheduled_time.timestamp())
    except Exception as e:
        logger.warning(f"Failed to get schedule for account {account_id}: {e}")

    # Fallback to default
    return int(datetime.now(timezone.utc).timestamp()) + (default_minutes * 60)


def _get_random_time_in_window(window: dict, min_minutes: int = 120) -> datetime:
    """
    Get a random time within a time window.

    Args:
        window: Dict with 'start' and 'end' in "HH:MM" format (Eastern Time)
        min_minutes: Minimum minutes from now

    Returns:
        Datetime in UTC
    """
    now_et = datetime.now(timezone(timedelta(hours=-5)))  # EST/EDT approximation
    today = now_et.date()

    # Parse time window
    start_str = window.get("start", "11:00")
    end_str = window.get("end", "13:00")

    start_hour, start_min = map(int, start_str.split(":"))
    end_hour, end_min = map(int, end_str.split(":"))

    start_time = datetime.combine(today, datetime.min.time().replace(hour=start_hour, minute=start_min))
    end_time = datetime.combine(today, datetime.min.time().replace(hour=end_hour, minute=end_min))

    # If end time is before start time, assume it's next day
    if end_time <= start_time:
        end_time += timedelta(days=1)

    # If start time is in the past, move to next day
    if start_time < now_et:
        start_time += timedelta(days=1)
        end_time += timedelta(days=1)

    # Pick random time in window
    time_range = (end_time - start_time).total_seconds()
    random_offset = random.uniform(0, time_range)
    scheduled_et = start_time + timedelta(seconds=random_offset)

    # Ensure minimum delay
    min_time = now_et + timedelta(minutes=min_minutes)
    if scheduled_et < min_time:
        scheduled_et = min_time

    # Convert to UTC (EST is UTC-5, EDT is UTC-4, approximate with -5)
    scheduled_utc = scheduled_et.astimezone(timezone.utc)

    return scheduled_utc
