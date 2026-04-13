import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJob,
  getJob,
  getAllJobs,
  updateJobStatus,
  addLog,
  setResults,
  recalcSummary,
  isJobCancelled,
  deleteJob,
} from '../job-store';
import type { CompanyResult } from '../types';

describe('job-store', () => {
  it('creates and retrieves a job', () => {
    const job = createJob({ url: 'https://test.com', mockMode: false });
    expect(job.id).toBeTruthy();
    expect(job.status).toBe('queued');
    const fetched = getJob(job.id);
    expect(fetched?.id).toBe(job.id);
  });

  it('updates job status', () => {
    const job = createJob({ url: 'https://test.com' });
    updateJobStatus(job.id, 'running');
    expect(getJob(job.id)?.status).toBe('running');
    expect(getJob(job.id)?.startedAt).toBeTruthy();
  });

  it('adds logs', () => {
    const job = createJob({ url: 'https://test.com' });
    addLog(job.id, 'info', 'test message');
    expect(getJob(job.id)?.logs.length).toBe(1);
    expect(getJob(job.id)?.logs[0].message).toBe('test message');
  });

  it('recalculates summary', () => {
    const job = createJob({ url: 'https://test.com' });
    const results: CompanyResult[] = [
      { id: '1', companyName: 'A', directoryListingUrl: '', companyWebsite: '', contactName: '', email: 'a@b.com', phone: '', address: '', contactPageUrl: '', socialLinks: '', notes: '', confidence: 'high', status: 'done' },
      { id: '2', companyName: 'B', directoryListingUrl: '', companyWebsite: '', contactName: '', email: '', phone: '555', address: '', contactPageUrl: '', socialLinks: '', notes: '', confidence: 'medium', status: 'done' },
      { id: '3', companyName: 'C', directoryListingUrl: '', companyWebsite: '', contactName: '', email: '', phone: '', address: '', contactPageUrl: '', socialLinks: '', notes: '', confidence: 'low', status: 'failed' },
    ];
    setResults(job.id, results);
    recalcSummary(job.id);
    const s = getJob(job.id)!.summary;
    expect(s.companiesFound).toBe(3);
    expect(s.companiesProcessed).toBe(3);
    expect(s.emailsFound).toBe(1);
    expect(s.phonesFound).toBe(1);
    expect(s.failures).toBe(1);
  });

  it('tracks cancellation', () => {
    const job = createJob({ url: 'https://test.com' });
    expect(isJobCancelled(job.id)).toBe(false);
    updateJobStatus(job.id, 'cancelled');
    expect(isJobCancelled(job.id)).toBe(true);
  });

  it('deletes a job', () => {
    const job = createJob({ url: 'https://test.com' });
    expect(deleteJob(job.id)).toBe(true);
    expect(getJob(job.id)).toBeUndefined();
  });
});
