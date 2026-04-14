import { describe, it, expect, vi } from 'vitest';
import { gotoDomContentLoaded } from '../navigation-timeout';

describe('gotoDomContentLoaded', () => {
  it('resolves when goto resolves first', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
    } as unknown as import('playwright').Page;
    await gotoDomContentLoaded(page, 'https://example.com/', 5000);
    expect(page.goto).toHaveBeenCalled();
  });

});
