export type JobStatus = 'queued' | 'running' | 'cancelled' | 'completed' | 'failed';
export type JobPhase =
  | 'queued'
  | 'extracting_names'
  | 'discovering_websites'
  | 'enriching'
  | 'exporting_optional'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type CompanyStatus = 'pending' | 'scraping' | 'enriching' | 'done' | 'failed';
export type ConfidenceScore = 'high' | 'medium' | 'low';
export type ExportTarget = 'csv' | 'sheets';

/** How the directory page HTML/text is obtained before name extraction. */
export type ScrapeFetchMode = 'playwright' | 'firecrawl';

/** Extraction method for company name (deterministic + optional AI classification) */
export type NameExtractionMethod =
  | 'jsonld'
  | 'microdata'
  | 'table'
  | 'repeated-block'
  | 'link-list'
  | 'plain-text'
  | 'detail-link'
  | 'ai-classified';

/** Raw candidate before final merge / dedupe */
export interface ExtractedCompanyCandidate {
  name: string;
  normalizedName: string;
  sourceUrl: string;
  sourceSelector?: string;
  sourceText?: string;
  containerSelector?: string;
  containerScore?: number;
  method: NameExtractionMethod;
  confidence: number;
  reasons: string[];
  listingUrl?: string;
  detailUrl?: string;
  companyWebsiteHint?: string;
}

/** Persisted per-row name extraction audit trail */
export interface NameExtractionMeta {
  normalizedName: string;
  extractionMethod: NameExtractionMethod;
  confidenceScore: number;
  confidenceLabel: ConfidenceScore;
  sourceSelector?: string;
  sourceText?: string;
  containerSelector?: string;
  containerScore?: number;
  reasons: string[];
  listingUrl?: string;
  detailUrl?: string;
  /** True if AI was used only to classify/filter existing candidates */
  aiRefined?: boolean;
}

/** Job-level debug from hybrid name pipeline */
export interface NameExtractionDebugSummary {
  sourceUrl: string;
  finalUrl: string;
  pageTitle?: string;
  zeroResultExplanation?: string;
  pageDiagnosis?: {
    kind:
      | 'normal'
      | 'true-end-of-pagination'
      | 'anti-bot-or-rate-limit'
      | 'client-side-render-failure'
      | 'unknown-empty-page';
    detail: string;
    playwrightTextLength?: number;
    playwrightLinkCount?: number;
    httpStatus?: number;
    httpItemCount?: number;
  };
  topContainers: Array<{
    selectorPath: string;
    tagName: string;
    classIdSummary: string;
    textLength: number;
    linkCount: number;
    repeatedChildSummary: string;
    keywordHits: string[];
    score: number;
    scoreReasons: string[];
  }>;
  strategyCounts: Partial<Record<NameExtractionMethod, number>>;
  aiFallbackUsed: boolean;
  aiFallbackReason?: string;
  iframeCount?: number;
  loadMoreClicks?: number;
  /** Two-pass AI: locate step summary */
  aiLocateSummary?: {
    rosterUrlsFound: number;
    textSpansFound: number;
    extraPagesFetched: number;
    extractChunks: number;
  };
  /** Playwright: merged listing pages via query param (for example `page=1`…`page=595`). */
  paginationQuery?: { param: string; from: number; to: number; pagesLoaded: number };
  /** Page fetch: local Playwright vs Firecrawl API */
  fetchEngine?: ScrapeFetchMode;
}

/** Counts after homepage discovery pass (job meta) */
export interface WebsiteDiscoveryJobSummary {
  attempted: number;
  resolvedDetailPage: number;
  resolvedDomainGuess: number;
  resolvedSerper: number;
  unresolved: number;
  skippedAlreadyHadUrl: number;
}

