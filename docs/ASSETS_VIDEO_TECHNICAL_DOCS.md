# Assets Processing & Video Generation Technical Documentation

## Table of Contents
1. [Setup & Installation](#setup--installation)
2. [Technical Architecture](#technical-architecture)
3. [File Structure](#file-structure)
4. [Technology Stack](#technology-stack)
5. [Database Schema](#database-schema)
6. [Configuration](#configuration)
7. [Code Structure](#code-structure)
8. [API Integration](#api-integration)
9. [Performance Considerations](#performance-considerations)
10. [Troubleshooting](#troubleshooting)
11. [Future Roadmap](#future-roadmap)

---

## Setup & Installation

### Prerequisites

- **Python 3.8+**: Required for Python CLI
- **ffmpeg**: Required for video processing
  - Windows: Download from https://ffmpeg.org/download.html
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg`
- **Supabase Account**: For database and storage
- **GeeLark API Key**: For posting automation

### Installation Steps

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   Key dependencies:
   - `Pillow>=10.0.0` - Image processing
   - `supabase` - Database client
   - `typer` - CLI framework
   - `rich` - Console output
   - `pyyaml` - Config file parsing
   - `requests` - HTTP requests
   - `python-dotenv` - Environment variables

2. **Set Environment Variables**:
   Create `.env` file in project root:
   ```bash
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GEELARK_API_KEY=your_geelark_api_key
   GEELARK_API_BASE=https://openapi.geelark.com
   GEELARK_APP_ID=your_app_id  # Optional
   FONT_PATH=./fonts/AutourOne-Regular.ttf  # Optional
   ```

3. **Verify ffmpeg Installation**:
   ```bash
   ffmpeg -version
   ```

4. **Create Config File**:
   ```bash
   python -m src.cli generate-config --output config.yaml
   ```

   Or create manually (see Configuration section).

---

## Technical Architecture

### Component Overview

```
┌─────────────────┐
│  Supabase DB    │
│                 │
│  - assets       │
│  - templates    │
│  - accounts     │
│  - post_logs    │
└────────┬────────┘
         │
         │ Read/Write
         │
┌────────▼────────┐
│  Python CLI     │
│                 │
│  ┌───────────┐  │
│  │ Asset     │  │
│  │ Processor │  │
│  └───────────┘  │
│                 │
│  ┌───────────┐  │
│  │ Video     │  │
│  │ Generator │  │
│  └───────────┘  │
│                 │
│  ┌───────────┐  │
│  │ Template  │  │
│  │ Manager   │  │
│  └───────────┘  │
└────────┬────────┘
         │
         │ Upload & Post
         │
┌────────▼────────┐
│  GeeLark API    │
│                 │
│  - Upload       │
│  - Task Create  │
│  - Scheduling   │
└─────────────────┘
```

### Processing Flow

#### Asset Processing Flow
1. Query Supabase for unprocessed assets (`file_hash IS NULL`)
2. For each asset:
   - Download image from URL
   - Extract metadata using PIL
   - Calculate MD5 hash
   - Determine category/subcategory from search query
   - Update database with metadata
3. Clean up temporary files

#### Video Generation Flow
1. Load config and templates
2. Filter accounts by persona
3. For each account:
   - Select unused template
   - Resolve base video path
   - Render video/slideshow/carousel
   - Upload to GeeLark
   - Create posting task
   - Log to database
   - Mark template as used

---

## File Structure

```
src/
├── __init__.py
├── cli.py                    # Main CLI entry point
├── config.py                 # Configuration loading
├── process_assets.py         # Asset processing logic
├── video_overlay.py          # Video text overlay
├── slideshow_renderer.py     # Slideshow/carousel rendering
├── text_overlay.py           # Text overlay utilities
├── templates.py              # Template management
├── geelark_client.py         # GeeLark API client
├── supabase_client.py        # Supabase client
├── diversifier.py            # Content diversification
├── scheduler.py              # Posting schedule logic
├── db_logger.py              # Database logging
├── db_export.py              # Template export
├── db_config.py              # Config generation
├── retry.py                  # Retry logic
└── generate_pastel_backgrounds.py  # Background generation

fonts/                        # Font files for text overlay
input/
├── templates.jsonl          # Template library
└── videos/
    └── base_video.mp4       # Default base video
output/                       # Rendered videos
config.yaml                   # Application config
```

---

## Technology Stack

### Core Technologies
- **Python 3.8+**: Main language
- **ffmpeg**: Video processing (via subprocess)
- **PIL (Pillow)**: Image processing
- **Supabase Python Client**: Database operations
- **Typer**: CLI framework
- **Rich**: Terminal UI and formatting

### Key Libraries
- **requests**: HTTP requests for image downloads
- **pyyaml**: YAML config parsing
- **python-dotenv**: Environment variable management
- **hashlib**: MD5 hash calculation
- **json**: JSON parsing for templates
- **tempfile**: Temporary file management
- **subprocess**: ffmpeg execution

---

## Database Schema

### Assets Table

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,                    -- Public URL from Supabase Storage
  storage_path TEXT,                     -- Path in storage bucket
  fandom TEXT,                           -- Detected fandom
  tags TEXT[] DEFAULT '{}',             -- Array of tags
  metadata JSONB DEFAULT '{}',           -- Additional metadata
  search_query TEXT,                     -- Primary search query
  file_hash TEXT,                        -- MD5 hash (for deduplication)
  width INTEGER,                         -- Image width in pixels
  height INTEGER,                        -- Image height in pixels
  aspect_ratio DECIMAL,                  -- Width/height ratio
  category TEXT,                          -- Main category (e.g., 'lads', 'jjk')
  subcategory TEXT,                      -- Subcategory (e.g., 'lads_xavier')
  character TEXT,                        -- Detected character name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Metadata JSONB Structure**:
```json
{
  "source_url": "https://www.pinterest.com/pin/123456789/",
  "description": "Image description",
  "source_type": "pinterest" | "google_images",
  "search_terms": ["love and deep space", "xavier"],
  "character": "xavier"
}
```

### Templates Table

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  persona TEXT NOT NULL,
  fandom TEXT NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'T0',  -- T0, T1, T2
  overlay JSONB NOT NULL,                 -- Array of strings
  caption TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  used JSONB,                             -- null or UsedMeta object
  carousel_type TEXT,                     -- Optional: 'character_grid'
  grid_images INTEGER,                    -- Optional: 4 for 2x2 grid
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Used JSONB Structure**:
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "account_id": "account_001",
  "account_display_name": "Account Name",
  "cloud_phone_id": "phone_123",
  "status": "success" | "failed",
  "error_message": "Error details if failed"
}
```

### Accounts Table

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  env_id TEXT NOT NULL,
  cloud_phone_id TEXT NOT NULL,
  persona TEXT NOT NULL,
  preferred_fandoms TEXT[] DEFAULT '{}',
  preferred_intensity TEXT,
  video_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Post Logs Table

```sql
CREATE TABLE post_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  post_type TEXT NOT NULL,                -- 'video', 'slideshow', 'carousel'
  status TEXT NOT NULL,                    -- 'success', 'failed'
  scheduled_time TIMESTAMPTZ,
  render_path TEXT,
  resource_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Configuration

### Config File Structure (config.yaml)

```yaml
geelark:
  api_base: "https://openapi.geelark.com"
  api_key: "${GEELARK_API_KEY}"  # Can use env var

posting:
  schedule_in_minutes: 120  # Time window for posting (1-2 posts per day)
  need_share_link: false
  mark_ai: false

overlay:
  font_path: "./fonts/AutourOne-Regular.ttf"
  font_size: 60
  color: "#ffffff"
  stroke_color: "#000000"
  stroke_width: 12
  position: "bottom"  # "center" | "bottom"
  padding: 600
  wrap_width_chars: 18

template_library:
  path: "./input/templates.jsonl"
  persona: "anime_otome"
  intensity_weights:
    T0: 1.0
    T1: 1.0
    T2: 0.5

accounts:
  - id: "account_001"
    display_name: "Account Name"
    env_id: "env_123"
    cloud_phone_id: "phone_123"
    persona: "anime_otome"
    preferred_fandoms: ["lads", "genshin_impact"]
    preferred_intensity: "T0"
    video_source: "./input/videos/base_video.mp4"
```

### Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for admin operations)
- `GEELARK_API_KEY`: GeeLark API key (required)
- `GEELARK_API_BASE`: GeeLark API base URL (default: https://openapi.geelark.com)
- `GEELARK_APP_ID`: GeeLark app ID (optional)
- `FONT_PATH`: Path to font file (optional, can be set in config)

---

## Code Structure

### Asset Processing (`process_assets.py`)

**Key Functions**:
- `process_asset()`: Process single asset
  - Downloads image
  - Extracts metadata
  - Updates database
- `process_all_assets()`: Batch processing
  - Queries unprocessed assets
  - Processes in batches
  - Shows progress and summary
- `generate_metadata()`: Extract metadata from image
  - Dimensions, aspect ratio
  - MD5 hash
  - Category/subcategory detection
- `find_category_from_search_term()`: Map search term to category
- `extract_character_name()`: Extract character from text

**Character Lists**: Defined per fandom with aliases support

### Video Overlay (`video_overlay.py`)

**Key Functions**:
- `overlay_text_on_video()`: Main overlay function
  - Creates text file for ffmpeg
  - Builds drawtext filter
  - Applies diversification filters
  - Executes ffmpeg command
- `_build_drawtext_filter()`: Build ffmpeg filter string
- `_hex_to_ffmpeg_color()`: Convert hex to ffmpeg color format

**FFmpeg Filter**:
```
drawtext=fontfile=...:textfile=...:fontsize=...:fontcolor=...:borderw=...:bordercolor=...:x=...:y=...
```

### Slideshow Renderer (`slideshow_renderer.py`)

**Key Functions**:
- `render_slideshow()`: Create slideshow from images
  - Creates individual slide videos
  - Concatenates slides
  - Adds audio if provided
- `render_carousel()`: Create carousel with first text slide
  - Creates text-only first slide
  - Creates image slides
  - Supports grid mode (2x2)
  - Concatenates into final video
- `_create_image_with_text()`: Create video from image with text
- `_create_text_only_slide()`: Create text-only slide
- `_create_4_image_grid()`: Create 2x2 grid layout

**Grid Layout**:
- 4 images arranged in 2x2 grid
- Border between images
- Optional character name overlay
- Supports multiples of 4 images

### Template Management (`templates.py`)

**Key Classes**:
- `Template`: Template data structure
- `TemplateLibrary`: Template collection and selection
- `UsedMeta`: Usage metadata

**Key Methods**:
- `TemplateLibrary.load()`: Load from JSONL
- `TemplateLibrary.choose()`: Select unused template
- `TemplateLibrary.mark_used()`: Mark template as used
- `TemplateLibrary.save()`: Save to JSONL

**Selection Logic**:
1. Filter by persona
2. Apply fandom preferences
3. Filter by intensity
4. Weighted random selection

### CLI (`cli.py`)

**Commands**:
- `autopost`: Main posting command
- `process-assets`: Asset processing
- `overlay-video`: Single video overlay
- `export-templates`: Export templates
- `generate-config`: Generate config from DB
- `list-envs`: List GeeLark environments
- `reset-assets`: Reset processed assets

**Main Flow** (`autopost`):
1. Load config and templates
2. Filter accounts
3. For each account:
   - Select template
   - Resolve base video
   - Render video/slideshow/carousel
   - Upload to GeeLark
   - Create task
   - Log to database
4. Save templates

### GeeLark Client (`geelark_client.py`)

**Key Methods**:
- `get_upload_url()`: Get upload URL for file
- `upload_file_via_put()`: Upload file via PUT
- `add_tasks()`: Create posting tasks
- `add_carousel_task()`: Create carousel task
- `list_phones()`: List cloud phones
- `list_environments()`: List environments

**API Integration**:
- Uses requests library
- Handles authentication
- Error handling and retries

---

## API Integration

### GeeLark API

#### Upload File
1. Call `GET /open/v1/resource/uploadUrl` with file type
2. Receive upload URL and resource URL
3. Upload file via PUT to upload URL
4. Use resource URL in task creation

#### Create Video Task
```json
POST /open/v1/task/add
{
  "taskType": 1,  // 1 = video
  "planName": "auto-plan",
  "tasks": [{
    "scheduleAt": 1234567890,
    "envId": "env_123",
    "video": "resource_url",
    "videoDesc": "caption text",
    "needShareLink": false,
    "markAI": false
  }]
}
```

#### Create Carousel Task
```json
POST /open/v1/task/addCarousel
{
  "planName": "auto-plan",
  "slideUrls": ["url1", "url2", "url3"],
  "caption": "caption text",
  "musicUrl": "optional_music_url",
  "envId": "env_123",
  "cloudPhoneId": "phone_123",
  "scheduleAt": 1234567890,
  "needShareLink": false,
  "markAI": false
}
```

### Supabase API

#### Query Assets
```python
supabase.table('assets').select('*').is_('file_hash', 'null').execute()
```

#### Update Asset
```python
supabase.table('assets').update({
    'file_hash': hash,
    'width': width,
    'height': height,
    'category': category,
    'subcategory': subcategory
}).eq('id', asset_id).execute()
```

#### Query Templates
```python
supabase.table('templates').select('*').eq('persona', persona).execute()
```

#### Update Template
```python
supabase.table('templates').update({
    'used': used_meta_dict
}).eq('id', template_id).execute()
```

---

## Performance Considerations

### Asset Processing
- **Batch Size**: Processes in batches of 10 with 2s delay
- **Temporary Files**: Downloads to temp directory, cleaned up after processing
- **Database Updates**: Single update per asset
- **Rate Limiting**: 2 second delay every 10 assets

### Video Rendering
- **ffmpeg Preset**: Uses "veryfast" preset for speed
- **CRF**: Uses CRF 18 for quality/size balance
- **Parallel Processing**: Not currently parallelized (can be improved)
- **Temporary Files**: Uses temp directory for intermediate files

### Memory Management
- **Image Processing**: Images loaded into memory temporarily
- **Video Processing**: ffmpeg handles video in chunks
- **Cleanup**: Temporary files cleaned up after processing

### Optimization Tips
- Use SSD for faster I/O
- Process assets in smaller batches if memory constrained
- Use faster ffmpeg presets for testing (veryfast)
- Cache processed metadata to avoid reprocessing

---

## Troubleshooting

### Asset Processing Issues

#### "ffmpeg not found"
- **Solution**: Install ffmpeg and ensure it's in PATH
- **Verify**: Run `ffmpeg -version`

#### "Failed to download image"
- **Check**: Image URL is accessible
- **Check**: Network connection
- **Check**: Supabase Storage bucket permissions

#### "Category not detected"
- **Check**: Search query in metadata
- **Check**: Character lists in `process_assets.py`
- **Solution**: Update `SEARCH_QUERY_MAP` or character lists

### Video Rendering Issues

#### "ffmpeg failed with code X"
- **Check**: ffmpeg stderr output for details
- **Common Issues**:
  - Font file not found
  - Invalid video format
  - Insufficient disk space
  - Windows path escaping issues

#### "Text not appearing on video"
- **Check**: Font file path is correct
- **Check**: Text file encoding (UTF-8)
- **Check**: Text color contrast
- **Check**: Text position (may be off-screen)

#### "Video dimensions not divisible by 2"
- **Solution**: Code includes scale filter to fix this
- **Check**: ffmpeg version (should be recent)

### Template Issues

#### "No unused templates left"
- **Solution**: Reset used templates or add new templates
- **Check**: Template persona matches account persona
- **Check**: Template intensity weights

#### "Template selection failed"
- **Check**: Template file exists and is valid JSONL
- **Check**: Template structure matches expected format
- **Check**: Template persona matches

### GeeLark API Issues

#### "Upload failed"
- **Check**: GeeLark API key is valid
- **Check**: File size limits
- **Check**: Network connection
- **Solution**: Retry with exponential backoff (already implemented)

#### "Task creation failed"
- **Check**: Environment ID and cloud phone ID are correct
- **Check**: Schedule time is in future
- **Check**: Resource URL is valid
- **Check**: GeeLark API response for error details

### Database Issues

#### "Supabase connection failed"
- **Check**: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- **Check**: Network connection
- **Check**: Supabase project is active

#### "Update failed"
- **Check**: Asset/template ID exists
- **Check**: Database permissions
- **Check**: RLS policies (if enabled)

---

## Future Roadmap

### Q1 2024
- ✅ Asset processing automation
- ✅ Video overlay system
- ✅ Slideshow/carousel rendering
- ✅ Template management

### Q2 2024
- Asset selection automation
- Template-asset matching
- GUI dashboard for asset processing
- Advanced video effects

### Q3 2024
- Parallel processing
- Performance optimization
- Advanced carousel features
- Analytics and reporting

### Q4 2024
- Machine learning for asset selection
- Advanced video effects
- Real-time processing
- Cloud deployment

---

*For user-facing documentation, see [ASSETS_VIDEO_USER_GUIDE.md](./ASSETS_VIDEO_USER_GUIDE.md)*

*Last Updated: [Current Date]*
*Version: 1.0.0*
