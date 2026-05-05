import { backendUrl } from './backend';

const ENCODED_PATH_CONTROL = /%(?:2e|2f|5c)/i;
const MAX_DECODE_PASSES = 3;

export class UnsafeBackendPathError extends Error {
  constructor(message = 'Unsafe backend path.') {
    super(message);
    this.name = 'UnsafeBackendPathError';
  }
}

function decodeRepeatedly(value: string): string {
  let current = value;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const decoded = decodeURIComponent(current);
    if (decoded === current) return decoded;
    current = decoded;
  }
  return current;
}

function assertSafePathSegment(segment: string): void {
  if (!segment) throw new UnsafeBackendPathError();
  if (segment === '.' || segment === '..') throw new UnsafeBackendPathError();
  if (segment.includes('/') || segment.includes('\\')) throw new UnsafeBackendPathError();
  if (ENCODED_PATH_CONTROL.test(segment)) throw new UnsafeBackendPathError();

  let decoded: string;
  try {
    decoded = decodeRepeatedly(segment);
  } catch {
    throw new UnsafeBackendPathError();
  }

  if (!decoded) throw new UnsafeBackendPathError();
  if (decoded === '.' || decoded === '..') throw new UnsafeBackendPathError();
  if (decoded.includes('/') || decoded.includes('\\')) throw new UnsafeBackendPathError();
  if (ENCODED_PATH_CONTROL.test(decoded)) throw new UnsafeBackendPathError();
}

function normalizePrefix(prefix: string): string {
  if (!prefix.startsWith('/')) throw new Error('Backend prefix must start with /.');
  return prefix.length > 1 ? prefix.replace(/\/+$/, '') : prefix;
}

export function scopedBackendUrl(prefix: string, pathSegments: string[] | undefined, search = ''): URL {
  const normalizedPrefix = normalizePrefix(prefix);
  const segments = pathSegments || [];
  for (const segment of segments) assertSafePathSegment(segment);

  const suffix = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const scopedPath = suffix ? `${normalizedPrefix}/${suffix}` : normalizedPrefix;
  const url = new URL(backendUrl(scopedPath));
  url.search = search;

  if (url.pathname !== normalizedPrefix && !url.pathname.startsWith(`${normalizedPrefix}/`)) {
    throw new UnsafeBackendPathError();
  }

  return url;
}
