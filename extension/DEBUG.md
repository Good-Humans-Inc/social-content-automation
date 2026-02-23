# Extension Debugging Guide

## Common Errors and Fixes

### 1. "Bucket not found" Error

**Error:** `Failed to upload asset: {"error":"Bucket not found"}`

**Fix:** You need to create a Supabase Storage bucket named `assets`:

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the sidebar
3. Click **"New bucket"** or **"Create bucket"**
4. Name it exactly: `assets`
5. Make it **Public** (or set appropriate policies)
6. Click **Create**

The extension will now be able to upload images to this bucket.

### 2. "Receiving end does not exist" Error

**Error:** `Could not establish connection. Receiving end does not exist.`

**Fix:** This means the content script isn't loaded. The extension now:
- Automatically injects content scripts if they're missing
- Retries up to 3 times
- Shows detailed debug logs

**Check:**
- Open extension service worker console: `chrome://extensions/` → Find extension → Click "service worker"
- Look for `[DEBUG]` messages showing what's happening
- Make sure you're on a Pinterest or Google Images page

### 3. Network Errors

**Error:** `Network error polling for triggers`

**Fix:**
- Check your dashboard URL in extension options
- Make sure dashboard is running (`npm run dev` in dashboard folder)
- Check browser console for CORS errors

## Debug Logging

The extension now includes comprehensive debug logging. To see logs:

1. **Background Script Logs:**
   - Go to `chrome://extensions/`
   - Find "GeeLark Asset Scraper"
   - Click **"service worker"** (or "background page")
   - This opens the console with all `[DEBUG]`, `[ERROR]`, `[SUCCESS]` messages

2. **Content Script Logs:**
   - Open DevTools on the page being scraped (F12)
   - Go to Console tab
   - Look for `[CONTENT]` prefixed messages

## Debug Message Prefixes

- `[DEBUG]` - General debug information
- `[ERROR]` - Errors that need attention
- `[SUCCESS]` - Successful operations
- `[WARN]` - Warnings (non-critical)
- `[RETRY]` - Retry attempts
- `[CONTENT]` - Messages from content script

## Testing Steps

1. **Check Extension Configuration:**
   - Open extension options
   - Verify dashboard URL is correct
   - Save configuration

2. **Test Trigger:**
   - Go to dashboard scraping page
   - Enter a Pinterest URL
   - Click "Start Scraping"
   - Check extension service worker console for trigger detection

3. **Monitor Scraping:**
   - Watch service worker console for `[DEBUG]` messages
   - Check for `[SUCCESS]` messages when images are found
   - Look for `[ERROR]` messages if something fails

4. **Check Upload:**
   - After scraping, check dashboard Assets page
   - If upload fails, check service worker console for bucket errors
