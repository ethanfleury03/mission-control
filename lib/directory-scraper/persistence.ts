/**
 * Persistence abstraction for directory scraper jobs.
 * Implemented with Prisma (SQLite via DATABASE_URL today; same schema works on Postgres).
 */
import type { PrismaClient } from '@prisma/client';
import type {
  ScrapeJob,
  ScrapeJobInput,
  CompanyResult,
  LogEntry,
  JobSummary,
  ContactInfo,
  JobMeta,
  NameExtractionMeta,
} from './types';

export interface GetJobSnapshotOptions {
  resultsOffset?: number;
  resultsLimit?: number;
  logsLimit?: number;
}

export interface DirectoryScraperPersistence {
  createJob(input: ScrapeJobInput): Promise<ScrapeJob>;
  /** Full job with all results and logs (export, tests, retry bootstrap). */
  getJob(id: string): Promise<ScrapeJob | null>;
  /** Poll-friendly: paged results + recent logs only. */
  getJobSnapshot(id: string, options?: GetJobSnapshotOptions): Promise<ScrapeJob | null>;
  listJobs(limit?: number): Promise<ScrapeJob[]>;
  updateJobStatus(
    id: string,
    status: ScrapeJob['status'],
    patch?: { startedAt?: Date | null; finishedAt?: Date | null },
  ): Promise<void>;
  deleteJob(id: string): Promise<boolean>;
  resumeJob(id: string): Promise<void>;
  patchMeta(id: string, patch: Partial<JobMeta>): Promise<void>;
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

function emptyMeta(): JobMeta {
  return {};
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

function parseMeta(json: string | null | undefined): JobMeta {
  if (!json) return emptyMeta();
  try {
    return JSON.parse(json) as JobMeta;
  } catch {
    return emptyMeta();
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
  nameExtractionMetaJson: string | null;
  needsReview: boolean;
  sortOrder: number;
}): CompanyResult {
  let rawContact: ContactInfo | undefined;
  if (r.rawContactJson) {
    try {
      rawContact = JSON.parse(r.rawContactJson) as ContactInfo;
    } catch {
      /* ignore */
    }
  }
  let nameExtractionMeta: NameExtractionMeta | undefined;
  if (r.nameExtractionMetaJson) {
    try {
      nameExtractionMeta = JSON.parse(r.nameExtractionMetaJson) as NameExtractionMeta;
    } catch {
      /* ignore */
    }
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
    sortOrder: r.sortOrder,
    nameExtractionMeta,
  };
}

type ResultRow = Parameters<typeof resultFromRow>[0];

type JobRowBase = {
  id: string;
  status: string;
  inputJson: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  summaryJson: string;
  metaJson?: string | null;
};

function buildScrapeJob(
  row: JobRowBase,
  results: CompanyResult[],
  logs: LogEntry[],
  pagination?: { total: number; offset: number; limit: number },
): ScrapeJob {
  const job: ScrapeJob = {
    id: row.id,
    status: row.status as ScrapeJob['status'],
    input: parseInput(row.inputJson),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    summary: parseSummary(row.summaryJson),
    meta: parseMeta(row.metaJson),
    results,
    logs,
  };
  if (pagination && (pagination.total > results.length || pagination.offset > 0)) {
    job.resultsTruncated = true;
    job.resultsTotal = pagination.total;
    job.resultsOffset = pagination.offset;
    job.resultsLimit = pagination.limit;
  }
  return job;
}

const TEXT_FIELDS: (keyof CompanyResult)[] = [
  'companyName',
  'directoryListingUrl',
  'companyWebsite',
  'contactName',
  'email',
  'phone',
  'address',
  'contactPageUrl',
  'socialLinks',
  'notes',
];
/* nameExtractionMeta merged explicitly, not blank-stripped */

function mergeDoneRow(existing: ResultRow, patch: Partial<CompanyResult>): Partial<CompanyResult> {
  const out = { ...patch };
  const wasDone = existing.status === 'done';
  const willBeDone = patch.status === undefined || patch.status === 'done';
  if (!wasDone || !willBeDone) return out;

  for (const key of TEXT_FIELDS) {
    if (key in out) {
      const nextVal = out[key];
      const prevVal = existing[key as keyof ResultRow];
      if (typeof nextVal === 'string' && nextVal.trim() === '' && typeof prevVal === 'string' && prevVal.trim() !== '') {
        delete out[key];
      }
    }
  }
  return out;
}

export function createPrismaPersistence(prisma: PrismaClient): DirectoryScraperPersistence {
  return {
    async createJob(input) {
      const job = await prisma.directoryScrapeJob.create({
        data: {
          status: 'queued',
          inputJson: JSON.stringify(input),
          summaryJson: JSON.stringify(emptySummary()),
          metaJson: JSON.stringify(emptyMeta()),
        },
      });
      return buildScrapeJob(job, [], []);
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
      const { results, logs, ...base } = row;
      return buildScrapeJob(
        base,
        results.map(resultFromRow),
        logs.map((l) => ({
          timestamp: l.timestamp.toISOString(),
          level: l.level as LogEntry['level'],
          message: l.message,
        })),
      );
    },

    async getJobSnapshot(id, options) {
      const row = await prisma.directoryScrapeJob.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          inputJson: true,
          startedAt: true,
          finishedAt: true,
          summaryJson: true,
          metaJson: true,
        },
      });
      if (!row) return null;

      const total = await prisma.directoryScrapeResult.count({ where: { jobId: id } });
      const offset = Math.max(0, options?.resultsOffset ?? 0);
      const defaultLimit = 150;
      const limit = Math.min(500, Math.max(1, options?.resultsLimit ?? defaultLimit));

      const resultRows = await prisma.directoryScrapeResult.findMany({
        where: { jobId: id },
        orderBy: { sortOrder: 'asc' },
        skip: offset,
        take: limit,
      });

      const logTake = Math.min(200, Math.max(20, options?.logsLimit ?? 80));
      const logRowsDesc = await prisma.directoryScrapeLog.findMany({
        where: { jobId: id },
        orderBy: { timestamp: 'desc' },
        take: logTake,
      });
      const logRows = [...logRowsDesc].reverse();

      return buildScrapeJob(
        row,
        resultRows.map(resultFromRow),
        logRows.map((l) => ({
          timestamp: l.timestamp.toISOString(),
          level: l.level as LogEntry['level'],
          message: l.message,
        })),
        { total, offset, limit },
      );
    },

