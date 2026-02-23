-- Add source_type and search_terms to scraping_jobs table

ALTER TABLE scraping_jobs 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'pinterest', -- 'pinterest' or 'google_images'
ADD COLUMN IF NOT EXISTS search_terms TEXT[] DEFAULT '{}'; -- For Google Images search queries

-- Add index for filtering by source type
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_source_type ON scraping_jobs(source_type);
