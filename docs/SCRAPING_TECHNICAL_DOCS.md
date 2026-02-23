# Scraping System Technical Documentation

## Table of Contents
1. [Setup & Installation](#setup--installation)
2. [Technical Architecture](#technical-architecture)
3. [File Structure](#file-structure)
4. [Technology Stack](#technology-stack)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Extension Details](#extension-details)
8. [Performance Considerations](#performance-considerations)
9. [Security Considerations](#security-considerations)
10. [Troubleshooting](#troubleshooting)
11. [Future Roadmap](#future-roadmap)
12. [Contributing](#contributing)

---

## Setup & Installation

### Dashboard Setup

1. **Install Dependencies**:
   ```bash
   cd dashboard
   npm install
   ```

2. **Configure Supabase**:
   - Create Supabase project at https://supabase.com
   - Run migrations from `supabase/migrations/` in Supabase SQL Editor:
     - `001_initial_schema.sql`
     - `002_user_profiles.sql`
     - `003_seed_test_user.sql` (optional)
     - `004_seed_user_simple.sql` (optional)
     - `005_add_scraping_source_type.sql`
     - `006_fix_rls_policies.sql`
     - `008_reset_uncategorized_assets.sql` (optional)
   - Create Storage bucket named `assets` in Supabase Storage
   - Get Supabase URL and anon key from Project Settings > API

3. **Environment Variables**:
   Create `.env.local` in the `dashboard` directory:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```

5. **Access Dashboard**:
   - Open [http://localhost:3000](http://localhost:3000)
   - Navigate to `/scraping` to start scraping jobs

### Extension Setup

1. **Load Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder from the project root

2. **Configure Extension**:
   - Click the extension icon in Chrome toolbar
   - Click "Options" (or right-click extension → Options)
   - Enter your Dashboard URL:
     - Local development: `http://localhost:3000`
     - Production: Your deployed dashboard URL
   - API Key is optional for local development (leave empty)

3. **Verify Connection**:
   - Check extension popup for status
   - Open browser console (F12) to see polling logs
   - Extension should show "Ready" status
   - Check extension background console: `chrome://extensions/` → Find "GeeLark Asset Scraper" → Click "service worker" → Check console logs

---

## Technical Architecture

### Component Overview

```
┌─────────────────┐
│   Dashboard     │
│  (Next.js App)  │
│                 │
│  - Scraping UI  │
│  - Job Control  │
│  - Asset View   │
└────────┬────────┘
         │
         │ HTTP API
         │
┌────────▼────────┐
│  API Endpoints  │
│                 │
│  /api/scraping/ │
│  /api/assets/   │
└────────┬────────┘
         │
         │ Polling (1s interval)
         │
┌────────▼────────┐
│ Chrome Extension│
│                 │
│  - Background   │
│  - Content      │
│  - Popup        │
└────────┬────────┘
         │
         │ DOM Scraping
         │
┌────────▼────────┐
│  Pinterest/     │
│  Google Images  │
└─────────────────┘
```

### Communication Flow

1. **Trigger Creation**: Dashboard POSTs to `/api/scraping/trigger`
2. **Polling**: Extension polls `/api/scraping/trigger` every 1 second
3. **Trigger Detection**: Extension receives trigger data
4. **Tab Management**: Extension opens tabs for each URL
5. **Content Script Injection**: Content script runs on Pinterest/Google Images pages
6. **Scraping**: Content script extracts images and metadata
7. **Upload**: Extension uploads images via FormData to `/api/assets/upload`
8. **Storage**: Images stored in Supabase Storage, metadata in PostgreSQL

---

## File Structure

```
extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker (polling, tab management)
├── content.js             # Content script (DOM scraping)
├── popup.js               # Extension popup UI logic
├── popup.html             # Extension popup HTML
├── options.js             # Options page script
└── options.html           # Options page HTML

dashboard/
├── app/
│   ├── scraping/
│   │   └── page.tsx       # Scraping control page
│   ├── assets/
│   │   └── page.tsx       # Assets browser page
│   └── api/
│       ├── scraping/
│       │   ├── route.ts           # Job management (GET, POST)
│       │   └── trigger/
│       │       └── route.ts      # Trigger endpoint (GET, POST)
│       └── assets/
│           ├── route.ts          # Asset listing (GET)
│           └── upload/
│               └── route.ts      # Asset upload (POST)
└── components/
    └── ScrapingControl.tsx       # Scraping UI component
```

---

## Technology Stack

### Dashboard
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth (if enabled)

### Extension
- **Manifest**: Chrome Extension Manifest V3
- **Language**: JavaScript (ES6+)
- **APIs Used**:
  - Chrome Extension APIs (tabs, storage, scripting, notifications)
  - Fetch API for HTTP requests
  - DOM APIs for scraping

### Backend Services
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage (S3-compatible)
- **API**: Next.js API Routes

---

## Database Schema

### Assets Table

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,                    -- Public URL from Supabase Storage
  storage_path TEXT,                     -- Path in storage bucket
  fandom TEXT,                           -- Detected fandom (e.g., 'lads', 'chainsawman')
  tags TEXT[] DEFAULT '{}',             -- Array of tags
  metadata JSONB DEFAULT '{}',           -- Additional metadata
  search_query TEXT,                     -- Primary search query
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Metadata JSONB Structure**:
```json
{
  "source_url": "https://www.pinterest.com/pin/123456789/",
  "description": "Image description from pin",
  "source_type": "pinterest" | "google_images",
  "search_terms": ["love and deep space", "xavier"],
  "character": "xavier" | null
}
```

### Scraping Jobs Table (Legacy)

```sql
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
  target_urls TEXT[] DEFAULT '{}',
  source_type TEXT,                        -- 'pinterest' or 'google_images'
  search_terms TEXT[] DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints

### POST /api/scraping/trigger
Creates a trigger for the extension to pick up.

**Request**:
```json
{
  "target_urls": [
    "https://www.pinterest.com/search/pins/?q=anime"
  ],
  "source_type": "pinterest",
  "search_terms": []
}
```

**Response**:
```json
{
  "trigger_id": "trigger_1234567890_abc123",
  "success": true
}
```

**Headers**: `Content-Type: application/json`

**CORS**: Enabled for extension access

---

### GET /api/scraping/trigger
Extension polls this endpoint to get triggers.

**Request**: None (extension polls every 1 second)

**Response** (when trigger exists):
```json
{
  "data": {
    "target_urls": [
      "https://www.pinterest.com/search/pins/?q=anime"
    ],
    "source_type": "pinterest",
    "search_terms": [],
    "created_at": 1234567890
  }
}
```

**Response** (no trigger):
```json
{
  "data": null
}
```

**Headers**: 
- `x-api-key` (optional, for production)
- CORS headers included

**Note**: Trigger is consumed once (deleted after being retrieved)

---

### POST /api/assets/upload
Uploads a scraped image to Supabase Storage and database.

**Request**: FormData
- `file`: Image file (File object)
- `fandom`: Fandom string (optional)
- `tags`: JSON array of tags (optional)
- `metadata`: JSON object with metadata (required)

**Metadata Structure**:
```json
{
  "source_url": "https://www.pinterest.com/pin/123456789/",
  "description": "Image description",
  "source_type": "pinterest",
  "search_terms": ["anime"],
  "search_query": "anime",
  "character": "xavier"
}
```

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "url": "https://[project].supabase.co/storage/v1/object/public/assets/...",
    "storage_path": "assets/lads_xavier_1234567890.jpg",
    "fandom": "lads",
    "tags": ["anime", "fanart"],
    "metadata": {...},
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error Response**:
```json
{
  "error": "Error message"
}
```

**Status Codes**:
- `201`: Success
- `400`: Bad request (missing file)
- `500`: Server error

---

### GET /api/assets
Lists all assets with optional filters.

**Query Parameters**:
- `fandom`: Filter by fandom
- `character`: Filter by character
- `tags`: Filter by tags (comma-separated)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "url": "https://...",
      "fandom": "lads",
      "tags": ["anime"],
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

### GET /api/scraping
Lists scraping jobs (legacy endpoint).

**Query Parameters**:
- `status`: Filter by status
- `page`: Page number
- `limit`: Items per page

**Response**: Similar to `/api/assets`

---

### POST /api/scraping
Creates a scraping job (legacy endpoint, not used by extension).

**Request**: Same as `/api/scraping/trigger`

**Response**: Job object with UUID

---

## Extension Details

### Manifest Configuration

**manifest.json**:
```json
{
  "manifest_version": 3,
  "name": "GeeLark Asset Scraper",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "tabs",
    "notifications"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.pinterest.com/*",
        "https://www.pinterest.ca/*",
        "https://www.google.com/search*",
        "https://www.google.ca/search*"
      ],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ]
}
```

### Extension Permissions

- **`storage`**: Store configuration (dashboard URL, API key)
- **`activeTab`**: Access current tab
- **`scripting`**: Inject content scripts dynamically
- **`tabs`**: Create and manage tabs
- **`notifications`**: Show scraping notifications
- **`host_permissions`**: Access Pinterest and Google Images domains

### Background Script (background.js)

**Key Functions**:
- `pollForTriggers()`: Polls dashboard every 1 second
- `startScrapingDirectly()`: Handles Pinterest and Google Images scraping
- `waitForTabLoad()`: Waits for tab to load completely
- `ensureContentScript()`: Ensures content script is injected
- `uploadAsset()`: Uploads image to dashboard
- `extractFandom()`: Extracts fandom from text
- `extractCharacterName()`: Extracts character name from text

**Polling Mechanism**:
- Polls `/api/scraping/trigger` every 1 second
- Uses `setInterval()` for continuous polling
- Stops polling when `isScraping` is true

**Tab Management**:
- Opens tabs sequentially (not in parallel)
- Implements keep-alive mechanism to prevent Chrome from closing tabs
- Waits for page load with timeout (10-15 seconds)
- Closes tabs after scraping

### Content Script (content.js)

**Key Functions**:
- `scrapePinterest()`: Extracts pin links from Pinterest page
- `scrapePinterestPin()`: Extracts image from individual pin page
- `scrapeGoogleImages()`: Extracts images from Google Images
- `extractFandom()`: Pattern matching for fandom detection
- `extractCharacterName()`: Pattern matching for character detection
- `extractTags()`: Keyword-based tag extraction

**XPath Selectors**:
- Pin links: `//div[contains(@role,'listitem')]//a`
- Pin image: `//img[contains(@elementtiming,'MainPinImage')]`
- Pin title: `//h1`

**Image Quality Upgrading**:
- Detects 236x images and upgrades to 736x
- Handles lazy-loaded images (`data-src`, `srcset`)

---

## Performance Considerations

### Polling Interval
- **Current**: 1 second
- **Impact**: Low latency for trigger detection
- **Trade-off**: Higher API load (minimal for single extension)

### Tab Management
- **Strategy**: Sequential processing (one tab at a time)
- **Reason**: Prevents browser from closing tabs due to memory pressure
- **Keep-Alive**: Updates tab every 1 second to keep it active

### Image Quality
- **Pinterest**: Automatically upgrades from 236x to 736x
- **Storage**: Images uploaded immediately (not stored in memory)
- **File Size**: Typical image size: 100-500 KB

### Rate Limiting
- **Delay Between Pins**: 1.5 seconds
- **Purpose**: Avoid overwhelming Pinterest servers
- **Configurable**: Can be adjusted in `background.js`

### Memory Management
- **Images**: Uploaded immediately, not stored in memory
- **Tabs**: Closed after scraping to free memory
- **Cleanup**: Automatic cleanup of old triggers (30 seconds)

---

## Security Considerations

### API Authentication
- **Local Development**: API key optional (can be empty)
- **Production**: Should require API key authentication
- **Header**: `x-api-key` header for API key

### CORS Configuration
- **Current**: `Access-Control-Allow-Origin: *` (allows all origins)
- **Production**: Should restrict to specific origins
- **Headers**: Allows `Content-Type` and `x-api-key`

### File Upload Security
- **Validation**: File type validation (images only)
- **Size Limits**: Should implement file size limits
- **Sanitization**: Filenames are sanitized before storage

### Supabase RLS (Row Level Security)
- **Current**: Admin client bypasses RLS for uploads
- **Production**: Should implement proper RLS policies
- **Storage**: Bucket permissions should be configured

### Extension Permissions
- **Minimal**: Only requests necessary permissions
- **Host Permissions**: Limited to Pinterest and Google Images
- **Storage**: Only stores configuration, not sensitive data

---

## Troubleshooting

### Extension Not Detecting Triggers

**Symptoms**: Extension shows "Ready" but doesn't start scraping

**Solutions**:
1. Check dashboard is running (`npm run dev` in dashboard folder)
2. Verify extension options (Dashboard URL is correct)
3. Check browser console for errors (F12 → Console)
4. Verify CORS headers are set correctly
5. Check extension background console: `chrome://extensions/` → Find extension → Click "service worker"
6. Check network tab for failed requests to `/api/scraping/trigger`

**Common Issues**:
- Dashboard URL incorrect (should be `http://localhost:3000` for local)
- CORS errors (check browser console)
- Extension not loaded properly (reload extension)

---

### Images Not Uploading

**Symptoms**: Extension scrapes images but they don't appear in dashboard

**Solutions**:
1. Check Supabase Storage bucket exists (`assets`)
2. Verify bucket permissions (should be public or have proper policies)
3. Check network tab for upload errors (F12 → Network → Filter by "upload")
4. Verify file size limits (Supabase default: 50MB)
5. Check dashboard API logs for errors
6. Verify Supabase credentials in `.env.local`

**Common Issues**:
- Bucket not created: Create bucket named `assets` in Supabase Storage
- Bucket permissions: Set bucket to public or configure policies
- File size too large: Check image file sizes
- Network errors: Check internet connection

---

### Tagging Not Working

**Symptoms**: Images scraped but fandom/character not detected

**Solutions**:
1. Check search query includes fandom/character names
2. Verify character lists in `content.js` and `background.js`
3. Check console logs for extraction results
4. Try more specific search terms
5. Check if search query is being extracted from URL correctly

**Common Issues**:
- Search query too generic (e.g., "anime" instead of "love and deep space xavier")
- Character name not in character list (add to `characterLists` in code)
- Fandom not supported (add to `extractFandom()` function)

---

### Tabs Closing Prematurely

**Symptoms**: Extension opens tabs but they close before scraping completes

**Solutions**:
1. Extension includes keep-alive mechanism (should prevent this)
2. Check Chrome's tab management settings
3. Reduce number of concurrent tabs
4. Check for memory issues (Chrome Task Manager)
5. Check extension logs for tab closure events

**Common Issues**:
- Chrome closing inactive tabs (keep-alive should prevent this)
- Memory pressure (reduce number of URLs)
- Tab management settings in Chrome

---

### Content Script Not Injecting

**Symptoms**: Extension opens tabs but no images are scraped

**Solutions**:
1. Check content script is in manifest `content_scripts`
2. Verify URL matches manifest `matches` patterns
3. Check content script console (F12 on Pinterest/Google Images page)
4. Verify `ensureContentScript()` is working
5. Check for JavaScript errors in content script

**Common Issues**:
- URL pattern mismatch (check manifest `matches`)
- Content script not loading (check browser console)
- XPath selectors outdated (Pinterest may have changed structure)

---

## Future Roadmap

### Q1 2024
- ✅ Image count limitation for Pinterest
- ✅ Enhanced tagging system
- ✅ Expanded fandom support

### Q2 2024
- Progress tracking with real-time updates
- Error handling improvements
- Retry mechanism for failed uploads

### Q3 2024
- Additional sources (Twitter/X, Instagram, Reddit)
- Scheduled scraping jobs
- Job history and statistics

### Q4 2024
- ML-based tagging (optional)
- Advanced search features
- Export functionality

---

## Contributing

### Development Workflow

1. **Make Changes**:
   - Dashboard: Edit files in `dashboard/`
   - Extension: Edit files in `extension/`

2. **Test Changes**:
   - Dashboard: `npm run dev` and test in browser
   - Extension: Reload extension in `chrome://extensions/`

3. **Update Documentation**:
   - Update this file for technical changes
   - Update `SCRAPING_USER_GUIDE.md` for user-facing changes

### Code Guidelines

- **Error Handling**: Always include try-catch blocks
- **Logging**: Use console.log with prefixes (`[DEBUG]`, `[ERROR]`, `[SUCCESS]`)
- **Comments**: Document complex logic
- **Testing**: Test with multiple URLs/search terms
- **Character Lists**: Update when adding new fandoms

### Adding New Features

1. **Update Character/Fandom Lists**:
   - Edit `extractFandom()` in `content.js` and `background.js`
   - Edit `extractCharacterName()` in `content.js` and `background.js`
   - Add character aliases if needed

2. **Add New Source**:
   - Add URL pattern to manifest `matches`
   - Create scraping function in `content.js`
   - Add source type handling in `background.js`
   - Update dashboard UI if needed

3. **Update API**:
   - Add new endpoint in `dashboard/app/api/`
   - Update TypeScript types if needed
   - Test with extension

---

## Support

### Getting Help

- **Browser Console**: Check for JavaScript errors
- **Extension Logs**: Check extension background console
- **Dashboard Logs**: Check Next.js server logs
- **Supabase Logs**: Check Supabase dashboard for database/storage errors

### Common Resources

- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/
- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs

---

*For user-facing documentation, see [SCRAPING_USER_GUIDE.md](./SCRAPING_USER_GUIDE.md)*

*Last Updated: [Current Date]*
*Version: 1.0.0*
