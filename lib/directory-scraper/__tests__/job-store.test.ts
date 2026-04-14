import { describe, it, expect, afterAll } from 'vitest';
import {
  createJob,
  getJob,
  updateJobStatus,
  addLog,
  setResults,
  recalcSummary,
  deleteResult,
  isJobCancelled,
  deleteJob,
} from '../job-store';
import type { CompanyResult } from '../types';

describe('job-store (Prisma)', () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteJob(id);
    }
  });

  it('creates and retrieves a job', async () => {
    const job = await createJob({ url: 'https://test.com', mockMode: false });
    createdIds.push(job.id);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe('queued');
    const fetched = await getJob(job.id);
    expect(fetched?.id).toBe(job.id);
  });

  it('updates job status', async () => {
    const job = await createJob({ url: 'https://test.com' });
    createdIds.push(job.id);
    await updateJobStatus(job.id, 'running');
    const j = await getJob(job.id);
    expect(j?.status).toBe('running');
    expect(j?.startedAt).toBeTruthy();
  });

  it('adds logs', async () => {
    const job = await createJob({ url: 'https://test.com' });
    createdIds.push(job.id);
    await addLog(job.id, 'info', 'test message');
    const j = await getJob(job.id);
    expect(j?.logs.length).toBe(1);
    expect(j?.logs[0].message).toBe('test message');
  });

  it('recalculates summary', async () => {
    const job = await createJob({ url: 'https://test.com' });
    createdIds.push(job.id);
    const results: CompanyResult[] = [
      {
        id: 'r1',
        companyName: 'A',
        directoryListingUrl: 'https://x',
        companyWebsite: '',
        contactName: '',
        email: 'a@b.com',
        phone: '',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'high',
        status: 'done',
      },
      {
        id: 'r2',
        companyName: 'B',
        directoryListingUrl: 'https://y',
        companyWebsite: '',
        contactName: '',
        email: '',
        phone: '555',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'medium',
        status: 'done',
      },
      {
        id: 'r3',
        companyName: 'C',
        directoryListingUrl: 'https://z',
        companyWebsite: '',
        contactName: '',
        email: '',
        phone: '',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'low',
        status: 'failed',
      },
    ];
    await setResults(job.id, results);
    await recalcSummary(job.id);
    const s = (await getJob(job.id))!.summary;
    expect(s.companiesFound).toBe(3);
    expect(s.companiesProcessed).toBe(3);
    expect(s.emailsFound).toBe(1);
    expect(s.phonesFound).toBe(1);
    expect(s.failures).toBe(1);
  });

  it('deletes a single result and recalculates summary', async () => {
    const job = await createJob({ url: 'https://test.com' });
    createdIds.push(job.id);
    const results: CompanyResult[] = [
      {
        id: 'r-del-1',
        companyName: 'Keep',
        directoryListingUrl: 'https://x',
        companyWebsite: '',
        contactName: '',
        email: 'keep@x.com',
        phone: '',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'high',
        status: 'done',
      },
      {
        id: 'r-del-2',
        companyName: 'Gone',
        directoryListingUrl: 'https://y',
        companyWebsite: '',
        contactName: '',
        email: '',
        phone: '555',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
        confidence: 'low',
        status: 'failed',
      },
    ];
    await setResults(job.id, results);
    await recalcSummary(job.id);
    expect(await deleteResult(job.id, 'r-del-2')).toBe(true);
    const j = await getJob(job.id);
    expect(j?.results.map((r) => r.id)).toEqual(['r-del-1']);
    expect(j?.summary.companiesFound).toBe(1);
    expect(j?.summary.emailsFound).toBe(1);
    expect(j?.summary.phonesFound).toBe(0);
    expect(j?.summary.failures).toBe(0);
    expect(await deleteResult(job.id, 'nonexistent')).toBe(false);
  });

  it('tracks cancellation', async () => {
    const job = await createJob({ url: 'https://test.com' });
    createdIds.push(job.id);
    expect(await isJobCancelled(job.id)).toBe(false);
    await updateJobStatus(job.id, 'cancelled');
    expect(await isJobCancelled(job.id)).toBe(true);
  });

  it('deletes a job', async () => {
    const job = await createJob({ url: 'https://test.com' });
    expect(await deleteJob(job.id)).toBe(true);
    expect(await getJob(job.id)).toBeUndefined();
  });
});
