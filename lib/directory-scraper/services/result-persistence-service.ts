import { createHash } from 'crypto';
import { candidateToCompanyResult } from '../name-result-mapper';
import * as store from '../job-store';
import type { CompanyResult, ExtractedCompanyCandidate } from '../types';

function makeJobScopedResultId(jobId: string, resultId: string): string {
  return createHash('sha1').update(`${jobId}|${resultId}`).digest('hex');
}

export async function persistInitialCandidates(
  jobId: string,
  candidates: ExtractedCompanyCandidate[],
  options: { visitWebsites: boolean },
): Promise<CompanyResult[]> {
  const byId = new Map<string, CompanyResult>();
  for (const candidate of candidates) {
    const base = candidateToCompanyResult(candidate, byId.size, options);
    const jobScopedId = makeJobScopedResultId(jobId, base.id);
    if (byId.has(jobScopedId)) continue;
    byId.set(jobScopedId, {
      ...base,
      id: jobScopedId,
    });
  }

  const results = [...byId.values()].map((result, index) => ({
    ...result,
    sortOrder: index,
  }));
  await store.setResults(jobId, results);
  return results;
}

export async function persistResultPatches(
  jobId: string,
  patches: Array<{ resultId: string; patch: Partial<CompanyResult> }>,
) {
  await store.updateResults(jobId, patches);
  await store.recalcSummary(jobId);
}
