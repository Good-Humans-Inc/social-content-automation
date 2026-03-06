"""Worker that polls the job queue and processes video generation jobs."""

import logging
import os
import random
import shutil
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

from src.supabase_client import ensure_supabase_client
from src.templates import Template, TemplateLibrary
from src.video_storage import upload_video
from src.text_overlay import OverlayOptions

logger = logging.getLogger(__name__)

_EFFECT_PRESETS: Dict[str, Dict[str, Any]] = {
    "cinematic": {
        "ken_burns": True,
        "ken_burns_direction": random.choice(["in", "out"]),
        "film_grain": True,
        "vignette": True,
    },
    "energetic": {
        "shake": True,
        "shake_intensity": 6,
        "mirror": True,
        "contrast": 1.3,
        "saturation": 1.2,
    },
}


def _resolve_diversification(effect_preset: str) -> Optional[Dict[str, Any]]:
    """Convert an effect_preset name into a diversification dict."""
    if effect_preset == "none" or not effect_preset:
        return None
    if effect_preset == "random":
        return {
            "ken_burns": random.random() > 0.5,
            "ken_burns_direction": random.choice(["in", "out"]),
            "film_grain": random.random() > 0.5,
            "vignette": random.random() > 0.6,
            "shake": random.random() > 0.7,
            "shake_intensity": random.randint(3, 8),
            "mirror": random.random() > 0.7,
            "brightness": round(random.uniform(-0.1, 0.1), 2),
            "contrast": round(random.uniform(0.9, 1.3), 2),
            "saturation": round(random.uniform(0.8, 1.3), 2),
            "zoom": round(random.uniform(1.0, 1.15), 2),
        }
    return _EFFECT_PRESETS.get(effect_preset)


def add_job_log(job_id: str, level: str, message: str) -> None:
    """Add a log entry to a job."""
    supabase = ensure_supabase_client()
    if not supabase:
        logger.warning("Supabase not configured, skipping job log")
        return

    try:
        # Get current logs
        response = supabase.table("video_jobs").select("logs").eq("id", job_id).single().execute()
        current_logs = response.data.get("logs", []) if hasattr(response, "data") else []
        
        # Append new log
        new_log = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "level": level,
            "message": message,
        }
        current_logs.append(new_log)

        # Update job
        supabase.table("video_jobs").update({"logs": current_logs}).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"Failed to add job log: {e}", exc_info=True)


