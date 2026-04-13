-- Per-job metadata (observability, export counts) for Directory Scraper
ALTER TABLE "directory_scrape_jobs" ADD COLUMN "metaJson" TEXT NOT NULL DEFAULT '{}';
