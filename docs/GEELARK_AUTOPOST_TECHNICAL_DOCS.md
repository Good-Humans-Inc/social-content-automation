# GeeLark Auto-Post Technical Documentation

## Table of Contents
1. [Setup & Installation](#setup--installation)
2. [Technical Architecture](#technical-architecture)
3. [API Integration](#api-integration)
4. [Authentication](#authentication)
5. [Code Structure](#code-structure)
6. [Database Schema](#database-schema)
7. [Scheduling System](#scheduling-system)
8. [Retry Logic](#retry-logic)
9. [Error Handling](#error-handling)
10. [Performance Considerations](#performance-considerations)
11. [Troubleshooting](#troubleshooting)
12. [Future Roadmap](#future-roadmap)

---

## Setup & Installation

### Prerequisites

- **Python 3.8+**: Required for Python CLI
- **GeeLark Account**: Active GeeLark account with API access
- **GeeLark API Key**: API key from GeeLark dashboard
- **Supabase Account**: For database logging and scheduling

### Installation Steps

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   Key dependencies:
   - `requests` - HTTP requests to GeeLark API
   - `supabase` - Database client
   - `typer` - CLI framework
   - `python-dotenv` - Environment variables

2. **Set Environment Variables**:
   Create `.env` file in project root:
   ```bash
   GEELARK_API_KEY=your_geelark_api_key
   GEELARK_API_BASE=https://openapi.geelark.com
   GEELARK_APP_ID=your_app_id  # Optional, for key verification mode
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **Get GeeLark API Credentials**:
   - Log in to GeeLark dashboard
   - Navigate to API settings
   - Generate API key
   - Copy API key and (optionally) App ID

4. **Verify Configuration**:
   ```bash
   python -m src.cli list-envs
   ```

   This will test GeeLark API connection.

---

## Technical Architecture

### Component Overview

```
┌─────────────────┐
│  Rendered Video │
│  (Local File)   │
└────────┬────────┘
         │
         │ Upload Flow
         │
┌────────▼────────┐
│ GeeLark Client  │
│                 │
│  ┌───────────┐  │
│  │ Upload    │  │
│  │ Manager   │  │
│  └───────────┘  │
│                 │
│  ┌───────────┐  │
│  │ Task      │  │
│  │ Creator   │  │
│  └───────────┘  │
└────────┬────────┘
         │
         │ API Calls
         │
┌────────▼────────┐
│  GeeLark API    │
│                 │
│  - Upload URL   │
│  - File Storage │
│  - Task Queue   │
└────────┬────────┘
         │
         │ Scheduled
         │
┌────────▼────────┐
│  TikTok Posting │
│  (via GeeLark)  │
└─────────────────┘
```

### Processing Flow

1. **Video Ready**: Rendered video/slideshow/carousel ready
2. **Get Upload URL**: Call `/open/v1/upload/getUrl` with file type
3. **Upload File**: PUT file to upload URL
4. **Get Resource URL**: Receive resource URL from upload response
5. **Calculate Schedule**: Get scheduled time from scheduler
6. **Create Task**: Call `/open/v1/task/add` with task data
7. **Log to Database**: Log post attempt to `post_logs` table
8. **Mark Template Used**: Update template with usage metadata

---

## API Integration

### GeeLark API Endpoints

#### 1. Get Upload URL
**Endpoint**: `POST /open/v1/upload/getUrl`

**Request**:
```json
{
  "fileType": "mp4"
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "uploadUrl": "https://storage.geelark.com/upload/...",
    "resourceUrl": "https://storage.geelark.com/resource/..."
  }
}
```

**File Types**: `mp4`, `mov`, `jpg`, `png`, `webp`, `mp3`, `aac`

#### 2. Upload File
**Method**: `PUT`

**URL**: From `uploadUrl` in previous response

**Body**: Binary file data

**Headers**: 
- `Content-Type`: Auto-detected or specified
- No authentication required (pre-signed URL)

**Response**: 
- `200` or `201`: Success
- Other: Error

#### 3. Create Video Task
**Endpoint**: `POST /open/v1/task/add`

**Request**:
```json
{
  "taskType": 1,
  "planName": "auto-plan",
  "list": [
    {
      "scheduleAt": 1234567890,
      "envId": "env_123",
      "video": "https://storage.geelark.com/resource/...",
      "videoDesc": "Caption text with hashtags",
      "needShareLink": false,
      "markAI": false
    }
  ]
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "taskIds": ["task_123", "task_456"]
  }
}
```

**Task Types**:
- `1`: Video task
- `2`: Carousel/slideshow task

#### 4. Create Carousel Task
**Endpoint**: `POST /open/v1/task/add`

**Request**:
```json
{
  "taskType": 2,
  "planName": "auto-plan",
  "list": [
    {
      "envId": "env_123",
      "action": "post",
      "duration": 9,
      "slides": [
        "https://storage.geelark.com/resource/slide1.jpg",
        "https://storage.geelark.com/resource/slide2.jpg"
      ],
      "videoDesc": "Caption text",
      "music": "https://storage.geelark.com/resource/music.mp3",
      "scheduleAt": 1234567890,
      "needShareLink": false,
      "markAI": false
    }
  ]
}
```

**Response**: Same as video task

**Action Values**: `"post"`, `"upload"`, `"share"`, `1`, `2` (auto-detected)

#### 5. List Cloud Phones
**Endpoint**: `POST /open/v1/phone/list`

**Request**:
```json
{
  "page": 1,
  "pageSize": 100,
  "serialName": "optional_filter",
  "groupName": "optional_filter",
  "tags": ["tag1", "tag2"]
}
```

**Response**:
```json
{
  "code": 0,
  "data": {
    "items": [...],
    "total": 100
  }
}
```

#### 6. List Environments
**Endpoint**: `GET /api/env` or `GET /open/v1/env`

**Response**:
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "env_123",
        "name": "Environment Name"
      }
    ]
  }
}
```

### API Response Format

All GeeLark API responses follow this format:

```json
{
  "code": 0,  // 0 = success, non-zero = error
  "msg": "Success message",
  "data": { ... }  // Response data
}
```

**Error Response**:
```json
{
  "code": 1001,
  "msg": "Error message",
  "data": null
}
```

---

## Authentication

### Key Verification Mode (with app_id)

**When Used**: When `GEELARK_APP_ID` is provided

**Headers**:
```
Content-Type: application/json
appId: {app_id}
traceId: {uuid}
ts: {timestamp_ms}
nonce: {6_char_string}
sign: {sha256_signature}
```

**Signature Generation**:
```python
sign = SHA256(appId + traceId + ts + nonce + apiKey).upper()
```

**Example**:
```python
app_id = "app_123"
trace_id = "550e8400-e29b-41d4-a716-446655440000"
ts = "1704067200000"  # milliseconds
nonce = "550e84"  # first 6 chars of trace_id without dashes
api_key = "key_abc123"

concat = f"{app_id}{trace_id}{ts}{nonce}{api_key}"
sign = hashlib.sha256(concat.encode()).hexdigest().upper()
```

### Token Verification Mode (without app_id)

**When Used**: When `GEELARK_APP_ID` is not provided (default)

**Headers**:
```
Authorization: Bearer {api_key}
Content-Type: application/json
traceId: {uuid}
```

**Example**:
```python
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "traceId": str(uuid.uuid4())
}
```

### Trace ID Generation

- **Format**: UUID v4 with dashes
- **Purpose**: Request tracking and debugging
- **Example**: `550e8400-e29b-41d4-a716-446655440000`

---

## Code Structure

### GeeLark Client (`geelark_client.py`)

**Key Classes**:
- `GeeLarkClient`: Main client class
- `GeeLarkError`: Custom exception

**Key Methods**:
- `__init__()`: Initialize client with API base, key, app_id
- `_headers()`: Generate authentication headers
- `_post()`: Make POST request with error handling
- `_get()`: Make GET request with error handling
- `get_upload_url()`: Get upload URL for file type
- `upload_file_via_put()`: Upload file via PUT
- `add_tasks()`: Create video/slideshow tasks
- `add_carousel_task()`: Create carousel task (with auto-detection)
- `list_phones()`: List cloud phones with filters
- `list_environments()`: List environments
- `infer_file_type()`: Detect file type from path

**Error Handling**:
- Detailed error messages with request/response
- JSON parsing errors handled
- HTTP status code checking
- API error code checking

### Scheduler (`scheduler.py`)

**Key Functions**:
- `get_scheduled_time()`: Get scheduled time for account
- `_get_random_time_in_window()`: Get random time in window

**Time Window Format**:
```json
{
  "start": "11:00",  // HH:MM format (Eastern Time)
  "end": "13:00"
}
```

**Time Zone Handling**:
- Input: Eastern Time (EST/EDT, UTC-5 approximation)
- Output: UTC timestamp
- Conversion: `scheduled_et.astimezone(timezone.utc)`

### Retry Logic (`retry.py`)

**Key Function**:
- `retry_with_backoff()`: Decorator for retry logic

**Parameters**:
- `max_retries`: Maximum retry attempts (default: 3)
- `initial_delay`: Initial delay in seconds (default: 1.0)
- `max_delay`: Maximum delay in seconds (default: 60.0)
- `backoff_factor`: Multiplier for delay (default: 2.0)
- `exceptions`: Tuple of exceptions to catch (default: Exception)

**Usage**:
```python
@retry_with_backoff(max_retries=3)
def upload_with_retry():
    return _upload_video(client, video_path)
```

### Database Logger (`db_logger.py`)

**Key Function**:
- `log_post()`: Log post attempt to database

**Log Entry Structure**:
```python
{
    "template_id": "template_123",
    "account_id": "account_001",
    "post_type": "video",
    "status": "success",
    "error_message": None,
    "scheduled_time": "2024-01-01T12:00:00Z",
    "render_path": "./output/video.mp4",
    "resource_url": "https://storage.geelark.com/resource/..."
}
```

### Supabase Client (`supabase_client.py`)

**Key Functions**:
- `get_supabase_client()`: Get client (returns None if not configured)
- `ensure_supabase_client()`: Get client (raises error if not configured)

**Environment Variables**:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (preferred)
- `SUPABASE_ANON_KEY`: Anon key (fallback)

---

## Database Schema

### Post Logs Table

```sql
CREATE TABLE post_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id TEXT REFERENCES templates(id),
  account_id TEXT REFERENCES accounts(id),
  post_type TEXT NOT NULL,                -- 'video', 'slideshow', 'carousel'
  status TEXT NOT NULL,                    -- 'success', 'failed'
  error_message TEXT,
  scheduled_time TIMESTAMPTZ,
  render_path TEXT,
  upload_asset_id TEXT,
  resource_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes**:
- `idx_post_logs_account_id`: On `account_id`
- `idx_post_logs_template_id`: On `template_id`
- `idx_post_logs_status`: On `status`
- `idx_post_logs_created_at`: On `created_at`

### Posting Schedules Table

```sql
CREATE TABLE posting_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id TEXT UNIQUE REFERENCES accounts(id),
  posts_per_day INTEGER NOT NULL DEFAULT 1,  -- 1 or 2
  time_windows JSONB NOT NULL,                -- Array of time windows
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Time Windows JSONB Format**:
```json
[
  {
    "start": "11:00",
    "end": "13:00"
  },
  {
    "start": "18:00",
    "end": "20:00"
  }
]
```

**Time Format**: `"HH:MM"` in 24-hour format (Eastern Time)

---

## Scheduling System

### Schedule Calculation Flow

1. **Query Database**: Get schedule for account from `posting_schedules` table
2. **Select Window**: Randomly select time window from array
3. **Calculate Time**: Pick random time within window
4. **Check Minimum**: Ensure minimum delay (default: 120 minutes)
5. **Convert Timezone**: Convert Eastern Time to UTC
6. **Return Timestamp**: Return Unix timestamp

### Time Window Logic

**Window Selection**:
- Random selection from available windows
- Each window has equal probability

**Time Selection**:
- Random uniform distribution within window
- Formula: `start_time + random(0, window_duration)`

**Minimum Delay**:
- Ensures posts aren't scheduled too soon
- Default: 120 minutes from now
- Applied after random selection

**Past Time Handling**:
- If window start is in past, move to next day
- If window end is before start, assume next day

### Fallback Behavior

**No Schedule Configured**:
- Uses default: 120 minutes from now
- No time window randomization

**Database Query Fails**:
- Logs warning
- Falls back to default

**Invalid Time Window**:
- Logs warning
- Falls back to default

---

## Retry Logic

### Exponential Backoff Algorithm

**Delay Calculation**:
```python
delay = initial_delay * (backoff_factor ^ attempt)
delay = min(delay, max_delay)
```

**Example** (initial_delay=1, backoff_factor=2, max_delay=60):
- Attempt 1: 0s (immediate)
- Attempt 2: 1s
- Attempt 3: 2s
- Attempt 4: 4s
- Attempt 5: 8s
- ... (capped at 60s)

### Retry Scope

**Retried Operations**:
- File uploads (PUT requests)
- Task creation (POST requests)
- Carousel slide uploads
- Music uploads

**Not Retried**:
- Configuration errors
- Authentication errors (after first attempt)
- Validation errors

### Error Logging

**Retry Attempts**:
- Logged as warnings
- Include attempt number and error message

**Final Failure**:
- Logged as error
- Exception raised with full error details

---

## Error Handling

### GeeLark API Errors

**Error Response Format**:
```json
{
  "code": 1001,
  "msg": "Error message",
  "data": null
}
```

**Common Error Codes**:
- `0`: Success
- `1001`: Authentication error
- `1002`: Invalid parameters
- `1003`: File upload error
- `1004`: Task creation error

**Error Handling**:
- Checks `code` field in response
- Raises `GeeLarkError` with detailed message
- Includes request URL, headers, body, and response

### Upload Errors

**HTTP Status Codes**:
- `200`, `201`: Success
- `400`: Bad request (file format, size)
- `401`: Authentication error
- `403`: Permission denied
- `500`: Server error

**Error Handling**:
- Checks status code
- Raises `GeeLarkError` with status and response text
- Retries with exponential backoff

### Network Errors

**Handled Exceptions**:
- `requests.exceptions.Timeout`
- `requests.exceptions.ConnectionError`
- `requests.exceptions.RequestException`

**Retry Behavior**:
- All network errors retried
- Exponential backoff applied
- Final error logged and raised

---

## Performance Considerations

### Upload Performance

- **Timeout**: 120 seconds for large files
- **Chunked Upload**: Not currently implemented (can be added)
- **Parallel Uploads**: Not currently parallelized (can be improved)

### API Rate Limiting

- **No Built-in Rate Limiting**: GeeLark API may have rate limits
- **Recommendation**: Add delays between requests if needed
- **Batch Operations**: Task creation supports multiple tasks per request

### Database Performance

- **Indexes**: Post logs table has indexes on common query fields
- **Batch Inserts**: Single insert per post (can be batched)
- **Query Optimization**: Schedule queries use indexed `account_id`

### Memory Management

- **File Uploads**: Files read in chunks (via `open()`)
- **No Memory Buffering**: Files streamed directly to API
- **Temporary Files**: No temporary files created for uploads

---

## Troubleshooting

### Authentication Errors

#### "API error: code=1001"
- **Check**: API key is correct
- **Check**: App ID matches API key (if using key verification)
- **Check**: API key has required permissions
- **Solution**: Regenerate API key if needed

#### "Non-JSON response"
- **Check**: API base URL is correct
- **Check**: Network connection
- **Check**: GeeLark API status
- **Solution**: Verify API endpoint is accessible

### Upload Errors

#### "Upload failed: 400"
- **Check**: File format is supported
- **Check**: File size within limits
- **Check**: File is not corrupted
- **Solution**: Verify file format and size

#### "Upload failed: 401"
- **Check**: Upload URL is valid (not expired)
- **Check**: Upload URL from recent request
- **Solution**: Get new upload URL

#### "Upload failed: 403"
- **Check**: File permissions
- **Check**: Storage quota
- **Solution**: Check GeeLark account limits

### Task Creation Errors

#### "API error: code=1002"
- **Check**: Required fields are present
- **Check**: Field values are valid
- **Check**: Environment ID and cloud phone ID are correct
- **Solution**: Verify task data structure

#### "Action must be one of..."
- **Check**: Carousel task action value
- **Solution**: Code auto-detects action, but may need manual override

### Scheduling Errors

#### "Failed to get schedule"
- **Check**: `posting_schedules` table exists
- **Check**: Account ID exists in table
- **Check**: Time windows format is valid JSON
- **Solution**: Verify database schema and data

#### "Invalid time window"
- **Check**: Time format is "HH:MM"
- **Check**: Start time is before end time (or next day)
- **Solution**: Fix time window format

### Database Errors

#### "Supabase not configured"
- **Check**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- **Check**: Environment variables are loaded
- **Solution**: Set environment variables in `.env` file

#### "Failed to log post"
- **Check**: Database connection
- **Check**: `post_logs` table exists
- **Check**: Table permissions
- **Solution**: Verify database schema and permissions

---

## Future Roadmap

### Q1 2024
- ✅ Basic upload and task creation
- ✅ Scheduling with time windows
- ✅ Retry logic with exponential backoff
- ✅ Database logging

### Q2 2024
- Task status monitoring
- Better error handling
- Schedule management UI
- Analytics and reporting

### Q3 2024
- Advanced scheduling (day of week, time zones)
- Task queue management
- Webhook integration
- Performance optimization

### Q4 2024
- Multi-account management
- Content validation
- Post preview
- Automation triggers

---

*For user-facing documentation, see [GEELARK_AUTOPOST_USER_GUIDE.md](./GEELARK_AUTOPOST_USER_GUIDE.md)*

*Last Updated: [Current Date]*
*Version: 1.0.0*
