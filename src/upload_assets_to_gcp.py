#!/usr/bin/env python3
"""
Upload all assets (images, videos, music) from Supabase (or local) to a GCP Cloud Storage bucket.

Use this to migrate assets to GCS and optionally point the app at GCS by updating the asset URL.

Usage:
    # 1. Set GCP auth (one of):
    #    set GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account-key.json
    #    or: gcloud auth application-default login
    #
    # 2. Run (download from Supabase/local, upload to GCS):
    python -m src.upload_assets_to_gcp --gcs-bucket YOUR_BUCKET_NAME

    # 3. Optional: write GCS public URLs back to Supabase so the worker uses GCS:
    python -m src.upload_assets_to_gcp --gcs-bucket YOUR_BUCKET_NAME --update-db

    # 4. If assets are already on disk (LOCAL_ASSETS_DIR), they'll be read from there:
    set LOCAL_ASSETS_DIR=./assets
    python -m src.upload_assets_to_gcp --gcs-bucket YOUR_BUCKET_NAME

    # 5. Upload only the Supabase "assets" bucket (images) to a dedicated GCS bucket:
    python -m src.upload_assets_to_gcp --gcs-bucket babymilu-images --only-bucket assets

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - for listing assets and optional --update-db.
    LOCAL_ASSETS_DIR - if set, assets are read from this directory (same layout as storage_path).
    GOOGLE_APPLICATION_CREDENTIALS - path to GCP service account JSON (or use gcloud auth).
"""

import argparse
import logging
import os
import sys
import tempfile
from pathlib import Path

# Project root for imports
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

# Map file extension to GCS content type
_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
}


def _content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


def main():
    parser = argparse.ArgumentParser(
        description="Upload all assets from Supabase (or local) to a GCP Cloud Storage bucket."
    )
    parser.add_argument(
        "--gcs-bucket",
        "-b",
        required=True,
        help="GCS bucket name (e.g. my-assets-bucket)",
    )
    parser.add_argument(
        "--prefix",
        "-p",
        default="",
        help="Optional path prefix inside the bucket (e.g. assets/)",
    )
    parser.add_argument(
        "--update-db",
        action="store_true",
        help="Update each asset's url in Supabase to the GCS public URL after upload",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List assets and GCS paths only; do not download or upload",
    )
    parser.add_argument(
        "--only-bucket",
        choices=("assets", "music", "videos", "all"),
        default="all",
        help="Upload only assets whose storage_path is in this Supabase bucket (default: all)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip uploading if the object already exists in GCS (useful for re-runs to retry only failures)",
    )
    args = parser.parse_args()

    bucket_name = args.gcs_bucket.strip()
    prefix = (args.prefix.strip().rstrip("/") + "/") if args.prefix.strip() else ""

    try:
        supabase = ensure_supabase_client()
    except Exception as e:
        logger.error("Supabase not configured: %s", e)
        return 1

    # Fetch all assets (Supabase/PostgREST default limit is 1000, so paginate)
    rows = []
    chunk_size = 1000
    offset = 0
    while True:
        response = (
            supabase.table("assets")
            .select("id, storage_path, url")
            .range(offset, offset + chunk_size - 1)
            .execute()
        )
        chunk = response.data if hasattr(response, "data") and response.data else []
        rows.extend(chunk)
        if len(chunk) < chunk_size:
            break
        offset += chunk_size
    if not rows:
        logger.info("No assets found in the database.")
        return 0

    # Filter by Supabase bucket so we only upload assets/music/videos as requested
    if args.only_bucket != "all":
        prefix_match = f"{args.only_bucket}/"
        rows = [r for r in rows if (r.get("storage_path") or "").startswith(prefix_match)]
        logger.info("Filtered to %d assets in Supabase bucket '%s' (storage_path starts with %r)", len(rows), args.only_bucket, prefix_match)
        if not rows:
            logger.info("No matching assets. Done.")
            return 0

    if args.dry_run:
        logger.info("Dry run: would upload %d assets to gs://%s/%s", len(rows), bucket_name, prefix)
        for row in rows:
            storage_path = row.get("storage_path") or f"{row.get('id')}.bin"
            logger.info("  %s -> gs://%s/%s%s", row.get("id"), bucket_name, prefix, storage_path)
        return 0

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)
    except Exception as e:
        logger.error(
            "GCP Storage not configured: %s. Set GOOGLE_APPLICATION_CREDENTIALS or run: gcloud auth application-default login",
            e,
        )
        return 1

    logger.info("Uploading %d assets to gs://%s/%s", len(rows), bucket_name, prefix or "(root)")
    ok = 0
    fail = 0
    skipped = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        for i, row in enumerate(rows):
            asset_id = row.get("id")
            storage_path = row.get("storage_path")
            if not asset_id:
                continue
            gcs_path = (prefix + (storage_path or f"{asset_id}.bin")).replace("\\", "/")

            if args.skip_existing:
                blob = bucket.blob(gcs_path)
                if blob.exists():
                    skipped += 1
                    if args.update_db:
                        public_url = f"https://storage.googleapis.com/{bucket_name}/{gcs_path}"
                        try:
                            supabase.table("assets").update({"url": public_url}).eq("id", asset_id).execute()
                            logger.debug("[%d/%d] SKIP (exists) + updated DB url %s", i + 1, len(rows), asset_id)
                        except Exception as e:
                            logger.warning("Could not update asset url for %s: %s", asset_id, e)
                    else:
                        logger.debug("[%d/%d] SKIP (exists) %s", i + 1, len(rows), asset_id)
                    continue

            # Unique temp file per asset to avoid overwriting
            ext = os.path.splitext(gcs_path)[1] or ".bin"
            local_path = os.path.join(tmpdir, f"{asset_id}{ext}")

            if not download_asset(asset_id, local_path):
                fail += 1
                logger.warning("[%d/%d] FAIL download %s", i + 1, len(rows), asset_id)
                continue

            try:
                blob = bucket.blob(gcs_path)
                blob.upload_from_filename(
                    local_path,
                    content_type=_content_type(gcs_path),
                )
            except Exception as e:
                fail += 1
                logger.warning("[%d/%d] FAIL upload %s: %s", i + 1, len(rows), asset_id, e)
                continue

            ok += 1
            logger.info("[%d/%d] OK %s -> gs://%s/%s", i + 1, len(rows), asset_id, bucket_name, gcs_path)

            if args.update_db:
                # Public URL format for GCS (bucket must be public for read, or use IAM/signed URLs)
                public_url = f"https://storage.googleapis.com/{bucket_name}/{gcs_path}"
                try:
                    supabase.table("assets").update({"url": public_url}).eq("id", asset_id).execute()
                except Exception as e:
                    logger.warning("Could not update asset url for %s: %s", asset_id, e)

    if skipped:
        logger.info("Done. %d succeeded, %d skipped (already in GCS), %d failed.", ok, skipped, fail)
    else:
        logger.info("Done. %d succeeded, %d failed.", ok, fail)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
