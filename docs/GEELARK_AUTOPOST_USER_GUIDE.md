# GeeLark Auto-Post User Guide

## Table of Contents
1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Current Features](#current-features)
4. [Usage Guide](#usage-guide)
5. [Current Limitations & Improvements Needed](#current-limitations--improvements-needed)

---

## Overview

The GeeLark auto-post system automates the process of posting content to TikTok through the GeeLark API. It handles video uploads, task creation, scheduling, retry logic, and database logging to ensure reliable automated posting.

### System Architecture

```
┌─────────────────┐
│  Rendered Videos │
│  (Local/Output)  │
└────────┬────────┘
         │
         │ Upload
         │
┌────────▼────────┐
│  GeeLark API    │
│                 │
│  - Upload URL   │
│  - File Upload  │
│  - Task Create  │
└────────┬────────┘
         │
         │ Scheduled
         │
┌────────▼────────┐
│  TikTok Posting │
│  (via GeeLark)  │
└─────────────────┘
```

### Data Flow

1. **Video Rendering**: System renders video/slideshow/carousel with template
2. **Upload Preparation**: Gets upload URL from GeeLark API
3. **File Upload**: Uploads video/images to GeeLark storage
4. **Task Creation**: Creates posting task with schedule
5. **Scheduling**: Calculates posting time using time windows
6. **Database Logging**: Logs post attempt to Supabase
7. **Template Tracking**: Marks template as used

---

## How It Works

### Posting Workflow

#### For Regular Videos:
1. **Template Selection**: System selects unused template
2. **Video Rendering**: Renders video with text overlay
3. **Upload URL**: Gets upload URL from GeeLark (`/open/v1/upload/getUrl`)
4. **File Upload**: Uploads video file via PUT request
5. **Schedule Calculation**: Calculates posting time (time window or default)
6. **Task Creation**: Creates task via `/open/v1/task/add`
7. **Database Logging**: Logs success/failure to `post_logs` table
8. **Template Update**: Marks template as used

#### For Carousels:
1. **Template Selection**: Selects carousel template
2. **Carousel Rendering**: Renders carousel with slides
3. **Slide Upload**: Uploads each slide as image
4. **Music Upload** (optional): Uploads background music if provided
5. **Schedule Calculation**: Calculates posting time
6. **Carousel Task Creation**: Creates carousel task via `/open/v1/task/add` (task_type=2)
7. **Database Logging**: Logs to database
8. **Template Update**: Marks template as used

### Scheduling System

The system uses **time windows** for intelligent scheduling:

1. **Time Window Selection**: 
   - Queries `posting_schedules` table for account
   - Selects random time window from configured windows
   - Example: `[{"start": "11:00", "end": "13:00"}, {"start": "18:00", "end": "20:00"}]`

2. **Random Time Selection**:
   - Picks random time within selected window
   - Ensures minimum delay (default: 120 minutes)
   - Converts Eastern Time to UTC

3. **Fallback**:
   - If no schedule configured, uses default (120 minutes from now)
   - If schedule query fails, uses default

### Retry Logic

The system implements **exponential backoff** for failed operations:

- **Max Retries**: 3 attempts (configurable)
- **Initial Delay**: 1 second
- **Backoff Factor**: 2x (doubles each retry)
- **Max Delay**: 60 seconds
- **Retries On**: Upload failures, task creation failures

**Example Retry Sequence**:
- Attempt 1: Immediate
- Attempt 2: Wait 1s
- Attempt 3: Wait 2s
- Attempt 4: Wait 4s (if max_retries=3, this is final attempt)

### Authentication

GeeLark API supports two authentication modes:

1. **Key Verification Mode** (with app_id):
   - Uses SHA256 signature
   - Headers: `appId`, `traceId`, `ts`, `nonce`, `sign`
   - Signature: `SHA256(appId + traceId + ts + nonce + apiKey)`

2. **Token Verification Mode** (without app_id):
   - Uses Bearer token
   - Header: `Authorization: Bearer {api_key}`
   - Simpler, recommended for most use cases

---

## Current Features

### Upload Features

#### 1. File Upload
- **Upload URL**: Gets pre-signed upload URL from GeeLark
- **File Type Detection**: Automatically detects file type from extension
- **PUT Upload**: Uploads file via HTTP PUT request
- **Timeout Handling**: 120 second timeout for large files
- **Error Handling**: Detailed error messages for failed uploads

#### 2. Supported File Types
- **Videos**: MP4, MOV, AVI
- **Images**: JPG, PNG, WEBP
- **Audio**: MP3, AAC (for carousel music)

### Task Creation Features

#### 1. Video Task Creation
- **Task Type**: 1 (video)
- **Required Fields**:
  - `scheduleAt`: Unix timestamp
  - `envId`: Environment ID
  - `video`: Resource URL
  - `videoDesc`: Caption text
- **Optional Fields**:
  - `needShareLink`: Generate share link
  - `markAI`: Mark as AI-generated
  - `planName`: Plan name for grouping

#### 2. Carousel Task Creation
- **Task Type**: 2 (carousel/slideshow)
- **Required Fields**:
  - `envId`: Environment ID
  - `action`: Action type (auto-detected)
  - `duration`: Total duration in seconds
  - `slides`: Array of slide resource URLs
  - `videoDesc`: Caption text
- **Optional Fields**:
  - `music`: Music/audio resource URL
  - `scheduleAt`: Scheduled posting time
  - `needShareLink`: Generate share link
  - `markAI`: Mark as AI-generated

### Scheduling Features

#### 1. Time Windows
- **Multiple Windows**: Supports multiple time windows per account
- **Random Selection**: Randomly selects window for variation
- **Random Time**: Picks random time within window
- **Time Zone**: Converts Eastern Time to UTC
- **Minimum Delay**: Ensures minimum delay (default: 120 minutes)

#### 2. Schedule Configuration
- **Database-Driven**: Stored in `posting_schedules` table
- **Per-Account**: Each account can have different schedule
- **Posts Per Day**: Configurable (1 or 2 posts per day)
- **Time Windows**: Array of `{start: "HH:MM", end: "HH:MM"}`

### Retry Features

#### 1. Exponential Backoff
- **Configurable**: Max retries, delays, backoff factor
- **Automatic**: Retries on exceptions
- **Logging**: Logs each retry attempt
- **Final Error**: Raises exception after all retries fail

#### 2. Retry Scope
- **Upload Operations**: File uploads retry automatically
- **Task Creation**: Task creation retries automatically
- **Carousel Uploads**: Each slide upload retries
- **Music Upload**: Music upload retries

### Database Logging Features

#### 1. Post Logs
- **Success Logging**: Logs successful posts
- **Failure Logging**: Logs failed posts with error messages
- **Metadata**: Stores template ID, account ID, post type, scheduled time
- **Resource URLs**: Stores GeeLark resource URLs
- **Render Paths**: Stores local file paths

#### 2. Log Fields
- `template_id`: Template used
- `account_id`: Account posted to
- `post_type`: 'video', 'slideshow', or 'carousel'
- `status`: 'success' or 'failed'
- `error_message`: Error details if failed
- `scheduled_time`: When post is scheduled
- `render_path`: Local file path
- `resource_url`: GeeLark resource URL

### Template Management Features

#### 1. Template Selection
- **Unused Only**: Only selects unused templates
- **Persona Matching**: Matches account persona
- **Fandom Preferences**: Prioritizes preferred fandoms
- **Intensity Filtering**: Filters by preferred intensity
- **Weighted Random**: Uses intensity weights

#### 2. Template Tracking
- **Usage Metadata**: Tracks when template was used
- **Account Info**: Stores account ID, display name, cloud phone ID
- **Status Tracking**: Tracks success/failure status
- **Prevents Reuse**: Prevents template from being reused

---

## Usage Guide

### Basic Posting

#### Post Video
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type video \
  --default-video ./input/videos/base_video.mp4
```

#### Post Carousel
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type carousel \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg,./assets/img3.jpg \
  --character-name xavier
```

#### Post Slideshow
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type slideshow \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg,./assets/img3.jpg
```

### Advanced Options

#### Custom Plan Name
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --plan-name my-custom-plan \
  --post-type video
```

#### Filter by Account
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --account-id account_001 \
  --post-type video
```

#### Filter by Persona
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --persona anime_otome \
  --post-type video
```

#### Dry Run (Test Without Posting)
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type video \
  --dry-run
```

#### Carousel with Music
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type carousel \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg \
  --music-path ./audio/background.mp3
```

### Managing Schedules

#### View Posting Schedules
Check `posting_schedules` table in Supabase dashboard or use SQL:

```sql
SELECT * FROM posting_schedules WHERE account_id = 'account_001';
```

#### Create Posting Schedule
Insert into `posting_schedules` table:

```sql
INSERT INTO posting_schedules (account_id, posts_per_day, time_windows)
VALUES (
  'account_001',
  2,
  '[
    {"start": "11:00", "end": "13:00"},
    {"start": "18:00", "end": "20:00"}
  ]'::jsonb
);
```

#### Update Posting Schedule
```sql
UPDATE posting_schedules
SET time_windows = '[
  {"start": "10:00", "end": "12:00"},
  {"start": "19:00", "end": "21:00"}
]'::jsonb
WHERE account_id = 'account_001';
```

### Viewing Post Logs

#### Check Post Logs
```sql
SELECT * FROM post_logs 
WHERE account_id = 'account_001' 
ORDER BY created_at DESC 
LIMIT 10;
```

#### Check Success Rate
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM post_logs
WHERE account_id = 'account_001'
GROUP BY status;
```

#### Check Failed Posts
```sql
SELECT * FROM post_logs 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### Best Practices

- **Schedule Management**: Set up time windows for each account
- **Template Rotation**: Ensure enough unused templates available
- **Error Monitoring**: Regularly check post logs for failures
- **Retry Configuration**: Adjust retry settings based on network reliability
- **Dry Run First**: Always test with `--dry-run` before posting
- **Backup Templates**: Export templates before making changes
- **Monitor GeeLark**: Check GeeLark dashboard for task status
- **Rate Limiting**: Don't post too frequently (respect platform limits)

---

## Current Limitations & Improvements Needed

### 🔴 Critical Improvements

#### 1. Task Status Monitoring
**Current State**: 
- No way to check if task was successfully posted
- No status updates after task creation
- No way to know if post failed on TikTok side

**Improvement Needed**:
- Poll GeeLark API for task status
- Update post logs with final status
- Handle TikTok-side failures
- Notification system for failed posts

#### 2. Better Error Handling
**Current State**:
- Errors logged but not always actionable
- No retry for certain error types
- Limited error context

**Improvements Needed**:
- Categorize errors (retryable vs non-retryable)
- Better error messages with suggestions
- Error recovery strategies
- Error notification system

#### 3. Schedule Management UI
**Current State**:
- Schedules managed via SQL only
- No visual interface for time windows
- No validation of schedule format

**Improvements Needed**:
- Dashboard UI for schedule management
- Visual time window editor
- Schedule validation
- Preview of scheduled times

### 🟡 Medium Priority Improvements

#### 4. Advanced Scheduling
- Support for different schedules per day of week
- Time zone selection (not just Eastern Time)
- Holiday/exception handling
- Post frequency limits per account

#### 5. Task Queue Management
- Queue system for pending tasks
- Priority-based posting
- Task cancellation
- Bulk task operations

#### 6. Analytics & Reporting
- Post success rate analytics
- Best posting time analysis
- Template performance metrics
- Account performance comparison

#### 7. Content Validation
- Pre-upload validation (file size, format)
- Content policy checking
- Duplicate detection
- Quality checks

#### 8. Multi-Account Management
- Batch operations across accounts
- Account grouping
- Account-specific settings
- Account rotation

### 🟢 Nice-to-Have Improvements

#### 9. Webhook Integration
- Webhook for task status updates
- Webhook for posting events
- Integration with external systems

#### 10. Advanced Retry Strategies
- Different retry strategies per error type
- Circuit breaker pattern
- Retry queue for failed posts
- Manual retry interface

#### 11. Post Preview
- Preview before posting
- Preview scheduled posts
- Edit before posting

#### 12. Automation Triggers
- Scheduled automation (cron)
- Event-based triggers
- API triggers
- Webhook triggers

#### 13. Performance Optimization
- Parallel uploads
- Batch task creation
- Connection pooling
- Caching

---

*For technical setup and implementation details, see [GEELARK_AUTOPOST_TECHNICAL_DOCS.md](./GEELARK_AUTOPOST_TECHNICAL_DOCS.md)*
