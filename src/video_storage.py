"""Upload videos to Supabase Storage or GCP Cloud Storage."""

import logging
import os
import time
from pathlib import Path
from typing import Optional

from src.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


def upload_video_to_gcs(
    bucket_name: str,
    video_path: str,
    account_id: str,
    template_id: str,
    object_prefix: str = "videos",
) -> Optional[str]:
    """
    Upload a video (or image) file to a GCS bucket.

    Args:
        bucket_name: GCS bucket name (e.g. babymilu-videos)
        video_path: Local path to the file
        account_id: Account ID for organizing objects
        template_id: Template ID for the filename
        object_prefix: Path prefix in the bucket (default: videos)

    Returns:
        Public URL (https://storage.googleapis.com/...) or None if upload failed.
        Bucket must be publicly readable for this URL to work.
    """
    if not os.path.exists(video_path):
        logger.error("Video file not found: %s", video_path)
        return None
    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        timestamp = int(time.time())
        ext = os.path.splitext(video_path)[1] or ".mp4"
        filename = f"{account_id}-{template_id}-{timestamp}{ext}"
        gcs_path = f"{object_prefix}/{account_id}/{filename}".replace("\\", "/")

        blob = bucket.blob(gcs_path)
        content_type = "video/mp4" if ext.lower() == ".mp4" else "image/jpeg"
        blob.upload_from_filename(video_path, content_type=content_type)
        public_url = f"https://storage.googleapis.com/{bucket_name}/{gcs_path}"
        logger.info("Uploaded to GCS: %s", public_url)
        return public_url
    except Exception as e:
        logger.error("Error uploading to GCS: %s", e, exc_info=True)
        return None


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


def upload_video(
    video_path: str,
    account_id: str,
    template_id: str,
    object_prefix: str = "videos",
) -> Optional[str]:
    """
    Upload a video or image to storage. If GCS_VIDEO_BUCKET or GCS_BUCKET_VIDEOS
    is set, uploads to that GCS bucket; otherwise uploads to Supabase Storage.
    """
    gcs_bucket = (
        os.environ.get("GCS_VIDEO_BUCKET") or os.environ.get("GCS_BUCKET_VIDEOS") or ""
    ).strip()
    if gcs_bucket:
        return upload_video_to_gcs(
            gcs_bucket, video_path, account_id, template_id, object_prefix
        )
    return upload_video_to_supabase(video_path, account_id, template_id)
