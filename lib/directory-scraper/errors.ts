import type { JobPhase } from './types';

export class DirectoryScraperError extends Error {
  code: string;
  phase: JobPhase;
  retryable: boolean;

  constructor(code: string, phase: JobPhase, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'DirectoryScraperError';
    this.code = code;
    this.phase = phase;
    this.retryable = options?.retryable ?? false;
  }
}

export function validationError(code: string, phase: JobPhase, message: string): DirectoryScraperError {
  return new DirectoryScraperError(code, phase, message, { retryable: false });
}

export function retryableError(code: string, phase: JobPhase, message: string): DirectoryScraperError {
  return new DirectoryScraperError(code, phase, message, { retryable: true });
}

export function classifyDirectoryScraperError(error: unknown, phase: JobPhase): DirectoryScraperError {
  if (error instanceof DirectoryScraperError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('dns') ||
    lower.includes('fetch failed') ||
    lower.includes('429') ||
    lower.includes('503')
  ) {
    return retryableError('TRANSIENT_DEPENDENCY_FAILURE', phase, message);
  }

  if (
    lower.includes('blocked url') ||
    lower.includes('not allowed') ||
    lower.includes('missing') ||
    lower.includes('requires') ||
    lower.includes('invalid')
  ) {
    return validationError('SCRAPER_VALIDATION_FAILED', phase, message);
  }

  return retryableError('SCRAPER_UNEXPECTED_FAILURE', phase, message);
}

export function computeRetryBackoffMs(attemptCount: number): number {
  const base = Math.min(60_000, 2_000 * Math.max(1, attemptCount));
  return base * Math.max(1, attemptCount);
}
