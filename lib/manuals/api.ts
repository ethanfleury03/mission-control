import type { ManualSummary } from './types';

const BASE = '/api/manuals';

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? response.statusText);
  }
  return data as T;
}

export async function fetchManuals(): Promise<ManualSummary[]> {
  const response = await fetch(BASE, { cache: 'no-store' });
  const payload = await readJson<{ manuals: ManualSummary[] }>(response);
  return payload.manuals;
}

export async function createManualUpload(input: { name: string; file: File }): Promise<ManualSummary> {
  const form = new FormData();
  form.set('name', input.name);
  form.set('file', input.file);

  const response = await fetch(BASE, {
    method: 'POST',
    body: form,
  });

  return readJson<ManualSummary>(response);
}

export function getManualFileUrl(manualId: string): string {
  return `${BASE}/${manualId}/file`;
}
