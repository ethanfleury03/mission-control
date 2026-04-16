import { candidateToCompanyResult } from '../name-result-mapper';
import * as store from '../job-store';
import type { CompanyResult, ExtractedCompanyCandidate } from '../types';

export async function persistInitialCandidates(
  jobId: string,
  candidates: ExtractedCompanyCandidate[],
  options: { visitWebsites: boolean },
): Promise<CompanyResult[]> {
  const results = candidates.map((candidate, index) =>
    candidateToCompanyResult(candidate, index, options),
  );
  await store.setResults(jobId, results);
  return results;
}

export async function persistResultPatches(
  jobId: string,
  patches: Array<{ resultId: string; patch: Partial<CompanyResult> }>,
) {
  for (const item of patches) {
    await store.updateResult(jobId, item.resultId, item.patch);
  }
  await store.recalcSummary(jobId);
}
