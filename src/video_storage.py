"""Upload videos to Supabase Storage for temporary storage and viewing."""

import logging
import os
import time
from pathlib import Path
from typing import Optional

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def upload_video_to_supabase(
    video_path: str, account_id: str, template_id: str
) -> Optional[str]:
    """
    Upload a video file to Supabase Storage.

    Args:
        video_path: Path to the video file to upload
        account_id: Account ID for organizing videos
        template_id: Template ID for organizing videos

    Returns:
        Public URL of the uploaded video, or None if upload failed
    """
    supabase = get_supabase_client()
    if supabase is None:
        logger.warning("Supabase not configured, skipping video upload to storage")
        return None

    if not os.path.exists(video_path):
        logger.error(f"Video file not found: {video_path}")
        return None

    try:
        # Generate unique filename
        timestamp = int(time.time())
        filename = f"{account_id}-{template_id}-{timestamp}.mp4"
        storage_path = f"videos/{account_id}/{filename}"

        # Read video file
        with open(video_path, "rb") as f:
            file_data = f.read()

        # Upload to Supabase Storage
        bucket_name = "videos"
        # Access storage bucket - Supabase Python client uses from_ (with underscore)
        # Use getattr to explicitly get the method to avoid any Python keyword issues
        if hasattr(supabase.storage, 'from_'):
            storage_bucket = getattr(supabase.storage, 'from_')(bucket_name)
        else:
            # Log available methods for debugging
            available_methods = [m for m in dir(supabase.storage) if not m.startswith('_')]
            logger.error(f"Storage client does not have 'from_' method. Available methods: {available_methods}")
            raise AttributeError(f"Storage client has no 'from_' method. Available: {available_methods}")
        response = storage_bucket.upload(
            storage_path,
            file_data,
            file_options={"content-type": "video/mp4", "upsert": "false"},
        )

        if hasattr(response, "error") and response.error:
            logger.error(f"Failed to upload video to Supabase: {response.error}")
            return None

        # Get public URL
        url_response = storage_bucket.get_public_url(storage_path)
        # Supabase Python client returns the URL directly as a string
        if isinstance(url_response, dict):
            video_url = url_response.get("publicUrl") or url_response.get("data", {}).get("publicUrl")
        else:
            video_url = str(url_response)
        
        if not video_url:
            logger.error("Failed to get public URL from Supabase")
            return None

        logger.info(f"Video uploaded to Supabase Storage: {video_url}")
        return video_url

    except Exception as e:
        logger.error(f"Error uploading video to Supabase Storage: {e}", exc_info=True)
        return None
