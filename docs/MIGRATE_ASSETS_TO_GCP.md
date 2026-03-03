# Migrate assets from Supabase to GCP Cloud Storage

Use the same upload script for **images**, **music**, and **videos** by choosing the Supabase bucket with `--only-bucket`.

## Prerequisites

- GCP project with a bucket per type (e.g. `babymilu-images`, `babymilu-musics`, `babymilu-videos`)
- Service account key with **Storage Object Admin** (or **Storage Object Creator**) on each bucket
- `GOOGLE_APPLICATION_CREDENTIALS` set in `.env` or in the shell
- Supabase env vars set (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

## 1. Images (Supabase `assets` bucket → GCS)

You already did this with `babymilu-images`:

```bash
python -m src.upload_assets_to_gcp --gcs-bucket babymilu-images --only-bucket assets
```

Optional: write GCS URLs back to Supabase so the worker uses GCS for images:

```bash
python -m src.upload_assets_to_gcp --gcs-bucket babymilu-images --only-bucket assets --update-db
```

## 2. Music (Supabase `music` bucket → GCS)

1. **Create a GCS bucket** (e.g. `babymilu-musics`) in the same project.
2. **Grant the same service account** access to that bucket:  
   Cloud Storage → **babymilu-musics** → Permissions → Grant access →  
   Principal: `asset-uploader@...iam.gserviceaccount.com` → Role: **Storage Object Admin**.
3. **Run the upload** (only rows whose `storage_path` starts with `music/`):

   ```bash
   python -m src.upload_assets_to_gcp --gcs-bucket babymilu-musics --only-bucket music
   ```

4. **Optional:** Update Supabase so the worker downloads music from GCS:

   ```bash
   python -m src.upload_assets_to_gcp --gcs-bucket babymilu-musics --only-bucket music --update-db
   ```

Re-runs (e.g. after some failures): add `--skip-existing` so only missing objects are uploaded:

```bash
python -m src.upload_assets_to_gcp --gcs-bucket babymilu-musics --only-bucket music --skip-existing --update-db
```

## 3. Videos (Supabase `videos` bucket → GCS)

Same idea as music:

1. Create a bucket (e.g. `babymilu-videos`).
2. Grant the service account **Storage Object Admin** on that bucket.
3. Run:

   ```bash
   python -m src.upload_assets_to_gcp --gcs-bucket babymilu-videos --only-bucket videos
   ```

4. Optional: `--update-db` so asset URLs point to GCS; use `--skip-existing` on re-runs.

## Summary

| Supabase bucket | Example GCS bucket   | Command |
|-----------------|----------------------|--------|
| `assets` (images) | `babymilu-images`  | `--gcs-bucket babymilu-images --only-bucket assets` |
| `music`          | `babymilu-music`    | `--gcs-bucket babymilu-music --only-bucket music`   |
| `videos`         | `babymilu-videos`   | `--gcs-bucket babymilu-videos --only-bucket videos` |

After migration, if you used `--update-db`, the worker will download from the stored URLs (GCS) instead of Supabase Storage, which helps when Supabase is over limit.
