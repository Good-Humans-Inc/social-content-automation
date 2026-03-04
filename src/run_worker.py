#!/usr/bin/env python3
"""
Standalone script to run the video generation job worker.

This script polls the database for pending video generation jobs,
processes them, and uploads the generated videos to GCS (if GCS_VIDEO_BUCKET
or GCS_BUCKET_VIDEOS is set) or Supabase Storage otherwise.

Usage:
    python -m src.run_worker

Environment Variables Required:
    SUPABASE_URL - Your Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY - Your Supabase service role key (or SUPABASE_ANON_KEY)

Optional:
    POLL_INTERVAL - Polling interval in seconds (default: 5)
    OUTPUT_DIR - Output directory for generated videos (default: ./output)
    GCS_VIDEO_BUCKET or GCS_BUCKET_VIDEOS - When set, generated videos (and slide images)
        are uploaded to this GCS bucket instead of Supabase Storage.
    LOCAL_ASSETS_DIR - If set, the worker uses assets from this directory instead of
        downloading from Supabase Storage (e.g. after running python -m src.download_assets -o ./assets).
"""

import os
import sys
import logging
from pathlib import Path

# Add parent directory to path to allow imports
# This allows the script to work when run from both root and src directory
current_dir = Path(__file__).parent
parent_dir = current_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

# Import from same package
from src.job_worker import run_worker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def main():
    """Main entry point for the worker."""
    # Get configuration from environment variables
    poll_interval = int(os.getenv("POLL_INTERVAL", "5"))
    # In Cloud Run (K_SERVICE set) or when CLOUD_RUN=1, use writable temp dir
    default_output = "/tmp/output" if (os.getenv("K_SERVICE") or os.getenv("CLOUD_RUN")) else "./output"
    output_dir = os.getenv("OUTPUT_DIR", default_output)

    # Optional: exit after N minutes or N jobs (for Cloud Run Jobs + Cloud Scheduler)
    max_duration_minutes = os.getenv("CLOUD_RUN_MAX_DURATION_MINUTES")
    max_duration_minutes = int(max_duration_minutes) if max_duration_minutes else None
    max_jobs = os.getenv("MAX_JOBS_PER_RUN")
    max_jobs = int(max_jobs) if max_jobs else None

    # Check for required environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        logger.error("Missing required environment variables:")
        logger.error("  SUPABASE_URL - Your Supabase project URL")
        logger.error("  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY - Your Supabase key")
        logger.error("\nPlease set these environment variables and try again.")
        sys.exit(1)

    local_assets = os.getenv("LOCAL_ASSETS_DIR")
    logger.info("=" * 60)
    logger.info("Video Generation Job Worker")
    logger.info("=" * 60)
    logger.info(f"Supabase URL: {supabase_url}")
    logger.info(f"Poll interval: {poll_interval} seconds")
    logger.info(f"Output directory: {output_dir}")
    if local_assets:
        logger.info(f"Local assets: {local_assets} (using local files instead of Supabase Storage)")
    if max_duration_minutes:
        logger.info(f"Max duration: {max_duration_minutes} minutes")
    if max_jobs is not None:
        logger.info(f"Max jobs per run: {max_jobs}")
    logger.info("Press Ctrl+C to stop")
    logger.info("=" * 60)

    try:
        run_worker(
            poll_interval=poll_interval,
            output_dir=output_dir,
            max_duration_minutes=max_duration_minutes,
            max_jobs=max_jobs,
        )
    except KeyboardInterrupt:
        logger.info("\nWorker stopped by user")
    except Exception as e:
        logger.error(f"Worker error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
