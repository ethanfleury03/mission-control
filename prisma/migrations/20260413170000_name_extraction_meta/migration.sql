-- Name extraction pipeline debug JSON per result row
ALTER TABLE "directory_scrape_results" ADD COLUMN "nameExtractionMetaJson" TEXT;
