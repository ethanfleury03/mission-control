import { describe, expect, it } from 'vitest';

import { scopedBackendUrl } from './backend-path';

describe('scopedBackendUrl', () => {
  it('allows normal work paths', () => {
    expect(scopedBackendUrl('/work', ['items']).pathname).toBe('/work/items');
    expect(scopedBackendUrl('/work', ['items', '123']).pathname).toBe('/work/items/123');
  });

  it('allows normal registry paths under the backend api prefix', () => {
    expect(scopedBackendUrl('/api', ['teams']).pathname).toBe('/api/teams');
  });

  it('rejects dot segments and encoded traversal', () => {
    expect(() => scopedBackendUrl('/work', ['..'])).toThrow();
    expect(() => scopedBackendUrl('/work', ['%2e%2e'])).toThrow();
    expect(() => scopedBackendUrl('/work', ['%252e%252e'])).toThrow();
  });

  it('rejects encoded slashes and backslashes', () => {
    expect(() => scopedBackendUrl('/work', ['items%2f123'])).toThrow();
    expect(() => scopedBackendUrl('/work', ['items%5c123'])).toThrow();
    expect(() => scopedBackendUrl('/work', ['items/123'])).toThrow();
    expect(() => scopedBackendUrl('/work', ['items\\123'])).toThrow();
  });
});
