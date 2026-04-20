import { prisma } from '@/lib/prisma';
import { createPrismaPersistence } from './persistence';
import type {
  ScrapeJob,
  ScrapeJobInput,
  CompanyResult,
  LogEntry,
  JobSummary,
  JobMeta,
  JobPhase,
  JobProgress,
} from './types';

const persistence = createPrismaPersistence(prisma);

export async function createJob(input: ScrapeJobInput, options?: { maxAttempts?: number }) {
  return persistence.createJob(input, options);
}

export async function getJob(id: string) {
  const job = await persistence.getJob(id);
  return job ?? undefined;
}

export async function getJobSnapshot(
  id: string,
  options?: { resultsOffset?: number; resultsLimit?: number; logsLimit?: number },
) {
  const job = await persistence.getJobSnapshot(id, options);
  return job ?? undefined;
}

export async function getAllJobs() {
  return persistence.listJobs(100);
}

export async function updateJobStatus(
  id: string,
  status: ScrapeJob['status'],
  patch?: {
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
  },
) {
  await persistence.updateJobStatus(id, status, patch);
}

export async function addLog(
  id: string,
  level: LogEntry['level'],
  message: string,
  options?: { phase?: JobPhase; eventCode?: string },
) {
  await persistence.addLog(id, level, message, options);
}

export async function setResults(id: string, results: CompanyResult[]) {
  await persistence.setResults(id, results);
}

export async function updateResult(id: string, companyId: string, patch: Partial<CompanyResult>) {
  await persistence.updateResult(id, companyId, patch);
}

export async function updateResults(id: string, patches: Array<{ resultId: string; patch: Partial<CompanyResult> }>) {
  await persistence.updateResults(id, patches);
}

export async function deleteResult(jobId: string, resultId: string) {
  return persistence.deleteResult(jobId, resultId);
}

export async function updateSummary(id: string, patch: Partial<JobSummary>) {
  await persistence.updateSummary(id, patch);
}

export async function recalcSummary(id: string) {
  await persistence.recalcSummary(id);
}

export async function isJobCancelled(id: string) {
  return persistence.isJobCancelled(id);
}

export async function requestJobCancel(id: string) {
  await persistence.requestCancel(id);
}

export async function clearJobCancellation(id: string) {
  await persistence.clearCancellation(id);
}

export async function deleteJob(id: string) {
  return persistence.deleteJob(id);
}

export async function resumeJob(id: string) {
  await persistence.resumeJob(id);
}

export async function patchJobMeta(id: string, patch: Partial<JobMeta>) {
  await persistence.patchMeta(id, patch);
}

export async function claimNextJob(owner: string, leaseMs: number) {
  const job = await persistence.claimNextJob({ owner, leaseMs });
  return job ?? undefined;
}

export async function renewJobLease(id: string, owner: string, leaseMs: number) {
  return persistence.renewLease(id, owner, leaseMs);
}

export async function releaseJobLease(id: string, owner?: string) {
  await persistence.releaseLease(id, owner);
}
