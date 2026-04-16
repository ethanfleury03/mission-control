function readPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

export interface DirectoryScraperWorkerConfig {
  pollIntervalMs: number;
  leaseMs: number;
  heartbeatMs: number;
  enrichmentConcurrency: number;
  delayBetweenCompaniesMs: number;
  serperBatchSize: number;
  delayBetweenSerperMs: number;
  enrichmentRowBudgetMs: number;
  enrichmentNavigationTimeoutMs: number;
}

export function getDirectoryScraperWorkerConfig(): DirectoryScraperWorkerConfig {
  return {
    pollIntervalMs: readPositiveInt('SCRAPER_WORKER_POLL_MS', 3000),
    leaseMs: readPositiveInt('SCRAPER_WORKER_LEASE_MS', 60_000),
    heartbeatMs: readPositiveInt('SCRAPER_WORKER_HEARTBEAT_MS', 10_000),
    enrichmentConcurrency: readPositiveInt('SCRAPER_ENRICHMENT_CONCURRENCY', 2),
    delayBetweenCompaniesMs: readPositiveInt('SCRAPER_DELAY_BETWEEN_COMPANIES_MS', 1200),
    serperBatchSize: readPositiveInt('SCRAPER_SERPER_BATCH_SIZE', 2),
    delayBetweenSerperMs: readPositiveInt('SCRAPER_DELAY_BETWEEN_SERPER_MS', 700),
    enrichmentRowBudgetMs: readPositiveInt('SCRAPER_ENRICHMENT_ROW_BUDGET_MS', 90_000),
    enrichmentNavigationTimeoutMs: readPositiveInt('SCRAPER_ENRICHMENT_NAV_TIMEOUT_MS', 22_000),
  };
}
