/**
 * Serper.dev Google Search API — used for cheap company-official-website discovery.
 * https://serper.dev
 */

const DEFAULT_BASE = 'https://google.serper.dev';

export function isSerperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY?.trim());
}

export interface SerperOrganicItem {
  title: string;
  link: string;
  snippet?: string;
}

export interface SerperSearchResponse {
  organic?: SerperOrganicItem[];
  error?: string;
}

export async function serperSearch(
  query: string,
  options?: { signal?: AbortSignal; num?: number },
): Promise<SerperSearchResponse> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) {
    return { organic: [], error: 'SERPER_API_KEY is not set' };
  }

  const base = (process.env.SERPER_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '');
  const url = `${base}/search`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const signal = options?.signal;
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': key,
      },
      body: JSON.stringify({
        q: query,
        num: Math.min(10, Math.max(3, options?.num ?? 8)),
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { organic: [], error: `Serper returned non-JSON (${res.status})` };
    }

    if (!res.ok) {
      const errMsg =
        typeof (json as { message?: string }).message === 'string'
          ? (json as { message: string }).message
          : `Serper HTTP ${res.status}`;
      return { organic: [], error: errMsg };
    }

    const organicRaw = (json as { organic?: unknown }).organic;
    const organic: SerperOrganicItem[] = [];
    if (Array.isArray(organicRaw)) {
      for (const row of organicRaw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as { title?: unknown; link?: unknown; snippet?: unknown };
        const title = typeof r.title === 'string' ? r.title : '';
        const link = typeof r.link === 'string' ? r.link : '';
        if (!link) continue;
        const item: SerperOrganicItem = { title, link };
        if (typeof r.snippet === 'string') item.snippet = r.snippet;
        organic.push(item);
      }
    }

    return { organic };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { organic: [], error: msg.includes('abort') ? 'Serper request timed out' : msg };
  } finally {
    clearTimeout(timeout);
  }
}
