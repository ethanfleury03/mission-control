import { describe, it, expect } from 'vitest';
import { runWithEnrichmentBudget } from '../enrichment-timeout';

describe('runWithEnrichmentBudget', () => {
  it('resolves when work finishes in time', async () => {
    const v = await runWithEnrichmentBudget(5000, async () => 'ok');
    expect(v).toBe('ok');
  });

  it('rejects when work exceeds budget', async () => {
    await expect(
      runWithEnrichmentBudget(30, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'late';
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
