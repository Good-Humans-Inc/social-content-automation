"""Log posting results to Supabase database."""

import logging
from datetime import datetime, timezone
from typing import Optional

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def log_post(
    template_id: str,
    account_id: str,
    post_type: str,
    status: str,
    error_message: Optional[str] = None,
    scheduled_time: Optional[datetime] = None,
    render_path: Optional[str] = None,
    upload_asset_id: Optional[str] = None,
    resource_url: Optional[str] = None,
    video_url: Optional[str] = None,
    asset_combination_hash: Optional[str] = None,
) -> Optional[str]:
    """
    Log a posting attempt to Supabase.

    Args:
        template_id: Template ID used
        account_id: Account ID
        post_type: 'video' or 'slideshow'
        status: 'success' or 'failed'
        error_message: Error message if failed
        scheduled_time: Scheduled posting time
        render_path: Path to rendered file
        upload_asset_id: Upload asset ID
        resource_url: GeeLark resource URL
        video_url: Supabase Storage URL for video preview
        asset_combination_hash: Hash of the material combination for dedup

    Returns:
        Log entry ID if successful, None otherwise
    """
    supabase = get_supabase_client()
    if supabase is None:
        logger.warning("Supabase not configured, skipping database logging")
        return None

    try:
        log_entry = {
            "template_id": template_id,
            "account_id": account_id,
            "post_type": post_type,
            "status": status,
            "error_message": error_message,
            "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
            "render_path": render_path,
            "upload_asset_id": upload_asset_id,
            "resource_url": resource_url,
            "video_url": video_url,
            "asset_combination_hash": asset_combination_hash,
        }

        response = supabase.table("post_logs").insert(log_entry).execute()

        if hasattr(response, "data") and response.data:
            log_id = response.data[0]["id"] if isinstance(response.data, list) else response.data.get("id")
            logger.info(f"Logged post to database: {log_id}")
            return log_id
        else:
            logger.warning("No data returned from Supabase insert")
            return None

    except Exception as e:
        logger.error(f"Failed to log post to database: {e}", exc_info=True)
        return None
