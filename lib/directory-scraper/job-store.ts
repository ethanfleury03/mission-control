import { prisma } from '@/lib/prisma';
import { createPrismaPersistence } from './persistence';
import type { ScrapeJob, ScrapeJobInput, CompanyResult, LogEntry, JobSummary } from './types';

const persistence = createPrismaPersistence(prisma);

export async function createJob(input: ScrapeJobInput) {
  return persistence.createJob(input);
}

export async function getJob(id: string) {
  const j = await persistence.getJob(id);
  return j ?? undefined;
}

export async function getAllJobs() {
  return persistence.listJobs(100);
}

export async function updateJobStatus(id: string, status: ScrapeJob['status']) {
  const patch: { startedAt?: Date | null; finishedAt?: Date | null } = {};
  if (status === 'running') patch.startedAt = new Date();
  if (status === 'completed' || status === 'cancelled' || status === 'failed') {
    patch.finishedAt = new Date();
  }
  await persistence.updateJobStatus(id, status, patch);
}

export async function addLog(id: string, level: LogEntry['level'], message: string) {
  await persistence.addLog(id, level, message);
}

export async function setResults(id: string, results: CompanyResult[]) {
  await persistence.setResults(id, results);
}

export async function updateResult(id: string, companyId: string, patch: Partial<CompanyResult>) {
  await persistence.updateResult(id, companyId, patch);
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

export async function deleteJob(id: string) {
  return persistence.deleteJob(id);
}

export async function resumeJob(id: string) {
  await persistence.resumeJob(id);
}
