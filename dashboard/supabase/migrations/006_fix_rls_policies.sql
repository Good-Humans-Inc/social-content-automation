-- Fix RLS policies to allow API route inserts
-- This ensures that server-side API routes can insert assets even without user authentication

-- Drop existing policies and recreate them to ensure they work correctly
DROP POLICY IF EXISTS "Allow all operations on assets" ON assets;
DROP POLICY IF EXISTS "Allow all operations on scraping_jobs" ON scraping_jobs;
DROP POLICY IF EXISTS "Allow all operations on templates" ON templates;
DROP POLICY IF EXISTS "Allow all operations on accounts" ON accounts;
DROP POLICY IF EXISTS "Allow all operations on post_logs" ON post_logs;
DROP POLICY IF EXISTS "Allow all operations on posting_schedules" ON posting_schedules;
DROP POLICY IF EXISTS "Allow all operations on asset_templates" ON asset_templates;

-- Recreate policies with explicit permissions
-- These policies allow all operations for authenticated users AND service role
-- For API routes, we'll use service role key which bypasses RLS

-- Assets: Allow all operations (for now, can be restricted later)
CREATE POLICY "Allow all operations on assets" ON assets
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Scraping jobs: Allow all operations
CREATE POLICY "Allow all operations on scraping_jobs" ON scraping_jobs
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Templates: Allow all operations
CREATE POLICY "Allow all operations on templates" ON templates
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Accounts: Allow all operations
CREATE POLICY "Allow all operations on accounts" ON accounts
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Post logs: Allow all operations
CREATE POLICY "Allow all operations on post_logs" ON post_logs
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Posting schedules: Allow all operations
CREATE POLICY "Allow all operations on posting_schedules" ON posting_schedules
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Asset templates: Allow all operations
CREATE POLICY "Allow all operations on asset_templates" ON asset_templates
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Note: The API route now uses service role key (createAdminClient)
-- which bypasses RLS. This is the recommended approach for asset uploads
-- from the extension, as the extension is not authenticated.
