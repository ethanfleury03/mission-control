import { describe, expect, it } from 'vitest';
import { splitTextIntoExtractionChunks } from '../extract-with-ai';

describe('splitTextIntoExtractionChunks', () => {
  it('returns single chunk for short text', () => {
    expect(splitTextIntoExtractionChunks('hello world', 1000)).toEqual(['hello world']);
  });

  it('splits long text into multiple chunks', () => {
    const para = 'a'.repeat(500);
    const body = `${para}\n\n${para}\n\n${para}`;
    const chunks = splitTextIntoExtractionChunks(body, 600);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toContain('aaa');
  });
});
