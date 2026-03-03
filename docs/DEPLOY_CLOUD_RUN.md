# Deploy the video worker to Cloud Run Jobs

This guide builds the worker Docker image, pushes it to GCP, and runs it as a **Cloud Run Job**, optionally triggered on a schedule via Cloud Scheduler.

## 1. Build and push the image

From the project root (where `Dockerfile` lives).

**Replace** `your-gcp-project-id` with your actual GCP project ID (e.g. `composed-augury-469200-g6`). Pick a **region** (e.g. `us-central1`).

### Option A: Bash / WSL / macOS

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=us-central1
export REPO=social-content-worker

# Create Artifact Registry repo (one-time)
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION

# Build
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/worker:latest .

# Auth Docker to GCP
gcloud auth configure-docker $REGION-docker.pkg.dev

# Push
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/worker:latest
```

### Option B: Windows PowerShell

```powershell
$PROJECT_ID = "your-gcp-project-id"
$REGION = "us-central1"
$REPO = "social-content-worker"

# Create Artifact Registry repo (one-time)
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION

# Build
docker build -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/worker:latest" .

# Auth Docker to GCP
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

# Push
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/worker:latest"
```

After the push succeeds, your image URL is:

`REGION-docker.pkg.dev/PROJECT_ID/REPO/worker:latest`  
e.g. `us-central1-docker.pkg.dev/composed-augury-469200-g6/social-content-worker/worker:latest`

## 2. Create the Cloud Run Job

1. In **Google Cloud Console** go to **Cloud Run** → **Jobs** → **Create job**.
2. **Job name:** e.g. `video-worker`.
3. **Container image:** click **Select**, choose **Artifact Registry**, then pick the image you pushed (e.g. `us-central1-docker.pkg.dev/.../worker:latest`). Or paste the full image URL.
4. **CPU:** 2, **Memory:** 4 GiB.
5. **Timeout / Maximum duration:** 30–60 minutes (so one run can process several videos).
6. **Tasks:** 1.
7. **Environment variables:** click **Add variable** and add:
   - **SUPABASE_URL** = your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - **SUPABASE_SERVICE_ROLE_KEY** = your Supabase service role key  
     (better: create the key in **Secret Manager**, then in the job choose **Reference a secret** and point this variable to that secret.)
8. **Optional variables:**
   - **CLOUD_RUN_MAX_DURATION_MINUTES** = `30` (job exits after 30 minutes; good for scheduled runs)
   - **MAX_JOBS_PER_RUN** = `10` (job exits after N jobs; good for scheduled runs)
   - **POLL_INTERVAL** = `5`
   - **OUTPUT_DIR** is already `/tmp/output` in the image; only set if you want something else.
   - **GCS_VIDEO_BUCKET** = your GCS bucket name (e.g. `babymilu-videos`) — when set, generated videos (and slide images) are uploaded to this bucket instead of Supabase Storage. The job’s `video_url` will be the GCS public URL. Ensure the bucket is publicly readable or use signed URLs if needed.
   - **GOOGLE_APPLICATION_CREDENTIALS** = path to service account JSON (only needed if using **GCS_VIDEO_BUCKET** and the job does not run with a GCP service account that already has Storage Object Admin on the bucket; on Cloud Run you can grant the job’s service account access to the bucket and omit this).
9. Click **Create**.
10. Test: open the job → **Execute** to run it once and check **Logs**.

## 3. Schedule the job (Cloud Scheduler)

1. **Cloud Scheduler** → **Create job**.
2. **Target type:** Cloud Run job.
3. **Select** the worker job you created.
4. **Frequency:** e.g. `*/10 * * * *` (every 10 minutes) or `*/5 * * * *` (every 5 minutes).

Each run starts the container, which runs the worker until it hits `CLOUD_RUN_MAX_DURATION_MINUTES` or `MAX_JOBS_PER_RUN` (or the job timeout), then exits. The next schedule triggers a new run.

## 4. Assets and fonts

- **Assets:** The worker tries **GCS first** when downloading assets, using bucket names **babymilu-images** (images/assets), **babymilu-musics** (music), **babymilu-videos** (videos). Override with env vars `GCS_BUCKET_IMAGES`, `GCS_BUCKET_MUSIC`, `GCS_BUCKET_VIDEOS`. If the object is not in GCS or the URL fails, it falls back to Supabase Storage. Do not set `LOCAL_ASSETS_DIR` in Cloud Run unless you mount a volume with pre-downloaded assets.
- **Font:** The image includes DejaVu Sans. To use a custom font (e.g. AutourOne), add `COPY fonts ./fonts` to the Dockerfile (with `fonts/AutourOne-Regular.ttf` in the repo) or set `FONT_PATH` to a path inside the container.

## 4b. Output videos to GCS

If you set **GCS_VIDEO_BUCKET**, the worker uploads the generated video (and any slide images for carousels) to that GCS bucket and saves the public URL (`https://storage.googleapis.com/...`) in the job’s `video_url`. If **GCS_VIDEO_BUCKET** is not set, videos are uploaded to Supabase Storage as before. Ensure the GCS bucket has **public access** for the objects (or adjust your app to use signed URLs).

## 5. Optional: custom font in the image

If you have `fonts/AutourOne-Regular.ttf` in the repo, add this line to the Dockerfile before the `ENV FONT_PATH` line:

```dockerfile
COPY fonts ./fonts
```

Then set `FONT_PATH=/app/fonts/AutourOne-Regular.ttf` in the Cloud Run job (or leave unset if your code defaults to `./fonts/AutourOne-Regular.ttf` relative to `/app`).