export interface ScrapeJobInput {
  url: string;
  maxCompanies?: number;
  visitCompanyWebsites?: boolean;
  /** When true, run two-pass AI extraction (requires OPENROUTER_API_KEY). Default false. */
  enableAiNameFallback?: boolean;
  exportTarget?: ExportTarget;
  googleSheetId?: string;
  googleSheetTab?: string;
  /** playwright = local browser (default); firecrawl = Firecrawl API (requires FIRECRAWL_API_KEY). */
  scrapeFetchMode?: ScrapeFetchMode;
  /**
   * Playwright only: load listing HTML for each integer in `[from, to]` by setting the query
   * `param` on the job URL (for example `page=1` … `page=595`). Candidates are merged and deduped.
   */
  paginationQuery?: { param: string; from: number; to: number };
  /**
   * When true, resolve missing company homepages after extraction.
   * For paginated/member-directory flows this now prefers direct member-detail page extraction before optional enrichment.
   */
  enableSerperWebsiteDiscovery?: boolean;
}

/** How we resolved companyWebsite during the discovery phase */
export interface WebsiteDiscoveryMeta {
  method: 'detail-page' | 'domain-guess' | 'serper' | 'none';
  detail: string;
  serperQuery?: string;
}

export interface ContactInfo {
  emails: string[];
  phones: string[];
  addresses: string[];
  contactPageUrls: string[];
  socialLinks: string[];
}

export interface CompanyResult {
  id: string;
  companyName: string;
  directoryListingUrl: string;
  companyWebsite: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  contactPageUrl: string;
  socialLinks: string;
  notes: string;
  confidence: ConfidenceScore;
  status: CompanyStatus;
  error?: string;
  rawContact?: ContactInfo;
  /** True when confidence is low or contact info is incomplete — queue for human review */
  needsReview?: boolean;
  /** Row order from directory extraction (for merging paged poll results) */
  sortOrder?: number;
  /** Name pipeline debug (selectors, method, scores) */
  nameExtractionMeta?: NameExtractionMeta;
  /** Serper / domain-guess website resolution audit */
  websiteDiscoveryMeta?: WebsiteDiscoveryMeta;
}

export interface JobSummary {
  companiesFound: number;
  companiesProcessed: number;
  emailsFound: number;
  phonesFound: number;
  failures: number;
}

export interface JobProgress {
  phase: JobPhase;
  current: number;
  total: number;
  percentage: number;
  completedCompanies: number;
  totalCompanies: number;
  currentCompanyName?: string;
  message?: string;
}

/** Per-job observability + export bookkeeping (JSON in DB) */
export interface JobMeta {
  lastProcessedCompanyName?: string;
  lastError?: string;
  /** ISO timestamps */
  lastSheetsExportAt?: string;
  lastCsvExportAt?: string;
  sheetsExportCount?: number;
  csvExportCount?: number;
  lastSheetsRowsAppended?: number;
  /** User-facing note when re-export may duplicate rows */
  sheetsExportNote?: string;
  /** Wall-clock run time when job reaches a terminal state */
  durationMs?: number;
  /** Latest name-extraction pipeline diagnostics */
  nameExtractionDebug?: NameExtractionDebugSummary;
  websiteDiscoverySummary?: WebsiteDiscoveryJobSummary;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  phase?: JobPhase;
  eventCode?: string;
  message: string;
}

export interface ScrapeJob {
  id: string;
  status: JobStatus;
  phase: JobPhase;
  input: ScrapeJobInput;
  attemptCount: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  nextRetryAt: string | null;
  cancelRequestedAt: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  summary: JobSummary;
  progress: JobProgress;
  meta: JobMeta;
  results: CompanyResult[];
  logs: LogEntry[];
  /** Present when results omitted from payload (large job polling) */
  resultsTruncated?: boolean;
  resultsTotal?: number;
  resultsOffset?: number;
  resultsLimit?: number;
}

export interface DirectoryEntry {
  name: string;
  url: string;
  detailUrl?: string;
  description?: string;
  /** Preserved from scrape row — do not overwrite with listing-page link heuristics. */
  existingCompanyWebsite?: string;
  /** When `serper`, keep `existingCompanyWebsite` instead of a weaker listing/detail scrape guess. */
  websiteDiscoveryMethod?: WebsiteDiscoveryMeta['method'];
}