def update_job_status(job_id: str, status: str, progress: Optional[int] = None, error_message: Optional[str] = None) -> None:
    """Update job status and progress."""
    supabase = ensure_supabase_client()
    if not supabase:
        logger.warning("Supabase not configured, skipping job status update")
        return

    try:
        updates: Dict[str, Any] = {"status": status}
        
        if progress is not None:
            updates["progress"] = progress
        
        if error_message:
            updates["error_message"] = error_message
        
        if status == "processing":
            updates["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        elif status in ("completed", "failed", "cancelled"):
            updates["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        supabase.table("video_jobs").update(updates).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"Failed to update job status: {e}", exc_info=True)


def fetch_pending_job() -> Optional[Dict[str, Any]]:
    """Fetch the next pending job from the queue."""
    supabase = ensure_supabase_client()
    if not supabase:
        return None

    try:
        response = supabase.table("video_jobs").select("*").eq("status", "pending").order("created_at", desc=False).limit(1).execute()
        
        if hasattr(response, "data") and response.data:
            return response.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to fetch pending job: {e}", exc_info=True)
        return None


def claim_job(job_id: str) -> bool:
    """Claim a job by updating its status to processing."""
    supabase = ensure_supabase_client()
    if not supabase:
        return False

    try:
        # Use a transaction-like approach: update only if status is still pending
        response = supabase.table("video_jobs").update({
            "status": "processing",
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).eq("id", job_id).eq("status", "pending").execute()
        
        # Check if update was successful
        if hasattr(response, "data") and response.data:
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to claim job: {e}", exc_info=True)
        return False


# GCS bucket names for assets (env overrides: GCS_BUCKET_IMAGES, GCS_BUCKET_MUSIC, GCS_BUCKET_VIDEOS)
_GCS_BUCKET_IMAGES = os.environ.get("GCS_BUCKET_IMAGES", "babymilu-images")
_GCS_BUCKET_MUSIC = os.environ.get("GCS_BUCKET_MUSIC", "babymilu-musics")
_GCS_BUCKET_VIDEOS = os.environ.get("GCS_BUCKET_VIDEOS", "babymilu-videos")


def _gcs_bucket_for_storage_path(storage_path: str) -> Optional[str]:
    """Return GCS bucket name for a given storage_path prefix, or None."""
    if not storage_path:
        return _GCS_BUCKET_IMAGES
    if storage_path.startswith("music/"):
        return _GCS_BUCKET_MUSIC
    if storage_path.startswith("videos/"):
        return _GCS_BUCKET_VIDEOS
    if storage_path.startswith("assets/") or storage_path.startswith("images/"):
        return _GCS_BUCKET_IMAGES
    return _GCS_BUCKET_IMAGES


def _is_valid_media(path: str) -> bool:
    """Quick-check that a downloaded file looks like a real image or audio (not empty or HTML error)."""
    try:
        size = os.path.getsize(path)
        if size < 100:
            return False
        with open(path, "rb") as f:
            header = f.read(16)
        if header[:3] == b'\xff\xd8\xff':          # JPEG
            return True
        if header[:8] == b'\x89PNG\r\n\x1a\n':     # PNG
            return True
        if header[:4] == b'RIFF' and header[8:12] == b'WEBP':  # WebP
            return True
        if header[:4] == b'GIF8':                   # GIF
            return True
        if header[:3] == b'ID3' or header[:2] == b'\xff\xfb':  # MP3
            return True
        if header[:4] == b'fLaC':                   # FLAC
            return True
        if header[4:8] == b'ftyp':                  # MP4/M4A
            return True
        if header[:4] == b'OggS':                   # OGG
            return True
        return False
    except Exception:
        return False


def download_asset(asset_id: str, output_path: str) -> bool:
    """Download an asset from local path, GCS (babymilu-* buckets), or Supabase Storage."""
    supabase = ensure_supabase_client()
    if not supabase:
        return False

    try:
        # Get asset info
        response = supabase.table("assets").select("storage_path, url").eq("id", asset_id).single().execute()
        if not hasattr(response, "data") or not response.data:
            return False

        asset_data = response.data
        storage_path = asset_data.get("storage_path")
        url = asset_data.get("url")

        # If LOCAL_ASSETS_DIR is set, try to use the file from local disk first
        local_base = os.environ.get("LOCAL_ASSETS_DIR")
        if local_base and storage_path:
            local_base = os.path.abspath(local_base)
            # Build path under base; prevent path traversal
            candidate = os.path.normpath(os.path.join(local_base, storage_path))
            if os.path.abspath(candidate).startswith(local_base) and os.path.isfile(candidate):
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(candidate, output_path)
                logger.debug("Used local asset: %s -> %s", candidate, output_path)
                return True

        # Try GCS first (babymilu-images, babymilu-musics, babymilu-videos)
        if storage_path:
            gcs_bucket = _gcs_bucket_for_storage_path(storage_path)
            gcs_path = storage_path.replace("\\", "/")
            # 1) Authenticated download (job's service account on Cloud Run; works with private buckets)
            try:
                from google.cloud import storage
                client = storage.Client()
                bucket = client.bucket(gcs_bucket)
                blob = bucket.blob(gcs_path)
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                blob.download_to_filename(output_path)
                if _is_valid_media(output_path):
                    logger.info("Downloaded asset from GCS (auth): gs://%s/%s", gcs_bucket, gcs_path)
                    return True
                logger.warning("GCS auth download for gs://%s/%s produced invalid image, trying next source", gcs_bucket, gcs_path)
            except Exception as e:
                logger.debug("GCS authenticated download failed for gs://%s/%s: %s", gcs_bucket, gcs_path, e)
            # 2) Public URL (for public buckets)
            gcs_url = f"https://storage.googleapis.com/{gcs_bucket}/{gcs_path}"
            try:
                import requests
                resp = requests.get(gcs_url, timeout=30)
                if resp.status_code == 200:
                    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(resp.content)
                    if _is_valid_media(output_path):
                        logger.debug("Downloaded asset from GCS (public): %s", gcs_url)
                        return True
                    logger.warning("GCS public download for %s produced invalid image", gcs_url)
            except Exception as e:
                logger.debug("GCS public URL failed for %s: %s", gcs_url, e)

        # If url is already a GCS (or any) URL, try it before Supabase
        if url and "storage.googleapis.com" in (url or ""):
            try:
                import requests
                resp = requests.get(url, timeout=30)
                if resp.status_code == 200:
                    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(resp.content)
                    if _is_valid_media(output_path):
                        return True
                    logger.warning("URL download for %s produced invalid image", url)
            except Exception as e:
                logger.debug("URL download failed for %s: %s", url, e)

        # Try to download from Supabase storage_path
        if storage_path:
            try:
                # Determine bucket from storage_path or try multiple buckets
                # Check if path indicates a specific bucket (e.g., 'music/filename' or 'videos/...')
                bucket_name = None
                path_in_bucket = storage_path
                
                if storage_path.startswith('music/'):
                    bucket_name = 'music'
                    path_in_bucket = storage_path.replace('music/', '', 1)
                elif storage_path.startswith('videos/'):
                    bucket_name = 'videos'
                    path_in_bucket = storage_path.replace('videos/', '', 1)
                elif storage_path.startswith('assets/'):
                    bucket_name = 'assets'
                    path_in_bucket = storage_path.replace('assets/', '', 1)
                
                # Try specific bucket first; if no prefix, prefer "assets" (common layout: assets bucket > jjk > character > files)
                buckets_to_try = []
                if bucket_name:
                    buckets_to_try = [bucket_name]
                else:
                    buckets_to_try = ["assets", "images", "music"]
                buckets_to_try = list(dict.fromkeys(buckets_to_try))

                for bucket in buckets_to_try:
                    try:
                        # Access storage bucket - Supabase Python client uses from_ (with underscore)
                        if hasattr(supabase.storage, 'from_'):
                            storage_bucket = getattr(supabase.storage, 'from_')(bucket)
                        else:
                            raise AttributeError("Storage client has no 'from_' method")

                        # Use path_in_bucket for the bucket that matches the prefix, else full storage_path
                        download_path = path_in_bucket if bucket == bucket_name else storage_path
                        file_data = storage_bucket.download(download_path)
                        if file_data:
                            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                            with open(output_path, "wb") as f:
                                if isinstance(file_data, bytes):
                                    f.write(file_data)
                                else:
                                    f.write(file_data.encode() if isinstance(file_data, str) else bytes(file_data))
                            if _is_valid_media(output_path):
                                return True
                            logger.warning("Supabase download for asset %s bucket=%s produced invalid image", asset_id, bucket)
                    except Exception as e:
                        logger.debug(
                            "Storage download failed for asset %s bucket=%s path=%s: %s",
                            asset_id, bucket, download_path, e,
                        )
                        continue
            except Exception:
                pass

        # Fallback: download from URL if available
        if url:
            import requests
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(resp.content)
                if _is_valid_media(output_path):
                    return True
                logger.warning("Fallback URL download for asset %s produced invalid image (%s)", asset_id, url)

        logger.warning(
            "Asset %s could not be downloaded from storage (path=%s). "
            "If Supabase shows 'EXCEEDING USAGE LIMITS', resolve that in the dashboard first.",
            asset_id, storage_path or "(none)",
        )
        return False
    except Exception as e:
        logger.error(f"Failed to download asset {asset_id}: {e}", exc_info=True)
        return False


def download_music_from_url(music_url: str, output_path: str) -> Optional[str]:
    """
    Download music/audio file from a URL (e.g., from music API like Pixabay).
    
    Args:
        music_url: URL to the music/audio file
        output_path: Local path to save the downloaded file
        
    Returns:
        Path to downloaded file if successful, None otherwise
    """
    if not music_url:
        return None
    
    try:
        import requests
        logger.info(f"Downloading music from URL: {music_url}")
        
        # Download the file
        resp = requests.get(music_url, timeout=60, stream=True)
        resp.raise_for_status()
        
        # Ensure output directory exists
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        with open(output_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info(f"Successfully downloaded music to: {output_path}")
        return output_path
    except Exception as e:
        logger.error(f"Failed to download music from URL {music_url}: {e}", exc_info=True)
        return None


def process_job(job: Dict[str, Any], output_dir: str = "./output") -> None:
    """Process a video generation job."""
    job_id = job["id"]
    template_id = job["template_id"]
    account_id = job["account_id"]
    post_type = job["post_type"]
    
    add_job_log(job_id, "info", f"Starting job processing: {post_type}")

    try:
        # Load template from database
        supabase = ensure_supabase_client()
        template_response = supabase.table("templates").select("*").eq("id", template_id).single().execute()
        
        if not hasattr(template_response, "data") or not template_response.data:
            raise ValueError(f"Template {template_id} not found")

        template_data = template_response.data
        template = Template.from_dict({
            "id": template_data["id"],
            "persona": template_data["persona"],
            "fandom": template_data["fandom"],
            "intensity": template_data.get("intensity", "T0"),
            "overlay": template_data.get("overlay", []),
            "caption": template_data.get("caption", ""),
            "tags": template_data.get("tags", []),
            "used": template_data.get("used"),
            "carousel_type": template_data.get("carousel_type"),
            "grid_images": template_data.get("grid_images"),
        })

        add_job_log(job_id, "info", f"Loaded template: {template_id}")

        # Load account
        account_response = supabase.table("accounts").select("*").eq("id", account_id).single().execute()
        if not hasattr(account_response, "data") or not account_response.data:
            raise ValueError(f"Account {account_id} not found")

        account = account_response.data
        add_job_log(job_id, "info", f"Loaded account: {account_id}")

        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        update_job_status(job_id, "processing", progress=10)

        # Process based on post type
        if post_type == "carousel":
            _process_carousel_job(job, template, account, output_dir, job_id)
        elif post_type == "slideshow":
            _process_slideshow_job(job, template, account, output_dir, job_id)
        else:  # video
            _process_video_job(job, template, account, output_dir, job_id)

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        add_job_log(job_id, "error", f"Job failed: {str(e)}")
        update_job_status(job_id, "failed", error_message=str(e))


def _process_video_job(job: Dict[str, Any], template: Template, account: Dict[str, Any], output_dir: str, job_id: str) -> None:
    """Process a video generation job."""
    from src.video_overlay import create_video_from_images, overlay_text_on_video
    from src.config import load_config

    # Extract IDs for use in upload function
    account_id = job.get("account_id") or account.get("id")
    template_id = job.get("template_id") or template.id

    add_job_log(job_id, "info", "Processing video job")
    update_job_status(job_id, "processing", progress=20)

    # Load config for overlay options (always white fill + black outline for text)
    try:
        cfg = load_config()
        overlay_opts = OverlayOptions(
            font_path=cfg.overlay.font_path,
            font_size=cfg.overlay.font_size,
            color="#ffffff",
            stroke_color="#000000",
            stroke_width=cfg.overlay.stroke_width,
            position=cfg.overlay.position,
            padding=cfg.overlay.padding,
            wrap_width_chars=cfg.overlay.wrap_width_chars,
        )
    except Exception:
        # Use defaults if config not available (FONT_PATH env used in Cloud Run / Docker)
        overlay_opts = OverlayOptions(
            font_path=os.getenv("FONT_PATH", "./fonts/AutourOne-Regular.ttf"),
            font_size=60,
            color="#ffffff",
            stroke_color="#000000",
            stroke_width=12,
            position="bottom",
            padding=600,
            wrap_width_chars=18,
        )

    image_asset_ids = job.get("image_asset_ids", [])
    video_source = job.get("video_source") or account.get("video_source")
    music_url = job.get("music_url")
    music_asset_id = job.get("music_asset_id")

    effect_preset = job.get("effect_preset", "none") or "none"
    diversification = _resolve_diversification(effect_preset)
    if diversification:
        add_job_log(job_id, "info", f"Effect preset: {effect_preset}")

    output_video = os.path.join(output_dir, f"{job_id}.mp4")
    overlay_text = "\n".join(template.overlay) if template.overlay else ""

    # Handle music/audio
    audio_path = None
    temp_dir = os.path.join(output_dir, f"temp_{job_id}")
    os.makedirs(temp_dir, exist_ok=True)
    
    if music_url:
        # Download music from external URL (e.g., Pixabay API)
        add_job_log(job_id, "info", f"Downloading music from URL: {music_url}")
        audio_path = os.path.join(temp_dir, "music.mp3")
        downloaded_path = download_music_from_url(music_url, audio_path)
        if downloaded_path:
            audio_path = downloaded_path
            add_job_log(job_id, "info", "Music downloaded successfully")
        else:
            add_job_log(job_id, "warning", "Failed to download music, continuing without audio")
            audio_path = None
    elif music_asset_id:
        # Download music from Supabase Storage asset
        add_job_log(job_id, "info", f"Downloading music asset: {music_asset_id}")
        audio_path = os.path.join(temp_dir, "music.mp3")
        if download_asset(music_asset_id, audio_path):
            add_job_log(job_id, "info", "Music asset downloaded successfully")
        else:
            add_job_log(job_id, "warning", "Failed to download music asset, continuing without audio")
            audio_path = None

    if image_asset_ids:
        # Create video from images
        add_job_log(job_id, "info", f"Downloading {len(image_asset_ids)} images")
        update_job_status(job_id, "processing", progress=30)

        image_paths = []
        skipped = 0
        for idx, asset_id in enumerate(image_asset_ids):
            image_path = os.path.join(temp_dir, f"image_{idx}.jpg")
            if download_asset(asset_id, image_path):
                image_paths.append(image_path)
            else:
                skipped += 1
                add_job_log(job_id, "warning", f"Skipping image {idx+1}/{len(image_asset_ids)} (asset {asset_id}): download failed or corrupt")
        if not image_paths:
            raise ValueError(f"All {len(image_asset_ids)} image downloads failed")
        if skipped:
            add_job_log(job_id, "warning", f"Skipped {skipped}/{len(image_asset_ids)} images, continuing with {len(image_paths)}")

        add_job_log(job_id, "info", f"Creating video from {len(image_paths)} images")
        add_job_log(job_id, "info", f"Rendering slides 1–{len(image_paths)} (each slide may take 10–30 s)...")
        update_job_status(job_id, "processing", progress=50)

        image_duration = job.get("image_duration", 3.0)
        rapid_mode = job.get("rapid_mode", False)

        def _video_progress(slides_done: int, total_slides: int) -> None:
            if total_slides <= 0:
                return
            # slides_done==0 means "starting slide phase" -> move to 51% immediately so UI doesn't look stuck
            if slides_done == 0:
                update_job_status(job_id, "processing", progress=51)
                return
            # Ramp progress from 51% to 79% as slides complete
            p = 50 + int(29 * slides_done / total_slides)
            if p == 50:
                p = 51
            update_job_status(job_id, "processing", progress=min(p, 79))
            if slides_done == 1 or slides_done == total_slides or slides_done % 5 == 0:
                add_job_log(job_id, "info", f"Rendering slide {slides_done}/{total_slides}")

        create_video_from_images(
            image_paths=image_paths,
            output_path=output_video,
            text=overlay_text,
            opts=overlay_opts,
            image_duration=image_duration,
            rapid_mode=rapid_mode,
            audio_path=audio_path,
            progress_callback=_video_progress,
            diversification=diversification,
        )
    elif video_source:
        # Overlay text on base video
        add_job_log(job_id, "info", f"Using base video: {video_source}")
        update_job_status(job_id, "processing", progress=40)

        if not os.path.exists(video_source):
            raise FileNotFoundError(f"Base video not found: {video_source}")

        overlay_text_on_video(
            video_path=video_source,
            text=overlay_text,
            output_path=output_video,
            opts=overlay_opts,
            audio_path=audio_path,
        )
    else:
        raise ValueError("No images or video source provided")

    add_job_log(job_id, "info", f"Video generated: {output_video}")
    update_job_status(job_id, "processing", progress=80)

    # Clean up temporary audio file if downloaded
    if audio_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
            add_job_log(job_id, "info", "Cleaned up temporary music file")
        except Exception as e:
            logger.warning(f"Failed to clean up audio file {audio_path}: {e}")

    # Upload to Supabase Storage
    add_job_log(job_id, "info", "Uploading video to storage")
    video_url = upload_video(output_video, account_id, template_id)

    if not video_url:
        raise ValueError("Failed to upload video to storage")

    add_job_log(job_id, "info", f"Video uploaded: {video_url}")
    update_job_status(job_id, "processing", progress=90)

    # Update job with video URL
    supabase = ensure_supabase_client()
    if supabase:
        supabase.table("video_jobs").update({
            "video_url": video_url,
            "render_path": output_video,
        }).eq("id", job_id).execute()

    update_job_status(job_id, "completed", progress=100)
    add_job_log(job_id, "info", "Job completed successfully")


def _process_slideshow_job(job: Dict[str, Any], template: Template, account: Dict[str, Any], output_dir: str, job_id: str) -> None:
    """Process a slideshow generation job."""
    from src.slideshow_renderer import render_slideshow
    from src.config import load_config

    account_id = job.get("account_id") or account.get("id")
    template_id = job.get("template_id") or template.id

    add_job_log(job_id, "info", "Processing slideshow job")
    update_job_status(job_id, "processing", progress=20)

    try:
        cfg = load_config()
        overlay_opts = OverlayOptions(
            font_path=cfg.overlay.font_path,
            font_size=cfg.overlay.font_size,
            color="#ffffff",
            stroke_color="#000000",
            stroke_width=cfg.overlay.stroke_width,
            position=cfg.overlay.position,
            padding=cfg.overlay.padding,
            wrap_width_chars=cfg.overlay.wrap_width_chars,
        )
    except Exception:
        overlay_opts = OverlayOptions(
            font_path=os.getenv("FONT_PATH", "./fonts/AutourOne-Regular.ttf"),
            font_size=60, color="#ffffff", stroke_color="#000000",
            stroke_width=12, position="bottom", padding=600, wrap_width_chars=18,
        )

    image_asset_ids = job.get("image_asset_ids", [])
    music_url_str = job.get("music_url")
    music_asset_id = job.get("music_asset_id")
    output_as_slides = job.get("output_as_slides", False)

    if not image_asset_ids:
        raise ValueError("No image assets provided for slideshow")

    temp_dir = os.path.join(output_dir, f"temp_{job_id}")
    os.makedirs(temp_dir, exist_ok=True)

    # Download images (skip corrupt/failed ones)
    add_job_log(job_id, "info", f"Downloading {len(image_asset_ids)} images")
    update_job_status(job_id, "processing", progress=30)
    image_paths = []
    skipped_ss = 0
    for idx, asset_id in enumerate(image_asset_ids):
        image_path = os.path.join(temp_dir, f"image_{idx}.jpg")
        if download_asset(asset_id, image_path):
            image_paths.append(image_path)
        else:
            skipped_ss += 1
            add_job_log(job_id, "warning", f"Skipping image {idx+1}/{len(image_asset_ids)} (asset {asset_id}): download failed or corrupt")
    if not image_paths:
        raise ValueError(f"All {len(image_asset_ids)} image downloads failed")
    if skipped_ss:
        add_job_log(job_id, "warning", f"Skipped {skipped_ss}/{len(image_asset_ids)} images, continuing with {len(image_paths)}")

    # Handle music
    audio_path = None
    if music_url_str:
        add_job_log(job_id, "info", f"Downloading music from URL: {music_url_str}")
        audio_path = os.path.join(temp_dir, "music.mp3")
        downloaded = download_music_from_url(music_url_str, audio_path)
        if not downloaded:
            add_job_log(job_id, "warning", "Failed to download music, continuing without audio")
            audio_path = None
    elif music_asset_id:
        add_job_log(job_id, "info", f"Downloading music asset: {music_asset_id}")
        audio_path = os.path.join(temp_dir, "music.mp3")
        if not download_asset(music_asset_id, audio_path):
            add_job_log(job_id, "warning", "Failed to download music asset, continuing without audio")
            audio_path = None

    overlay_texts = template.overlay if template.overlay else [""] * len(image_paths)
    if len(overlay_texts) < len(image_paths):
        overlay_texts.extend([""] * (len(image_paths) - len(overlay_texts)))
    elif len(overlay_texts) > len(image_paths):
        overlay_texts = overlay_texts[:len(image_paths)]

    add_job_log(job_id, "info", f"Rendering slideshow from {len(image_paths)} images")
    update_job_status(job_id, "processing", progress=50)

    output_video = os.path.join(output_dir, f"{job_id}.mp4")
    render_slideshow(
        image_paths=image_paths,
        overlay_texts=overlay_texts,
        output_path=output_video,
        opts=overlay_opts,
        slide_duration=job.get("image_duration", 3.0),
        audio_path=audio_path,
    )

    add_job_log(job_id, "info", f"Slideshow generated: {output_video}")
    update_job_status(job_id, "processing", progress=80)

    if audio_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception:
            pass

    # Upload to Supabase Storage
    add_job_log(job_id, "info", "Uploading slideshow to storage")
    video_url = upload_video(output_video, account_id, template_id)
    if not video_url:
        raise ValueError("Failed to upload slideshow to storage")

    add_job_log(job_id, "info", f"Slideshow uploaded: {video_url}")
    update_job_status(job_id, "processing", progress=90)

    # If output_as_slides, also export individual slide images for GeeLark carousel upload
    slide_image_urls = []
    if output_as_slides:
        add_job_log(job_id, "info", "Exporting individual slide images for carousel publishing")
        for idx, img_path in enumerate(image_paths):
            slide_url = upload_video(img_path, account_id, f"{template_id}_slide_{idx}")
            if slide_url:
                slide_image_urls.append(slide_url)

    supabase = ensure_supabase_client()
    if supabase:
        updates: Dict[str, Any] = {"video_url": video_url, "render_path": output_video}
        if slide_image_urls:
            updates["slide_urls"] = slide_image_urls
        supabase.table("video_jobs").update(updates).eq("id", job_id).execute()

    update_job_status(job_id, "completed", progress=100)
    add_job_log(job_id, "info", "Slideshow job completed successfully")


def _process_carousel_job(job: Dict[str, Any], template: Template, account: Dict[str, Any], output_dir: str, job_id: str) -> None:
    """Process a carousel generation job."""
    from src.slideshow_renderer import render_carousel
    from src.config import load_config

    account_id = job.get("account_id") or account.get("id")
    template_id = job.get("template_id") or template.id

    add_job_log(job_id, "info", "Processing carousel job")
    update_job_status(job_id, "processing", progress=20)

    try:
        cfg = load_config()
        overlay_opts = OverlayOptions(
            font_path=cfg.overlay.font_path,
            font_size=cfg.overlay.font_size,
            color="#ffffff",
            stroke_color="#000000",
            stroke_width=cfg.overlay.stroke_width,
            position=cfg.overlay.position,
            padding=cfg.overlay.padding,
            wrap_width_chars=cfg.overlay.wrap_width_chars,
        )
    except Exception:
        overlay_opts = OverlayOptions(
            font_path=os.getenv("FONT_PATH", "./fonts/AutourOne-Regular.ttf"),
            font_size=60, color="#ffffff", stroke_color="#000000",
            stroke_width=12, position="center", padding=600, wrap_width_chars=18,
        )

    image_asset_ids = job.get("image_asset_ids", [])
    music_url_str = job.get("music_url")
    music_asset_id = job.get("music_asset_id")
    character_name = job.get("character_name") or template.fandom.lower().replace(" ", "_")
    carousel_id = job.get("carousel_id") or f"carousel_{account_id}_{template_id}"

    if not image_asset_ids:
        raise ValueError("No image assets provided for carousel")

    temp_dir = os.path.join(output_dir, f"temp_{job_id}")
    os.makedirs(temp_dir, exist_ok=True)

    # Download images (skip corrupt/failed ones)
    add_job_log(job_id, "info", f"Downloading {len(image_asset_ids)} images")
    update_job_status(job_id, "processing", progress=30)
    image_paths = []
    skipped_car = 0
    for idx, asset_id in enumerate(image_asset_ids):
        image_path = os.path.join(temp_dir, f"image_{idx}.jpg")
        if download_asset(asset_id, image_path):
            image_paths.append(image_path)
        else:
            skipped_car += 1
            add_job_log(job_id, "warning", f"Skipping image {idx+1}/{len(image_asset_ids)} (asset {asset_id}): download failed or corrupt")
    if not image_paths:
        raise ValueError(f"All {len(image_asset_ids)} image downloads failed")
    if skipped_car:
        add_job_log(job_id, "warning", f"Skipped {skipped_car}/{len(image_asset_ids)} images, continuing with {len(image_paths)}")

    if grid_mode and len(image_paths) % 4 != 0:
        raise ValueError(
            f"Carousel grid layout requires a multiple of 4 images (4, 8, 12, ...). Got {len(image_paths)}."
        )

    # Handle music
    audio_path = None
    if music_url_str:
        audio_path = os.path.join(temp_dir, "music.mp3")
        downloaded = download_music_from_url(music_url_str, audio_path)
        if not downloaded:
            audio_path = None
    elif music_asset_id:
        audio_path = os.path.join(temp_dir, "music.mp3")
        if not download_asset(music_asset_id, audio_path):
            audio_path = None

    # Grid mode: 4 images per slide (2x2). Set by template or job-level carousel_layout.
    job_layout = (job.get("carousel_layout") or "").strip().lower()
    if job_layout == "grid":
        grid_mode = True
    elif job_layout == "single":
        grid_mode = False
    else:
        grid_mode = template.carousel_type == "character_grid" or template.grid_images == 4

    if grid_mode:
        first_slide_texts = [f"Your {character_name} character"]
    else:
        first_slide_texts = ["Your month", f"Your {character_name} character"]

    overlay_texts = template.overlay if (template.overlay and not grid_mode) else []

    add_job_log(job_id, "info", f"Rendering carousel (grid_mode={grid_mode}) from {len(image_paths)} images")
    update_job_status(job_id, "processing", progress=50)

    slide_files = render_carousel(
        first_slide_texts=first_slide_texts,
        image_paths=image_paths,
        overlay_texts=overlay_texts,
        output_dir=output_dir,
        carousel_id=carousel_id,
        opts=overlay_opts,
        slide_duration=job.get("image_duration", 3.0),
        audio_path=audio_path,
        character_name=character_name,
        grid_mode=grid_mode,
    )

    # Separate slide images from final video
    slide_images = [f for f in slide_files if not f.endswith(".mp4")]
    final_video = next((f for f in slide_files if f.endswith(".mp4")), None)

    add_job_log(job_id, "info", f"Carousel rendered: {len(slide_images)} slides + final video")
    update_job_status(job_id, "processing", progress=70)

    if audio_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception:
            pass

    # Upload final video
    video_url = None
    if final_video and os.path.exists(final_video):
        add_job_log(job_id, "info", "Uploading carousel video to storage")
        video_url = upload_video(final_video, account_id, template_id)

    # Upload individual slide images for GeeLark carousel publishing
    add_job_log(job_id, "info", "Uploading individual slides for carousel publishing")
    update_job_status(job_id, "processing", progress=85)
    slide_image_urls = []
    for slide_img in slide_images:
        if os.path.exists(slide_img):
            slide_url = upload_video(
                slide_img, account_id, f"{template_id}_slide_{len(slide_image_urls)}"
            )
            if slide_url:
                slide_image_urls.append(slide_url)

    supabase = ensure_supabase_client()
    if supabase:
        updates: Dict[str, Any] = {"render_path": final_video}
        if video_url:
            updates["video_url"] = video_url
        if slide_image_urls:
            updates["slide_urls"] = slide_image_urls
        supabase.table("video_jobs").update(updates).eq("id", job_id).execute()

    update_job_status(job_id, "completed", progress=100)
    add_job_log(job_id, "info", "Carousel job completed successfully")


def run_worker(
    poll_interval: int = 5,
    output_dir: str = "./output",
    max_duration_minutes: Optional[int] = None,
    max_jobs: Optional[int] = None,
) -> None:
    """Run the job worker in a loop.

    For Cloud Run Jobs: set max_duration_minutes (e.g. 30) or max_jobs (e.g. 10) so the
    worker exits and the job finishes; Cloud Scheduler can trigger the next run.
    """
    logger.info("Starting job worker (polling every %d seconds)", poll_interval)
    if max_duration_minutes:
        logger.info("Will exit after %d minutes", max_duration_minutes)
    if max_jobs is not None:
        logger.info("Will exit after %d jobs", max_jobs)

    start_time = time.time()
    jobs_done = 0

    while True:
        try:
            if max_duration_minutes and (time.time() - start_time) >= max_duration_minutes * 60:
                logger.info("Reached max duration (%d min), exiting", max_duration_minutes)
                break
            if max_jobs is not None and jobs_done >= max_jobs:
                logger.info("Reached max jobs (%d), exiting", max_jobs)
                break

            # Fetch pending job
            job = fetch_pending_job()

            if job:
                job_id = job["id"]
                logger.info("Found pending job: %s", job_id)

                # Try to claim the job
                if claim_job(job_id):
                    logger.info("Claimed job: %s", job_id)
                    try:
                        process_job(job, output_dir)
                        jobs_done += 1
                    except Exception as e:
                        logger.error(f"Error processing job {job_id}: {e}", exc_info=True)
                        update_job_status(job_id, "failed", error_message=str(e))
                else:
                    logger.warning("Failed to claim job %s (may have been claimed by another worker)", job_id)
            else:
                # No pending jobs, wait before next poll
                time.sleep(poll_interval)

        except KeyboardInterrupt:
            logger.info("Worker stopped by user")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}", exc_info=True)
            time.sleep(poll_interval)


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    run_worker()
