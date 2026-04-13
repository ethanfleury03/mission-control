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
}

export interface JobSummary {
  companiesFound: number;
  companiesProcessed: number;
  emailsFound: number;
  phonesFound: number;
  failures: number;
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
  results: CompanyResult[];
  logs: LogEntry[];
}

export interface DirectoryEntry {
  name: string;
  url: string;
  detailUrl?: string;
  description?: string;
}
