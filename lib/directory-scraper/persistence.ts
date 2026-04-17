/**
 * Persistence abstraction for directory scraper jobs.
 * Implemented with Prisma (SQLite via DATABASE_URL today; same schema works on Postgres/Turso).
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
  WebsiteDiscoveryMeta,
  JobPhase,
  JobProgress,
  JobStatus,
} from './types';

export interface GetJobSnapshotOptions {
  resultsOffset?: number;
  resultsLimit?: number;
  logsLimit?: number;
}

export interface ClaimJobOptions {
  owner: string;
  leaseMs: number;
}

export interface JobStatusPatch {
  phase?: JobPhase;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  heartbeatAt?: Date | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  nextRetryAt?: Date | null;
  cancelRequestedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  progress?: JobProgress;
}

export interface DirectoryScraperPersistence {
  createJob(input: ScrapeJobInput, options?: { maxAttempts?: number }): Promise<ScrapeJob>;
  /** Full job with all results and logs (export, tests, retry bootstrap). */
  getJob(id: string): Promise<ScrapeJob | null>;
  /** Poll-friendly: paged results + recent logs only. */
  getJobSnapshot(id: string, options?: GetJobSnapshotOptions): Promise<ScrapeJob | null>;
  listJobs(limit?: number): Promise<ScrapeJob[]>;
  updateJobStatus(id: string, status: JobStatus, patch?: JobStatusPatch): Promise<void>;
  deleteJob(id: string): Promise<boolean>;
  resumeJob(id: string): Promise<void>;
  patchMeta(id: string, patch: Partial<JobMeta>): Promise<void>;
  addLog(
    id: string,
    level: LogEntry['level'],
    message: string,
    options?: { phase?: JobPhase; eventCode?: string },
  ): Promise<void>;
  setResults(id: string, results: CompanyResult[]): Promise<void>;
  updateResult(id: string, companyId: string, patch: Partial<CompanyResult>): Promise<void>;
  /** Permanently remove one result row and refresh job summary. */
  deleteResult(jobId: string, resultId: string): Promise<boolean>;
  updateSummary(id: string, patch: Partial<JobSummary>): Promise<void>;
  recalcSummary(id: string): Promise<void>;
  isJobCancelled(id: string): Promise<boolean>;
  requestCancel(id: string): Promise<void>;
  clearCancellation(id: string): Promise<void>;
  claimNextJob(options: ClaimJobOptions): Promise<ScrapeJob | null>;
  renewLease(id: string, owner: string, leaseMs: number): Promise<boolean>;
  releaseLease(id: string, owner?: string): Promise<void>;
}

function emptySummary(): JobSummary {
  return { companiesFound: 0, companiesProcessed: 0, emailsFound: 0, phonesFound: 0, failures: 0 };
}

function emptyMeta(): JobMeta {
  return {};
}

