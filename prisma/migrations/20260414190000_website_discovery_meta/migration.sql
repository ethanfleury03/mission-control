-- Per-row audit trail for Serper / domain-guess company website resolution
ALTER TABLE "directory_scrape_results" ADD COLUMN "websiteDiscoveryMetaJson" TEXT;
