import { describe, it, expect } from 'vitest';
import { runWithTimeout } from '../async-timeout';

describe('runWithTimeout', () => {
  it('returns work result when fast', async () => {
    expect(await runWithTimeout(5000, 'x', async () => 42)).toBe(42);
  });

  it('rejects when work is slow', async () => {
    await expect(
      runWithTimeout(40, 'slow', async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 1;
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
