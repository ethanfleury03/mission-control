/**
 * Hard wall-clock limit for a single row's enrichment so one hung navigation
 * or page.evaluate cannot stall the whole job (batch waits on Promise.all).
 */
export async function runWithEnrichmentBudget<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Enrichment timed out after ${Math.round(ms / 1000)}s (page closed; row marked failed)`));
    }, ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
