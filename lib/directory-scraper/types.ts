export type JobStatus = 'queued' | 'running' | 'cancelled' | 'completed' | 'failed';
export type CompanyStatus = 'pending' | 'scraping' | 'enriching' | 'done' | 'failed';
export type ConfidenceScore = 'high' | 'medium' | 'low';
export type ExportTarget = 'csv' | 'sheets';

export interface ScrapeJobInput {
  url: string;
  maxCompanies?: number;
  visitCompanyWebsites?: boolean;
  exportTarget?: ExportTarget;
  googleSheetId?: string;
  googleSheetTab?: string;
  mockMode?: boolean;
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
}

export interface JobSummary {
  companiesFound: number;
  companiesProcessed: number;
  emailsFound: number;
  phonesFound: number;
  failures: number;
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
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ScrapeJob {
  id: string;
  status: JobStatus;
  input: ScrapeJobInput;
  startedAt: string | null;
  finishedAt: string | null;
  summary: JobSummary;
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
}
