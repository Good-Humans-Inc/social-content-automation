# Video Upload to GeeLark - Setup Guide

This guide explains how to use the dashboard to upload videos directly to GeeLark.

## Prerequisites

1. **Supabase Storage Bucket**: Create a `videos` bucket in Supabase Storage (set to public)
2. **GeeLark API Credentials**: Get your API key from GeeLark dashboard
3. **Environment Variables**: Configure GeeLark API credentials

## Environment Variables

Add these to your `.env.local` file:

```bash
# GeeLark API Configuration
GEELARK_API_BASE=https://openapi.geelark.com
GEELARK_API_KEY=your_geelark_api_key
GEELARK_APP_ID=your_app_id  # Optional - only if using key verification mode
```

### Authentication Modes

GeeLark supports two authentication modes:

1. **Token Verification Mode** (Simpler - Recommended)
   - Only requires `GEELARK_API_KEY`
   - Uses Bearer token authentication
   - Set `GEELARK_API_KEY` only

2. **Key Verification Mode** (More secure)
   - Requires both `GEELARK_API_KEY` and `GEELARK_APP_ID`
   - Uses SHA256 signature authentication
   - Set both `GEELARK_API_KEY` and `GEELARK_APP_ID`

## How It Works

1. **Video Generation**: Videos are generated using Python CLI/GUI and uploaded to Supabase Storage
2. **Video Selection**: Dashboard displays all videos from Supabase Storage
3. **Upload to GeeLark**: Select a video, account, and optional template/caption
4. **Task Creation**: System creates a GeeLark task with scheduled posting time
5. **Logging**: All uploads are logged to `post_logs` table

## Usage

1. Navigate to `/videos` page in the dashboard
2. You'll see:
   - **Upload Section**: Form to upload videos to GeeLark
   - **Video Gallery**: All generated videos with preview

3. To upload a video:
   - Select a video from the dropdown
   - Select an account
   - (Optional) Select a template (auto-fills caption)
   - (Optional) Edit caption
   - Set schedule time (minutes from now)
   - Click "Upload to GeeLark"

4. The system will:
   - Download video from Supabase Storage
   - Get upload URL from GeeLark
   - Upload video to GeeLark storage
   - Create posting task in GeeLark
   - Log everything to database

## API Endpoint

The upload functionality uses the `/api/videos/upload-geelark` endpoint:

**POST** `/api/videos/upload-geelark`

**Request Body:**
```json
{
  "video_url": "https://...supabase.co/storage/v1/object/public/videos/...",
  "account_id": "account_001",
  "template_id": "template_123",  // Optional
  "caption": "Your caption here",  // Optional
  "schedule_minutes": 120,  // Optional, default: 120
  "plan_name": "auto-plan"  // Optional, default: "auto-plan"
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "task_123",
  "resourceUrl": "https://storage.geelark.com/resource/...",
  "scheduledAt": 1234567890,
  "scheduledTime": "2024-01-01T12:00:00Z"
}
```

## Troubleshooting

### "GeeLark API key not configured"
- Make sure `GEELARK_API_KEY` is set in `.env.local`
- Restart the development server after adding environment variables

### "Failed to download video"
- Check that the video URL is accessible
- Verify Supabase Storage bucket is set to public
- Check that the video exists in Supabase Storage

### "Failed to upload video to GeeLark"
- Verify GeeLark API credentials are correct
- Check network connectivity
- Verify video file size is within GeeLark limits

### "Failed to create GeeLark task"
- Verify account `env_id` is correct
- Check that account exists in database
- Verify GeeLark API permissions

## Benefits

- ✅ **Centralized Logging**: All uploads logged from dashboard
- ✅ **Easy to Use**: Simple UI for uploading videos
- ✅ **No Python Dependency**: Everything in TypeScript/Next.js
- ✅ **Real-time Feedback**: See upload status immediately
- ✅ **Works with Existing Videos**: Uses videos already in Supabase Storage
