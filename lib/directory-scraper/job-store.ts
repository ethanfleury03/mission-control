import { v4 as uuid } from 'uuid';
import type { ScrapeJob, ScrapeJobInput, CompanyResult, LogEntry, JobSummary } from './types';

const jobs = new Map<string, ScrapeJob>();

function emptySummary(): JobSummary {
  return { companiesFound: 0, companiesProcessed: 0, emailsFound: 0, phonesFound: 0, failures: 0 };
}

export function createJob(input: ScrapeJobInput): ScrapeJob {
  const job: ScrapeJob = {
    id: uuid(),
    status: 'queued',
    input,
    startedAt: null,
    finishedAt: null,
    summary: emptySummary(),
    results: [],
    logs: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): ScrapeJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): ScrapeJob[] {
  return [...jobs.values()].sort(
    (a, b) => new Date(b.startedAt ?? b.id).getTime() - new Date(a.startedAt ?? a.id).getTime()
  );
}

export function updateJobStatus(id: string, status: ScrapeJob['status']): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  if (status === 'running') job.startedAt = new Date().toISOString();
  if (status === 'completed' || status === 'cancelled' || status === 'failed') {
    job.finishedAt = new Date().toISOString();
  }
}

export function addLog(id: string, level: LogEntry['level'], message: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.logs.push({ timestamp: new Date().toISOString(), level, message });
}

export function setResults(id: string, results: CompanyResult[]): void {
  const job = jobs.get(id);
  if (!job) return;
  job.results = results;
}

export function updateResult(id: string, companyId: string, patch: Partial<CompanyResult>): void {
  const job = jobs.get(id);
  if (!job) return;
  const idx = job.results.findIndex((r) => r.id === companyId);
  if (idx >= 0) {
    job.results[idx] = { ...job.results[idx], ...patch };
  }
}

export function updateSummary(id: string, patch: Partial<JobSummary>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job.summary, patch);
}

export function recalcSummary(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  const done = job.results.filter((r) => r.status === 'done' || r.status === 'failed');
  job.summary = {
    companiesFound: job.results.length,
    companiesProcessed: done.length,
    emailsFound: job.results.filter((r) => !!r.email).length,
    phonesFound: job.results.filter((r) => !!r.phone).length,
    failures: job.results.filter((r) => r.status === 'failed').length,
  };
}

export function isJobCancelled(id: string): boolean {
  return jobs.get(id)?.status === 'cancelled';
}

export function deleteJob(id: string): boolean {
  return jobs.delete(id);
}
