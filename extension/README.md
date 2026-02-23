# GeeLark Chrome Extension Setup

## Quick Start

1. **Load the extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `extension` folder

2. **Configure the extension:**
   - Click the extension icon in Chrome toolbar
   - Click "Options" (or right-click extension → Options)
   - Enter your Dashboard URL (default: `http://localhost:3000`)
   - API Key is optional for local development (leave empty)

3. **Make sure your dashboard is running:**
   - The extension polls `http://localhost:3000/api/scraping/trigger` every 1 second
   - If you see "Failed to fetch" errors, check:
     - Is the dashboard running? (`npm run dev` in the dashboard folder)
     - Is the URL correct in extension options?
     - Are there any CORS errors in the browser console?

## Troubleshooting

### "Failed to fetch" error
- **Check dashboard is running:** Make sure `npm run dev` is running in the dashboard folder
- **Check URL:** Open extension options and verify the Dashboard URL is correct
- **Check browser console:** Open DevTools (F12) → Console tab → Look for detailed error messages
- **Check network tab:** In DevTools → Network tab → See if the request to `/api/scraping/trigger` is being made

### Extension not detecting triggers
- The extension polls every 1 second
- Make sure you clicked "Start Scraping" in the dashboard
- Check the extension's background console: `chrome://extensions/` → Find "GeeLark Asset Scraper" → Click "service worker" → Check console logs

### Tabs not opening
- Check extension permissions: Make sure "tabs" permission is granted
- Check browser console for errors
- Try reloading the extension: `chrome://extensions/` → Click reload icon on the extension