    async listJobs(limit = 100) {
      const rows = await prisma.directoryScrapeJob.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          inputJson: true,
          startedAt: true,
          finishedAt: true,
          summaryJson: true,
          metaJson: true,
        },
      });
      return rows.map((r) => buildScrapeJob(r, [], []));
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

      if (status === 'completed' || status === 'cancelled' || status === 'failed') {
        const updated = await prisma.directoryScrapeJob.findUnique({ where: { id } });
        if (updated?.startedAt && updated.finishedAt) {
          const durationMs = updated.finishedAt.getTime() - updated.startedAt.getTime();
          const meta = parseMeta(updated.metaJson);
          await prisma.directoryScrapeJob.update({
            where: { id },
            data: { metaJson: JSON.stringify({ ...meta, durationMs }) },
          });
        }
      }
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

    async patchMeta(id, patch) {
      const job = await prisma.directoryScrapeJob.findUnique({ where: { id } });
      if (!job) return;
      const cur = parseMeta(job.metaJson);
      const next = { ...cur, ...patch };
      await prisma.directoryScrapeJob.update({
        where: { id },
        data: { metaJson: JSON.stringify(next) },
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
              nameExtractionMetaJson: r.nameExtractionMeta ? JSON.stringify(r.nameExtractionMeta) : null,
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
      const existing = await prisma.directoryScrapeResult.findFirst({
        where: { jobId: id, id: companyId },
      });
      if (!existing) return;

      const mergedPatch = mergeDoneRow(existing, patch);
      const data: Record<string, unknown> = {};
      if (mergedPatch.companyName !== undefined) data.companyName = mergedPatch.companyName;
      if (mergedPatch.directoryListingUrl !== undefined) data.directoryListingUrl = mergedPatch.directoryListingUrl;
      if (mergedPatch.companyWebsite !== undefined) data.companyWebsite = mergedPatch.companyWebsite;
      if (mergedPatch.contactName !== undefined) data.contactName = mergedPatch.contactName;
      if (mergedPatch.email !== undefined) data.email = mergedPatch.email;
      if (mergedPatch.phone !== undefined) data.phone = mergedPatch.phone;
      if (mergedPatch.address !== undefined) data.address = mergedPatch.address;
      if (mergedPatch.contactPageUrl !== undefined) data.contactPageUrl = mergedPatch.contactPageUrl;
      if (mergedPatch.socialLinks !== undefined) data.socialLinks = mergedPatch.socialLinks;
      if (mergedPatch.notes !== undefined) data.notes = mergedPatch.notes;
      if (mergedPatch.confidence !== undefined) data.confidence = mergedPatch.confidence;
      if (mergedPatch.status !== undefined) data.status = mergedPatch.status;
      if (mergedPatch.error !== undefined) data.error = mergedPatch.error ?? null;
      if (mergedPatch.rawContact !== undefined) {
        data.rawContactJson = mergedPatch.rawContact ? JSON.stringify(mergedPatch.rawContact) : null;
      }
      if (mergedPatch.needsReview !== undefined) data.needsReview = mergedPatch.needsReview;
      if (mergedPatch.nameExtractionMeta !== undefined) {
        data.nameExtractionMetaJson = mergedPatch.nameExtractionMeta
          ? JSON.stringify(mergedPatch.nameExtractionMeta)
          : null;
      }

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

    async isJobCancelled(jobId) {
      const row = await prisma.directoryScrapeJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      return row?.status === 'cancelled';
    },
  };
}
