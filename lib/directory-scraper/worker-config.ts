function readPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

export interface DirectoryScraperWorkerConfig {
  pollIntervalMs: number;
  startupRetryDelayMs: number;
  leaseMs: number;
  heartbeatMs: number;
  enrichmentConcurrency: number;
  websiteDiscoveryConcurrency: number;
  delayBetweenCompaniesMs: number;
  delayBetweenWebsiteDiscoveryBatchesMs: number;
  serperBatchSize: number;
  delayBetweenSerperMs: number;
  enrichmentRowBudgetMs: number;
  enrichmentNavigationTimeoutMs: number;
  websiteDiscoveryNavigationTimeoutMs: number;
  websiteDiscoverySettleMs: number;
}

export function getDirectoryScraperWorkerConfig(): DirectoryScraperWorkerConfig {
  return {
    pollIntervalMs: readPositiveInt('SCRAPER_WORKER_POLL_MS', 3000),
    startupRetryDelayMs: readPositiveInt('SCRAPER_WORKER_STARTUP_RETRY_MS', 5000),
    leaseMs: readPositiveInt('SCRAPER_WORKER_LEASE_MS', 60_000),
    heartbeatMs: readPositiveInt('SCRAPER_WORKER_HEARTBEAT_MS', 10_000),
    enrichmentConcurrency: readPositiveInt('SCRAPER_ENRICHMENT_CONCURRENCY', 2),
    websiteDiscoveryConcurrency: readPositiveInt('SCRAPER_WEBSITE_DISCOVERY_CONCURRENCY', 6),
    delayBetweenCompaniesMs: readPositiveInt('SCRAPER_DELAY_BETWEEN_COMPANIES_MS', 1200),
    delayBetweenWebsiteDiscoveryBatchesMs: readPositiveInt('SCRAPER_DELAY_BETWEEN_WEBSITE_DISCOVERY_BATCHES_MS', 150),
    serperBatchSize: readPositiveInt('SCRAPER_SERPER_BATCH_SIZE', 2),
    delayBetweenSerperMs: readPositiveInt('SCRAPER_DELAY_BETWEEN_SERPER_MS', 700),
    enrichmentRowBudgetMs: readPositiveInt('SCRAPER_ENRICHMENT_ROW_BUDGET_MS', 90_000),
    enrichmentNavigationTimeoutMs: readPositiveInt('SCRAPER_ENRICHMENT_NAV_TIMEOUT_MS', 22_000),
    websiteDiscoveryNavigationTimeoutMs: readPositiveInt('SCRAPER_WEBSITE_DISCOVERY_NAV_TIMEOUT_MS', 12000),
    websiteDiscoverySettleMs: readPositiveInt('SCRAPER_WEBSITE_DISCOVERY_SETTLE_MS', 150),
  };
}
