/**
 * Persistence abstraction for directory scraper jobs.
 * Implemented with Prisma (SQLite via DATABASE_URL today; same schema works on Postgres).
 */
import type { PrismaClient } from '@prisma/client';
import type { ScrapeJob, ScrapeJobInput, CompanyResult, LogEntry, JobSummary, ContactInfo } from './types';

export interface DirectoryScraperPersistence {
  createJob(input: ScrapeJobInput): Promise<ScrapeJob>;
  getJob(id: string): Promise<ScrapeJob | null>;
  listJobs(limit?: number): Promise<ScrapeJob[]>;
  updateJobStatus(
    id: string,
    status: ScrapeJob['status'],
    patch?: { startedAt?: Date | null; finishedAt?: Date | null },
  ): Promise<void>;
  deleteJob(id: string): Promise<boolean>;
  /** Set job back to running and clear finishedAt (retry after completed/failed). */
  resumeJob(id: string): Promise<void>;
  addLog(id: string, level: LogEntry['level'], message: string): Promise<void>;
  setResults(id: string, results: CompanyResult[]): Promise<void>;
  updateResult(id: string, companyId: string, patch: Partial<CompanyResult>): Promise<void>;
  updateSummary(id: string, patch: Partial<JobSummary>): Promise<void>;
  recalcSummary(id: string): Promise<void>;
  isJobCancelled(id: string): Promise<boolean>;
}

function emptySummary(): JobSummary {
  return { companiesFound: 0, companiesProcessed: 0, emailsFound: 0, phonesFound: 0, failures: 0 };
}

function parseInput(json: string): ScrapeJobInput {
  return JSON.parse(json) as ScrapeJobInput;
}

function parseSummary(json: string): JobSummary {
  try {
    return JSON.parse(json) as JobSummary;
  } catch {
    return emptySummary();
  }
}

function resultFromRow(r: {
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
  confidence: string;
  status: string;
  error: string | null;
  rawContactJson: string | null;
  needsReview: boolean;
}): CompanyResult {
  let rawContact: ContactInfo | undefined;
  if (r.rawContactJson) {
    try {
      rawContact = JSON.parse(r.rawContactJson) as ContactInfo;
    } catch { /* ignore */ }
  }
  return {
    id: r.id,
    companyName: r.companyName,
    directoryListingUrl: r.directoryListingUrl,
    companyWebsite: r.companyWebsite,
    contactName: r.contactName,
    email: r.email,
    phone: r.phone,
    address: r.address,
    contactPageUrl: r.contactPageUrl,
    socialLinks: r.socialLinks,
    notes: r.notes,
    confidence: r.confidence as CompanyResult['confidence'],
    status: r.status as CompanyResult['status'],
    error: r.error ?? undefined,
    rawContact,
    needsReview: r.needsReview,
  };
}

type ResultRow = Parameters<typeof resultFromRow>[0];

function toJob(row: {
  id: string;
  status: string;
  inputJson: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  summaryJson: string;
  results: ResultRow[];
  logs: { timestamp: Date; level: string; message: string }[];
}): ScrapeJob {
  return {
    id: row.id,
    status: row.status as ScrapeJob['status'],
    input: parseInput(row.inputJson),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    summary: parseSummary(row.summaryJson),
    results: row.results.map(resultFromRow),
    logs: row.logs.map((l) => ({
      timestamp: l.timestamp.toISOString(),
      level: l.level as LogEntry['level'],
      message: l.message,
    })),
  };
}

