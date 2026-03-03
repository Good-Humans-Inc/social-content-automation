#!/usr/bin/env python3
"""
Check that GCP credentials and a Cloud Storage bucket are set up correctly.

Usage:
    python -m src.check_gcs_bucket
    python -m src.check_gcs_bucket --bucket babymilu-images

Loads .env from project root so GOOGLE_APPLICATION_CREDENTIALS is used.
"""

import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

# Load .env so GOOGLE_APPLICATION_CREDENTIALS is set
from dotenv import load_dotenv
for _p in [_root / ".env", _root / ".env.local", _root / "dashboard" / ".env"]:
    if _p.exists():
        load_dotenv(_p)
        break


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Check GCP bucket and credentials.")
    parser.add_argument("--bucket", "-b", default=os.environ.get("GCS_BUCKET", "babymilu-images"), help="Bucket name (default: babymilu-images)")
    args = parser.parse_args()
    bucket_name = args.bucket.strip()

    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        print("ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set in .env")
        print("Add: GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\your-key.json")
        return 1
    if not os.path.isfile(creds_path):
        print(f"ERROR: Key file not found: {creds_path}")
        return 1
    print(f"Using credentials: {creds_path}")

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        # List objects (only needs Storage Object Admin on the bucket; no bucket.reload())
        blobs = list(bucket.list_blobs(max_results=5))
        print(f"OK  Bucket accessible: {bucket_name}")
        if blobs:
            print(f"    Objects (first 5): {[b.name for b in blobs]}")
        else:
            print("    Objects: (empty)")
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        print("    Ensure the service account is granted access to the bucket:")
        print("    Cloud Storage → Buckets → babymilu-images → Permissions → Grant access")
        print("    Principal: asset-uploader@composed-augury-469200-g6.iam.gserviceaccount.com")
        print("    Role: Storage Object Admin (or Storage Admin)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
