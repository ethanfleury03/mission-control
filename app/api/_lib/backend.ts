const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:3001';

export async function fetchBackend<T>(path: string): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Backend request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json() as Promise<T>;
}
