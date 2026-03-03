#!/usr/bin/env python3
"""
Download all assets from Supabase Storage to a local directory.

Use this to populate a local cache so the worker can use LOCAL_ASSETS_DIR
and avoid hitting Supabase storage limits.

Usage:
    python -m src.download_assets --output-dir ./assets

Then run the worker with local assets:
    set LOCAL_ASSETS_DIR=./assets
    python -m src.run_worker

Environment:
    Uses the same .env as the rest of the app (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
    Do not set LOCAL_ASSETS_DIR when running this script so it fetches from Supabase.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Add project root for imports
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from src.job_worker import download_asset
from src.supabase_client import ensure_supabase_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Download all assets from Supabase to a local directory (for use with LOCAL_ASSETS_DIR)."
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        default=os.environ.get("LOCAL_ASSETS_DIR", "./assets"),
        help="Directory to save assets into (default: ./assets or LOCAL_ASSETS_DIR)",
    )
    args = parser.parse_args()

    output_dir = os.path.abspath(args.output_dir)
    if not os.path.isdir(output_dir):
        os.makedirs(output_dir, exist_ok=True)
        logger.info("Created output directory: %s", output_dir)

    # Always fetch from Supabase when running this script (temporarily ignore LOCAL_ASSETS_DIR)
    saved_local = os.environ.pop("LOCAL_ASSETS_DIR", None)
    try:
        return _run(output_dir)
    finally:
        if saved_local is not None:
            os.environ["LOCAL_ASSETS_DIR"] = saved_local


def _run(output_dir: str) -> int:
    try:
        supabase = ensure_supabase_client()
    except Exception as e:
        logger.error("Supabase not configured: %s", e)
        return 1

    response = supabase.table("assets").select("id, storage_path, url").execute()
    rows = response.data if hasattr(response, "data") and response.data else []
    if not rows:
        logger.info("No assets found in the database.")
        return 0

    logger.info("Found %d assets. Downloading to %s ...", len(rows), output_dir)
    ok = 0
    fail = 0
    for i, row in enumerate(rows):
        asset_id = row.get("id")
        storage_path = row.get("storage_path")
        if not asset_id:
            continue
        # Mirror storage path under output_dir so LOCAL_ASSETS_DIR + storage_path works later
        if storage_path:
            out_path = os.path.join(output_dir, storage_path)
        else:
            out_path = os.path.join(output_dir, f"{asset_id}.bin")
        parent = os.path.dirname(out_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        if download_asset(asset_id, out_path):
            ok += 1
            logger.info("[%d/%d] OK %s -> %s", i + 1, len(rows), asset_id, out_path)
        else:
            fail += 1
            logger.warning("[%d/%d] FAIL %s (path=%s)", i + 1, len(rows), asset_id, storage_path or "(none)")

    logger.info("Done. %d succeeded, %d failed.", ok, fail)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