export function createPrismaPersistence(prisma: PrismaClient): DirectoryScraperPersistence {
  return {
    async createJob(input) {
      const job = await prisma.directoryScrapeJob.create({
        data: {
          status: 'queued',
          inputJson: JSON.stringify(input),
          summaryJson: JSON.stringify(emptySummary()),
        },
      });
      return {
        id: job.id,
        status: 'queued',
        input,
        startedAt: null,
        finishedAt: null,
        summary: emptySummary(),
        results: [],
        logs: [],
      };
    },

    async getJob(id) {
      const row = await prisma.directoryScrapeJob.findUnique({
        where: { id },
        include: {
          results: { orderBy: { sortOrder: 'asc' } },
          logs: { orderBy: { timestamp: 'asc' } },
        },
      });
      if (!row) return null;
      return toJob(row);
    },

    async listJobs(limit = 100) {
      const rows = await prisma.directoryScrapeJob.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          results: { orderBy: { sortOrder: 'asc' } },
          logs: { orderBy: { timestamp: 'asc' } },
        },
      });
      return rows.map(toJob);
    },

    async updateJobStatus(id, status, patch) {
      const existing = await prisma.directoryScrapeJob.findUnique({ where: { id } });
      if (!existing) return;
      const data: {
        status: string;
        startedAt?: Date | null;
        finishedAt?: Date | null;
      } = { status };
      if (patch?.startedAt !== undefined) {
        data.startedAt = patch.startedAt;
      } else if (status === 'running' && !existing.startedAt) {
        data.startedAt = new Date();
      }
      if (patch?.finishedAt !== undefined) {
        data.finishedAt = patch.finishedAt;
      } else if (status === 'completed' || status === 'cancelled' || status === 'failed') {
        data.finishedAt = new Date();
      }
      await prisma.directoryScrapeJob.update({ where: { id }, data });
    },

    async deleteJob(id) {
      try {
        await prisma.directoryScrapeJob.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },

    async resumeJob(id) {
      await prisma.directoryScrapeJob.update({
        where: { id },
        data: { status: 'running', finishedAt: null },
      });
    },

    async addLog(id, level, message) {
      await prisma.directoryScrapeLog.create({
        data: { jobId: id, level, message },
      });
    },

    async setResults(id, results) {
      await prisma.$transaction(async (tx) => {
        await tx.directoryScrapeResult.deleteMany({ where: { jobId: id } });
        for (let idx = 0; idx < results.length; idx++) {
          const r = results[idx];
          await tx.directoryScrapeResult.create({
            data: {
              id: r.id,
              jobId: id,
              companyName: r.companyName,
              directoryListingUrl: r.directoryListingUrl,
              companyWebsite: r.companyWebsite ?? '',
              contactName: r.contactName ?? '',
              email: r.email ?? '',
              phone: r.phone ?? '',
              address: r.address ?? '',
              contactPageUrl: r.contactPageUrl ?? '',
              socialLinks: r.socialLinks ?? '',
              notes: r.notes ?? '',
              confidence: r.confidence,
              status: r.status,
              error: r.error ?? null,
              rawContactJson: r.rawContact ? JSON.stringify(r.rawContact) : null,
              needsReview: r.needsReview ?? false,
              sortOrder: idx,
            },
          });
        }
        const s = emptySummary();
        s.companiesFound = results.length;
        await tx.directoryScrapeJob.update({
          where: { id },
          data: { summaryJson: JSON.stringify(s) },
        });
      });
    },

    async updateResult(id, companyId, patch) {
      const data: Record<string, unknown> = {};
      if (patch.companyName !== undefined) data.companyName = patch.companyName;
      if (patch.directoryListingUrl !== undefined) data.directoryListingUrl = patch.directoryListingUrl;
      if (patch.companyWebsite !== undefined) data.companyWebsite = patch.companyWebsite;
      if (patch.contactName !== undefined) data.contactName = patch.contactName;
      if (patch.email !== undefined) data.email = patch.email;
      if (patch.phone !== undefined) data.phone = patch.phone;
      if (patch.address !== undefined) data.address = patch.address;
      if (patch.contactPageUrl !== undefined) data.contactPageUrl = patch.contactPageUrl;
      if (patch.socialLinks !== undefined) data.socialLinks = patch.socialLinks;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.confidence !== undefined) data.confidence = patch.confidence;
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.error !== undefined) data.error = patch.error ?? null;
      if (patch.rawContact !== undefined) data.rawContactJson = patch.rawContact ? JSON.stringify(patch.rawContact) : null;
      if (patch.needsReview !== undefined) data.needsReview = patch.needsReview;

      await prisma.directoryScrapeResult.updateMany({
        where: { jobId: id, id: companyId },
        data,
      });
    },

    async updateSummary(id, patch) {
      const job = await prisma.directoryScrapeJob.findUnique({ where: { id } });
      if (!job) return;
      const cur = parseSummary(job.summaryJson);
      Object.assign(cur, patch);
      await prisma.directoryScrapeJob.update({
        where: { id },
        data: { summaryJson: JSON.stringify(cur) },
      });
    },

    async recalcSummary(id) {
      const results = await prisma.directoryScrapeResult.findMany({ where: { jobId: id } });
      const done = results.filter((r) => r.status === 'done' || r.status === 'failed');
      const summary: JobSummary = {
        companiesFound: results.length,
        companiesProcessed: done.length,
        emailsFound: results.filter((r) => !!r.email).length,
        phonesFound: results.filter((r) => !!r.phone).length,
        failures: results.filter((r) => r.status === 'failed').length,
      };
      await prisma.directoryScrapeJob.update({
        where: { id },
        data: { summaryJson: JSON.stringify(summary) },
      });
    },

    async isJobCancelled(id) {
      const row = await prisma.directoryScrapeJob.findUnique({
        where: { id },
        select: { status: true },
      });
      return row?.status === 'cancelled';
    },
  };
}
