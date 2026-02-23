# Assets Processing & Video Generation User Guide

## Table of Contents
1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Current Features](#current-features)
4. [Usage Guide](#usage-guide)
5. [Current Limitations & Improvements Needed](#current-limitations--improvements-needed)

---

## Overview

The assets processing and video generation system is responsible for:
- **Processing scraped assets**: Downloading images, extracting metadata (dimensions, hash, category), and organizing them
- **Video generation**: Creating TikTok-ready videos with text overlays, slideshows, and carousels
- **Template management**: Managing content templates for automated posting
- **Posting automation**: Uploading videos to GeeLark API for scheduled TikTok posting

### System Architecture

```
┌─────────────────┐
│  Scraped Assets │
│  (Supabase DB)  │
└────────┬────────┘
         │
         │ Process Assets
         │
┌────────▼────────┐
│ Asset Processor │
│  (Python CLI)   │
│                 │
│  - Download     │
│  - Extract      │
│  - Categorize   │
└────────┬────────┘
         │
         │ Organized Assets
         │
┌────────▼────────┐
│ Video Generator │
│  (Python CLI)   │
│                 │
│  - Overlay      │
│  - Slideshow    │
│  - Carousel     │
└────────┬────────┘
         │
         │ Rendered Videos
         │
┌────────▼────────┐
│  GeeLark API    │
│  (Posting)      │
└─────────────────┘
```

### Data Flow

1. **Assets Scraped**: Chrome extension uploads images to Supabase
2. **Asset Processing**: Dashboard automatically processes assets during upload (extracts dimensions, hash, categorizes)
3. **Template Selection**: System selects unused template based on persona, fandom, intensity
4. **Video Rendering**: System renders video/slideshow/carousel with text overlay
5. **Upload & Post**: Video uploaded to GeeLark, scheduled for posting
6. **Logging**: Post status logged to database

---

## How It Works

### Asset Processing Workflow

1. **Download Image**: Script downloads image from Supabase Storage URL
2. **Extract Metadata**:
   - Image dimensions (width, height)
   - Aspect ratio
   - MD5 file hash (for deduplication)
   - Category/subcategory (based on search query)
   - Character name (if detected)
3. **Update Database**: Metadata saved to assets table
4. **Organization**: Assets organized by category/subcategory for easy filtering

### Video Generation Workflow

#### For Regular Videos:
1. **Template Selection**: System selects unused template matching persona/fandom
2. **Base Video**: Uses account's video source or default video
3. **Text Overlay**: Overlays template text on video using ffmpeg
4. **Rendering**: Creates MP4 video with text overlay
5. **Upload**: Uploads to GeeLark API
6. **Scheduling**: Schedules post with time window (1-2 posts per day)

#### For Slideshows:
1. **Template Selection**: Selects template with multiple overlay lines
2. **Image Selection**: User provides images matching overlay line count
3. **Slide Creation**: Each image becomes a slide with text overlay
4. **Concatenation**: Slides concatenated into single video
5. **Audio** (optional): Adds background music if provided
6. **Upload & Post**: Uploads and schedules

#### For Carousels:
1. **Template Selection**: Selects carousel template
2. **First Slide**: Creates text-only slide (e.g., "Your month", "Your {character} character")
3. **Image Slides**: Creates slides from provided images
   - **Normal Mode**: Each image with text overlay
   - **Grid Mode**: 4 images arranged in 2x2 grid with borders
4. **Concatenation**: All slides concatenated into video
5. **Upload**: Uploads all slides as images to GeeLark (carousel format)
6. **Post**: Creates carousel post with all slides

### Template System

Templates define the content structure:
- **ID**: Unique identifier
- **Persona**: Content persona (e.g., "anime_otome")
- **Fandom**: Target fandom (e.g., "lads", "genshin_impact")
- **Intensity**: Content intensity level (T0, T1, T2)
- **Overlay**: Array of text lines to overlay
- **Caption**: Post caption text
- **Tags**: Hashtags for the post
- **Used**: Metadata when template was used (prevents reuse)

Templates are selected based on:
- Persona matching
- Fandom preferences
- Intensity preferences
- Random selection with weights

---

## Current Features

### Asset Processing Features

#### 1. Metadata Extraction
- **Image Dimensions**: Width, height, aspect ratio
- **File Hash**: MD5 hash for deduplication
- **Category Detection**: Automatically categorizes based on search query
  - Categories: `lads`, `jjk`, `genshin`, `generic_anime`, `stores`, `uncategorized`
- **Subcategory Detection**: More specific categorization
  - Examples: `lads_xavier`, `jujutsu_kaisen`, `genshin_impact`
- **Character Detection**: Extracts character names from search queries
  - Supports aliases (e.g., "xav" → "xavier")
  - Character lists per fandom

#### 2. Batch Processing
- Processes all unprocessed assets automatically
- Skips already processed assets (checks for `file_hash`)
- Progress tracking with rich console output
- Category breakdown summary

#### 3. Single Asset Processing
- Process specific asset by ID
- Useful for debugging or reprocessing

### Video Generation Features

#### 1. Video Overlay
- **Text Overlay**: Overlays text on base video
- **Font Customization**: Custom fonts, sizes, colors
- **Positioning**: Center or bottom positioning
- **Text Wrapping**: Automatic word wrapping
- **Stroke/Outline**: Text stroke for readability
- **Diversification**: Random variations (position, font size, padding)

#### 2. Slideshow Rendering
- **Multiple Slides**: Creates slideshow from multiple images
- **Text Overlay**: Each slide can have different text
- **Slide Duration**: Configurable duration per slide (default: 3 seconds)
- **Transitions**: Smooth transitions between slides
- **Audio Support**: Optional background music

#### 3. Carousel Rendering
- **Text-Only First Slide**: Creates introductory slide
- **Image Slides**: Multiple image slides
- **Grid Mode**: 2x2 grid layout for 4 images per slide
- **Character Substitution**: Replaces `{character}` placeholder
- **Multi-Character Support**: Supports multiple characters in one carousel
- **Audio Support**: Optional background music

#### 4. Content Diversification
- **Video Filters**: Random zoom, brightness, contrast, saturation, noise
- **Speed Variation**: Slight speed adjustments
- **Position Randomization**: Text position variations
- **Font Size Variation**: Random font size adjustments
- **Tag Randomization**: Random tag combinations from pools

### Template Management Features

#### 1. Template Library
- Loads templates from JSONL file
- Tracks used templates
- Prevents template reuse
- Saves usage metadata

#### 2. Template Selection
- **Persona Matching**: Only selects templates for specified persona
- **Fandom Preferences**: Prioritizes preferred fandoms
- **Intensity Filtering**: Filters by preferred intensity
- **Weighted Random**: Uses intensity weights for selection

#### 3. Template Export
- Export templates from Supabase to JSONL
- Filter by persona
- Include/exclude used templates

### Posting Features

#### 1. GeeLark Integration
- **Video Upload**: Uploads videos to GeeLark storage
- **Carousel Upload**: Uploads carousel slides as images
- **Task Creation**: Creates posting tasks
- **Scheduling**: Schedules posts with time windows

#### 2. Retry Logic
- **Exponential Backoff**: Retries failed uploads with backoff
- **Max Retries**: Configurable retry attempts (default: 3)
- **Error Handling**: Logs errors for debugging

#### 3. Database Logging
- **Post Logs**: Logs all posts to database
- **Success/Failure Tracking**: Tracks post status
- **Error Messages**: Stores error messages for failed posts
- **Scheduled Times**: Records scheduled posting times

---

## Usage Guide

### Asset Processing

**Asset processing is now automatic!** When images are uploaded through the extension, the dashboard automatically:
1. Extracts image dimensions (width, height)
2. Calculates aspect ratio
3. Computes MD5 file hash for deduplication
4. Determines category/subcategory from search query
5. Stores all metadata in the database

No manual processing step is needed. All metadata is available immediately after upload.

#### Resetting Processed Assets (for old assets)

If you need to reprocess old assets with updated categorization logic:

```bash
python -m src.cli reset-assets --category uncategorized
```

This clears the metadata for selected assets so they can be reprocessed. Note: New uploads are automatically processed, so this is mainly for old assets.

### Generating Videos

#### Regular Video Post
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type video \
  --default-video ./input/videos/base_video.mp4
```

#### Slideshow Post
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type slideshow \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg,./assets/img3.jpg
```

#### Carousel Post (Normal Mode)
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type carousel \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg,./assets/img3.jpg \
  --character-name xavier
```

#### Carousel Post (Grid Mode)
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type carousel \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg,./assets/img3.jpg,./assets/img4.jpg \
  --character-name xavier
```

**Note**: Grid mode requires multiples of 4 images (4, 8, 12, etc.)

#### Carousel with Music
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type carousel \
  --slide-images ./assets/img1.jpg,./assets/img2.jpg \
  --music-path ./audio/background.mp3
```

### Template Management

#### Export Templates
```bash
python -m src.cli export-templates \
  --output input/templates.jsonl \
  --persona anime_otome
```

#### Generate Config from Database
```bash
python -m src.cli generate-config \
  --output config.yaml \
  --persona anime_otome
```

### Dry Run (Test Without Posting)
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --post-type video \
  --dry-run
```

### Filter by Account
```bash
python -m src.cli autopost \
  --config-path ./config.yaml \
  --account-id account_001 \
  --post-type video
```

### Best Practices

- **Asset Processing**: Run regularly to process new scraped assets
- **Template Management**: Export templates before making changes
- **Video Sources**: Use high-quality base videos for best results
- **Image Selection**: Use images matching template overlay line count
- **Grid Mode**: Ensure images are similar aspect ratios for grid layout
- **Testing**: Always use `--dry-run` first to test rendering
- **Backup**: Keep backups of templates and config files

---

## Current Limitations & Improvements Needed

### 🔴 Critical Improvements

#### 1. Asset Selection for Video Generation
**Current State**: 
- User must manually provide image paths for slideshows/carousels
- No automatic asset selection based on template requirements
- No filtering by category/character for asset selection

**Improvement Needed**:
- Add automatic asset selection based on template fandom/character
- Filter assets by category/subcategory
- Support asset selection queries (e.g., "lads xavier", "genshin zhongli")
- Integration with dashboard asset browser

#### 2. Template-Asset Matching
**Current State**:
- Templates and assets are separate
- No automatic matching between template requirements and available assets
- Manual process to find suitable assets

**Improvements Needed**:
- Auto-match templates with available assets
- Filter assets by template fandom/character
- Suggest assets for templates
- Validate asset availability before rendering

#### 3. Batch Asset Processing UI
**Current State**:
- Asset processing is CLI-only
- No visual feedback during processing
- No ability to pause/resume processing

**Improvements Needed**:
- Add GUI dashboard for asset processing
- Show processing progress visually
- Allow pause/resume functionality
- Show processing statistics

### 🟡 Medium Priority Improvements

#### 4. Advanced Video Effects
- More transition effects between slides
- Animation effects for text overlay
- Video filters and effects
- Custom transition durations

#### 5. Asset Quality Control
- Minimum image dimensions filter
- Aspect ratio validation
- Image quality scoring
- Duplicate detection and removal

#### 6. Template Validation
- Validate template structure
- Check for required fields
- Validate overlay line counts
- Template preview before use

#### 7. Better Error Handling
- More detailed error messages
- Error recovery suggestions
- Retry failed asset processing
- Error logging and reporting

#### 8. Performance Optimization
- Parallel asset processing
- Batch database updates
- Caching processed metadata
- Optimize video rendering

### 🟢 Nice-to-Have Improvements

#### 9. Asset Tagging UI
- Visual tag editor
- Bulk tagging operations
- Tag suggestions
- Tag validation

#### 10. Video Preview
- Preview rendered videos before posting
- Preview slideshow/carousel
- Preview with different templates

#### 11. Advanced Carousel Features
- Custom grid layouts (3x3, 4x4)
- Mixed content types (images + videos)
- Interactive carousel elements
- Custom slide transitions

#### 12. Analytics & Reporting
- Asset processing statistics
- Video generation metrics
- Template usage analytics
- Post success rate tracking

#### 13. Asset Organization
- Automatic folder organization
- Category-based file structure
- Asset collections/albums
- Asset search and filtering

---

*For technical setup and implementation details, see [ASSETS_VIDEO_TECHNICAL_DOCS.md](./ASSETS_VIDEO_TECHNICAL_DOCS.md)*
