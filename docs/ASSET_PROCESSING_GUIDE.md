# Asset Processing Guide

## Overview

Asset processing is now **automatic** during upload! The dashboard processes images immediately when they're uploaded through the extension.

## Features

### 1. Automatic Processing During Upload

When images are uploaded through the extension:
- **Image dimensions** (width, height) are extracted using `sharp`
- **Aspect ratio** is calculated automatically
- **MD5 file hash** is computed for deduplication
- **Category/subcategory** are determined from search query/description
- **Character names** are extracted when available
- All metadata is stored in a single database write

### 2. Extension Caption Extraction
- Uses XPath `//h1` to extract captions from Pinterest pins
- Falls back to alt text and other selectors if h1 is not found
- Extracts fandom, character, and tags from text

## Benefits of Automatic Processing

✅ **No separate processing step needed** - Everything happens during upload  
✅ **Immediate metadata availability** - Dimensions, hash, and categories available right away  
✅ **More efficient** - Single-pass processing, no re-downloading from storage  
✅ **Better duplicate detection** - File hash checking happens during upload  

## Database Schema

The assets table includes:

- `category` (TEXT) - Main category (e.g., 'lads', 'jjk', 'genshin')
- `subcategory` (TEXT) - Subcategory (e.g., 'lads_xavier', 'gojo_satoru')
- `file_hash` (TEXT) - MD5 hash for deduplication
- `width` (INTEGER) - Image width in pixels
- `height` (INTEGER) - Image height in pixels
- `aspect_ratio` (DECIMAL) - Width/height ratio
- `search_query` (TEXT) - Original search query used

## Workflow

1. **Extension scrapes** → Uploads images with basic metadata
2. **Dashboard processes automatically** → Extracts full metadata (dimensions, hash, category) during upload
3. **Assets are organized** → Can be filtered by category/subcategory in dashboard

## Resetting Processed Assets

If you need to reprocess old assets with updated categorization logic:

### Using CLI:
```bash
python -m src.cli reset-assets --category uncategorized
```

### Using GUI:
- Click "Reset Processed Assets" button in the GUI dashboard

This will clear `file_hash`, `category`, `subcategory`, `width`, `height`, and `aspect_ratio` for selected assets. Note that new uploads are automatically processed, so this is mainly for reprocessing old assets.

## Search Query Mapping

The system automatically organizes assets by category based on search terms:

```typescript
SEARCH_QUERY_MAP = {
  'lads': {
    category: 'lads',
    subcategories: ['love and deepspace', 'lads xavier', 'lads zayne', 'lads rafayel']
  },
  'jjk': {
    category: 'jjk',
    subcategories: ['jujutsu kaisen', 'gojo satoru', 'sukuna jjk', 'megumi fushiguro']
  },
  'genshin': {
    category: 'genshin',
    subcategories: ['genshin impact', 'zhongli genshin', 'raiden shogun']
  }
}
```

## Notes

- Processing happens automatically during upload - no manual steps required
- Duplicate detection uses file hash (more reliable than URL matching)
- Images are processed in memory during upload (no temp files needed)
- All metadata is available immediately after upload completes
