# GeeLark Automation Dashboard

Next.js dashboard for managing GeeLark automation: scraping, assets, templates, accounts, and posting logs.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Supabase:**
   - Create a new Supabase project at https://supabase.com
   - Run the SQL migrations from `supabase/migrations/` in your Supabase SQL Editor (in order)
   - Create Storage buckets:
     - `assets` - for scraped images
     - `videos` - for generated videos (set to public)
   - Get your Supabase URL and anon key from Project Settings > API
   - Get your service role key from Project Settings > API (for admin operations)

3. **Configure environment variables:**
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```
   - Fill in your GeeLark API credentials (for video uploads):
     ```
     GEELARK_API_BASE=https://openapi.geelark.com
     GEELARK_API_KEY=your_geelark_api_key
     GEELARK_APP_ID=your_app_id  # Optional, only if using key verification mode
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)**

## Chrome Extension Setup

1. **Load the extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

2. **Configure the extension:**
   - Click the extension icon
   - Click "Configure"
   - Enter your dashboard URL (e.g., `http://localhost:3000` for local dev)
   - Enter an API key (you can generate one in dashboard settings, or use a simple string for now)
   - Click "Save Configuration"

3. **Start scraping:**
   - Go to the dashboard `/scraping` page
   - Enter target URLs (Pinterest or Google Images)
   - Click "Start Scraping"
   - The extension will automatically pick up the job and start scraping

## Features

- **Dashboard**: Overview with stats and recent posts
- **Scraping**: Control panel for starting scraping jobs
- **Assets**: Browse and filter scraped images
- **Templates**: Manage content templates, export to JSONL
- **Accounts**: Configure TikTok accounts and preferences
- **Videos**: View generated videos and upload to GeeLark
- **Logs**: View posting logs and analytics

## API Routes

- `/api/assets` - Asset CRUD operations
- `/api/assets/upload` - Upload images to Supabase Storage
- `/api/templates` - Template management
- `/api/templates/export` - Export templates as JSONL
- `/api/scraping` - Scraping job management
- `/api/extension/jobs` - Extension polling endpoint
- `/api/extension/update` - Extension progress updates
- `/api/accounts` - Account configuration
- `/api/videos` - List videos from post_logs
- `/api/videos/upload-geelark` - Upload video to GeeLark and create task
- `/api/geelark/phones` - Fetch phones/accounts from GeeLark API
- `/api/geelark/environments` - Fetch environments from GeeLark API
- `/api/logs` - Posting logs and analytics

## Deployment to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel project settings
4. Deploy!

The dashboard will be available at your Vercel URL.