function emptyProgress(phase: JobPhase = 'queued'): JobProgress {
  return {
    phase,
    current: 0,
    total: 0,
    percentage: 0,
    completedCompanies: 0,
    totalCompanies: 0,
  };
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

function parseProgress(json: string | null | undefined, phase: JobPhase): JobProgress {
  if (!json) return emptyProgress(phase);
  try {
    const parsed = JSON.parse(json) as Partial<JobProgress>;
    return {
      ...emptyProgress(phase),
      ...parsed,
      phase: parsed.phase ?? phase,
    };
  } catch {
    return emptyProgress(phase);
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
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
  websiteDiscoveryMetaJson: string | null;
  needsReview: boolean;
  sortOrder: number;
}): CompanyResult {
  let rawContact: ContactInfo | undefined;
  if (r.rawContactJson) {
    try {
      rawContact = JSON.parse(r.rawContactJson) as ContactInfo;
    } catch {
      /* ignore malformed persisted JSON */
    }
  }
  let nameExtractionMeta: NameExtractionMeta | undefined;
  if (r.nameExtractionMetaJson) {
    try {
      nameExtractionMeta = JSON.parse(r.nameExtractionMetaJson) as NameExtractionMeta;
    } catch {
      /* ignore malformed persisted JSON */
    }
  }
  let websiteDiscoveryMeta: WebsiteDiscoveryMeta | undefined;
  if (r.websiteDiscoveryMetaJson) {
    try {
      websiteDiscoveryMeta = JSON.parse(r.websiteDiscoveryMetaJson) as WebsiteDiscoveryMeta;
    } catch {
      /* ignore malformed persisted JSON */
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
    websiteDiscoveryMeta,
  };
}

type ResultRow = Parameters<typeof resultFromRow>[0];

type JobRowBase = {
  id: string;
  status: string;
  phase: string;
  inputJson: string;
  progressJson: string | null;
  attemptCount: number;
  maxAttempts: number;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  nextRetryAt: Date | null;
  cancelRequestedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  summaryJson: string;
  metaJson?: string | null;
};

function buildScrapeJob(
  row: JobRowBase,
  results: CompanyResult[],
  logs: LogEntry[],
  pagination?: { total: number; offset: number; limit: number },
): ScrapeJob {
  const phase = row.phase as JobPhase;
  const job: ScrapeJob = {
    id: row.id,
    status: row.status as JobStatus,
    phase,
    input: parseInput(row.inputJson),
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    heartbeatAt: toIso(row.heartbeatAt),
    leaseOwner: row.leaseOwner ?? null,
    leaseExpiresAt: toIso(row.leaseExpiresAt),
    nextRetryAt: toIso(row.nextRetryAt),
    cancelRequestedAt: toIso(row.cancelRequestedAt),
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    summary: parseSummary(row.summaryJson),
    progress: parseProgress(row.progressJson, phase),
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

async function recalcSummaryWithClient(prisma: PrismaClient, jobId: string): Promise<void> {
  const client = prisma as any;
  const results = await client.directoryScrapeResult.findMany({ where: { jobId } });
  const done = results.filter((r: any) => r.status === 'done' || r.status === 'failed');
  const summary: JobSummary = {
    companiesFound: results.length,
    companiesProcessed: done.length,
    emailsFound: results.filter((r: any) => Boolean(r.email)).length,
    phonesFound: results.filter((r: any) => Boolean(r.phone)).length,
    failures: results.filter((r: any) => r.status === 'failed').length,
  };
  const job = await client.directoryScrapeJob.findUnique({
    where: { id: jobId },
    select: { progressJson: true, phase: true },
  });
  const progress = parseProgress(job?.progressJson, (job?.phase as JobPhase | undefined) ?? 'queued');
  progress.completedCompanies = summary.companiesProcessed;
  progress.totalCompanies = summary.companiesFound;
  if (progress.phase !== 'queued' && progress.total > 0) {
    progress.percentage = Math.max(
      progress.percentage,
      Math.round((progress.current / Math.max(1, progress.total)) * 100),
    );
  }
  await client.directoryScrapeJob.update({
    where: { id: jobId },
    data: {
      summaryJson: JSON.stringify(summary),
      progressJson: JSON.stringify(progress),
    } as any,
  });
}

function mergeDoneRow(existing: ResultRow, patch: Partial<CompanyResult>): Partial<CompanyResult> {
  const out = { ...patch };
  const wasDone = existing.status === 'done';
  const willBeDone = patch.status === undefined || patch.status === 'done';
  if (!wasDone || !willBeDone) return out;

  for (const key of TEXT_FIELDS) {
    if (key in out) {
      const nextVal = out[key];
      const prevVal = existing[key as keyof ResultRow];
      if (
        typeof nextVal === 'string' &&
        nextVal.trim() === '' &&
        typeof prevVal === 'string' &&
        prevVal.trim() !== ''
      ) {
        delete out[key];
      }
    }
  }
  return out;
}

function serializeResultData(jobId: string, r: CompanyResult, index: number): Record<string, unknown> {
  return {
    id: r.id,
    jobId,
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
    websiteDiscoveryMetaJson: r.websiteDiscoveryMeta ? JSON.stringify(r.websiteDiscoveryMeta) : null,
    needsReview: r.needsReview ?? false,
    sortOrder: r.sortOrder ?? index,
  };
}

async function updateDurationMeta(prisma: PrismaClient, jobId: string): Promise<void> {
  const client = prisma as any;
  const updated = await client.directoryScrapeJob.findUnique({
    where: { id: jobId },
    select: {
      startedAt: true,
      finishedAt: true,
      metaJson: true,
    },
  });
  if (!updated?.startedAt || !updated?.finishedAt) return;
  const durationMs = updated.finishedAt.getTime() - updated.startedAt.getTime();
  const meta = parseMeta(updated.metaJson);
  await client.directoryScrapeJob.update({
    where: { id: jobId },
    data: { metaJson: JSON.stringify({ ...meta, durationMs }) } as any,
  });
}

export function createPrismaPersistence(prisma: PrismaClient): DirectoryScraperPersistence {
  const client = prisma as any;

  return {
    async createJob(input, options) {
      const phase: JobPhase = 'queued';
      const job = await client.directoryScrapeJob.create({
        data: {
          status: 'queued',
          phase,
          inputJson: JSON.stringify(input),
          progressJson: JSON.stringify(emptyProgress(phase)),
          attemptCount: 0,
          maxAttempts: options?.maxAttempts ?? 3,
          summaryJson: JSON.stringify(emptySummary()),
          metaJson: JSON.stringify(emptyMeta()),
        } as any,
      });
      return buildScrapeJob(job, [], []);
    },

    async getJob(id) {
      const row = await client.directoryScrapeJob.findUnique({
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
        logs.map((l: any) => ({
          timestamp: l.timestamp.toISOString(),
          level: l.level as LogEntry['level'],
          phase: l.phase as JobPhase | undefined,
          eventCode: l.eventCode ?? undefined,
          message: l.message,
        })),
      );
    },

    async getJobSnapshot(id, options) {
      const row = await client.directoryScrapeJob.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          phase: true,
          inputJson: true,
          progressJson: true,
          attemptCount: true,
          maxAttempts: true,
          queuedAt: true,
          startedAt: true,
          finishedAt: true,
          heartbeatAt: true,
          leaseOwner: true,
          leaseExpiresAt: true,
          nextRetryAt: true,
          cancelRequestedAt: true,
          errorCode: true,
          errorMessage: true,
          summaryJson: true,
          metaJson: true,
        } as any,
      });
      if (!row) return null;

      const total = await client.directoryScrapeResult.count({ where: { jobId: id } });
      const offset = Math.max(0, options?.resultsOffset ?? 0);
      const limit = Math.min(500, Math.max(1, options?.resultsLimit ?? 150));
      const resultRows = await client.directoryScrapeResult.findMany({
        where: { jobId: id },
        orderBy: { sortOrder: 'asc' },
        skip: offset,
        take: limit,
      });

      const logTake = Math.min(200, Math.max(20, options?.logsLimit ?? 80));
      const logRowsDesc = await client.directoryScrapeLog.findMany({
        where: { jobId: id },
        orderBy: { timestamp: 'desc' },
        take: logTake,
      });
      const logRows = [...logRowsDesc].reverse();

      return buildScrapeJob(
        row,
        resultRows.map(resultFromRow),
        logRows.map((l: any) => ({
          timestamp: l.timestamp.toISOString(),
          level: l.level as LogEntry['level'],
          phase: l.phase as JobPhase | undefined,
          eventCode: l.eventCode ?? undefined,
          message: l.message,
        })),
        { total, offset, limit },
      );
    },

    async listJobs(limit = 100) {
      const rows = await client.directoryScrapeJob.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          phase: true,
          inputJson: true,
          progressJson: true,
          attemptCount: true,
          maxAttempts: true,
          queuedAt: true,
          startedAt: true,
          finishedAt: true,
          heartbeatAt: true,
          leaseOwner: true,
          leaseExpiresAt: true,
          nextRetryAt: true,
          cancelRequestedAt: true,
          errorCode: true,
          errorMessage: true,
          summaryJson: true,
          metaJson: true,
        } as any,
      });
      return rows.map((row: any) => buildScrapeJob(row, [], []));
    },

    async updateJobStatus(id, status, patch) {
      const existing = await client.directoryScrapeJob.findUnique({ where: { id } });
      if (!existing) return;

      const data: Record<string, unknown> = { status };
      data.phase =
        patch?.phase ??
        (status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : existing.phase);

      if (patch?.startedAt !== undefined) data.startedAt = patch.startedAt;
      else if (status === 'running' && !existing.startedAt) data.startedAt = new Date();

      if (patch?.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
      else if (status === 'completed' || status === 'cancelled' || status === 'failed') data.finishedAt = new Date();

      if (patch?.heartbeatAt !== undefined) data.heartbeatAt = patch.heartbeatAt;
      if (patch?.leaseOwner !== undefined) data.leaseOwner = patch.leaseOwner;
      if (patch?.leaseExpiresAt !== undefined) data.leaseExpiresAt = patch.leaseExpiresAt;
      if (patch?.nextRetryAt !== undefined) data.nextRetryAt = patch.nextRetryAt;
      if (patch?.cancelRequestedAt !== undefined) data.cancelRequestedAt = patch.cancelRequestedAt;
      if (patch?.errorCode !== undefined) data.errorCode = patch.errorCode;
      if (patch?.errorMessage !== undefined) data.errorMessage = patch.errorMessage;
      if (patch?.progress !== undefined) data.progressJson = JSON.stringify(patch.progress);

      await client.directoryScrapeJob.update({
        where: { id },
        data: data as any,
      });

      if (status === 'completed' || status === 'cancelled' || status === 'failed') {
        await updateDurationMeta(prisma, id);
      }
    },

    async deleteJob(id) {
      try {
        await client.directoryScrapeJob.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },

    async resumeJob(id) {
      await client.directoryScrapeJob.update({
        where: { id },
        data: {
          status: 'queued',
          finishedAt: null,
          heartbeatAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRetryAt: null,
          cancelRequestedAt: null,
          errorCode: null,
          errorMessage: null,
        } as any,
      });
    },

    async patchMeta(id, patch) {
      const job = await client.directoryScrapeJob.findUnique({ where: { id } });
      if (!job) return;
      const cur = parseMeta(job.metaJson);
      const next = { ...cur, ...patch };
      await client.directoryScrapeJob.update({
        where: { id },
        data: { metaJson: JSON.stringify(next) } as any,
      });
    },

    async addLog(id, level, message, options) {
      await client.directoryScrapeLog.create({
        data: {
          jobId: id,
          level,
          phase: options?.phase ?? null,
          eventCode: options?.eventCode ?? null,
          message,
        } as any,
      });
    },

    async setResults(id, results) {
      const ids = results.map((r) => r.id);
      const existingRows = ids.length
        ? await client.directoryScrapeResult.findMany({
            where: { jobId: id, id: { in: ids } },
            select: { id: true },
          })
        : [];
      const existingIds = new Set(existingRows.map((row: any) => row.id));

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index]!;
        const data = serializeResultData(id, result, index);
        if (existingIds.has(result.id)) {
          await client.directoryScrapeResult.updateMany({
            where: { jobId: id, id: result.id },
            data: data as any,
          });
        } else {
          await client.directoryScrapeResult.create({
            data: data as any,
          });
        }
      }

      await recalcSummaryWithClient(prisma, id);
    },

    async updateResult(id, companyId, patch) {
      const existing = await client.directoryScrapeResult.findFirst({
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
      if (mergedPatch.websiteDiscoveryMeta !== undefined) {
        data.websiteDiscoveryMetaJson = mergedPatch.websiteDiscoveryMeta
          ? JSON.stringify(mergedPatch.websiteDiscoveryMeta)
          : null;
      }
      if (mergedPatch.sortOrder !== undefined) data.sortOrder = mergedPatch.sortOrder;

      await client.directoryScrapeResult.updateMany({
        where: { jobId: id, id: companyId },
        data: data as any,
      });
    },

    async updateSummary(id, patch) {
      const job = await client.directoryScrapeJob.findUnique({ where: { id } });
      if (!job) return;
      const cur = parseSummary(job.summaryJson);
      const nextSummary = { ...cur, ...patch };
      const progress = parseProgress(job.progressJson, (job.phase as JobPhase | undefined) ?? 'queued');
      progress.completedCompanies = nextSummary.companiesProcessed;
      progress.totalCompanies = nextSummary.companiesFound;
      await client.directoryScrapeJob.update({
        where: { id },
        data: {
          summaryJson: JSON.stringify(nextSummary),
          progressJson: JSON.stringify(progress),
        } as any,
      });
    },

    async recalcSummary(id) {
      await recalcSummaryWithClient(prisma, id);
    },

    async deleteResult(jobId, resultId) {
      const del = await client.directoryScrapeResult.deleteMany({
        where: { jobId, id: resultId },
      });
      if (del.count === 0) return false;
      await recalcSummaryWithClient(prisma, jobId);
      return true;
    },

    async isJobCancelled(jobId) {
      const row = await client.directoryScrapeJob.findUnique({
        where: { id: jobId },
        select: { status: true, cancelRequestedAt: true },
      });
      return row?.status === 'cancelled' || Boolean(row?.cancelRequestedAt);
    },

    async requestCancel(jobId) {
      await client.directoryScrapeJob.update({
        where: { id: jobId },
        data: { cancelRequestedAt: new Date() } as any,
      });
    },

    async clearCancellation(jobId) {
      await client.directoryScrapeJob.update({
        where: { id: jobId },
        data: { cancelRequestedAt: null } as any,
      });
    },

    async claimNextJob({ owner, leaseMs }) {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const candidates = await client.directoryScrapeJob.findMany({
        where: {
          OR: [
            {
              status: 'queued',
              AND: [
                {
                  OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
                },
                {
                  OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
                },
              ],
            },
            {
              status: 'running',
              leaseExpiresAt: { lte: now },
            },
          ],
        } as any,
        orderBy: [{ queuedAt: 'asc' }, { updatedAt: 'asc' }, { id: 'asc' }],
        take: 20,
      });

      for (const candidate of candidates) {
        const updated = await client.directoryScrapeJob.updateMany({
          where: {
            id: candidate.id,
            OR: [
              {
                status: 'queued',
                AND: [
                  {
                    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
                  },
                  {
                    OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
                  },
                ],
              },
              {
                status: 'running',
                leaseExpiresAt: { lte: now },
              },
            ],
          } as any,
          data: {
            status: 'running',
            startedAt: candidate.startedAt ?? now,
            finishedAt: null,
            heartbeatAt: now,
            leaseOwner: owner,
            leaseExpiresAt,
            attemptCount: { increment: 1 },
          } as any,
        });

        if (updated.count > 0) {
          return this.getJob(candidate.id);
        }
      }

      return null;
    },

    async renewLease(id, owner, leaseMs) {
      const now = new Date();
      const updated = await client.directoryScrapeJob.updateMany({
        where: {
          id,
          status: 'running',
          leaseOwner: owner,
        } as any,
        data: {
          heartbeatAt: now,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
        } as any,
      });
      return updated.count > 0;
    },

    async releaseLease(id, owner) {
      const where: Record<string, unknown> = { id };
      if (owner) where.leaseOwner = owner;
      await client.directoryScrapeJob.updateMany({
        where: where as any,
        data: {
          leaseOwner: null,
          leaseExpiresAt: null,
        } as any,
      });
    },
  };
}
