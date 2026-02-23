#!/usr/bin/env python3
"""
Standalone script to run the video generation job worker.

This script polls the database for pending video generation jobs,
processes them, and uploads the generated videos to Supabase Storage.

Usage:
    python -m src.run_worker

Environment Variables Required:
    SUPABASE_URL - Your Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY - Your Supabase service role key (or SUPABASE_ANON_KEY)

Optional:
    POLL_INTERVAL - Polling interval in seconds (default: 5)
    OUTPUT_DIR - Output directory for generated videos (default: ./output)
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
    output_dir = os.getenv("OUTPUT_DIR", "./output")
    
    # Check for required environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        logger.error("Missing required environment variables:")
        logger.error("  SUPABASE_URL - Your Supabase project URL")
        logger.error("  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY - Your Supabase key")
        logger.error("\nPlease set these environment variables and try again.")
        sys.exit(1)
    
    logger.info("=" * 60)
    logger.info("Video Generation Job Worker")
    logger.info("=" * 60)
    logger.info(f"Supabase URL: {supabase_url}")
    logger.info(f"Poll interval: {poll_interval} seconds")
    logger.info(f"Output directory: {output_dir}")
    logger.info("Press Ctrl+C to stop")
    logger.info("=" * 60)
    
    try:
        run_worker(poll_interval=poll_interval, output_dir=output_dir)
    except KeyboardInterrupt:
        logger.info("\nWorker stopped by user")
    except Exception as e:
        logger.error(f"Worker error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
