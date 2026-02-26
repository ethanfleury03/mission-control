/**
 * Org Chart Context API
 * Proxies to Mission Control API (Postgres) when API_URL is set.
 * Fallback to static data for local dev when API not running.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.MISSION_CONTROL_API_URL || process.env.API_URL;

async function proxyToApi(request: NextRequest, path: string): Promise<NextResponse> {
  if (!API_URL) return NextResponse.json({ error: 'API_URL not configured' }, { status: 503 });
  const url = new URL(path, API_URL);
  url.search = request.nextUrl.searchParams.toString();
  const res = await fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' ? await request.text() : undefined,
  });
  const data = await res.text();
  const headers = new Headers();
  res.headers.forEach((v, k) => headers.set(k, v));
  return new NextResponse(data, { status: res.status, headers });
}

// GET /api/org/context
export async function GET(request: NextRequest) {
  if (API_URL) {
    try {
      return await proxyToApi(request, `${API_URL.replace(/\/$/, '')}/api/org/context`);
    } catch (err) {
      console.error('Proxy to API failed:', err);
      return NextResponse.json({ error: 'API unreachable' }, { status: 503 });
    }
  }
  return NextResponse.json({ error: 'API_URL not configured' }, { status: 503 });
}

// POST /api/org/context
export async function POST(request: NextRequest) {
  if (API_URL) {
    try {
      return await proxyToApi(request, `${API_URL.replace(/\/$/, '')}/api/org/context`);
    } catch (err) {
      console.error('Proxy to API failed:', err);
      return NextResponse.json({ error: 'API unreachable' }, { status: 503 });
    }
  }
  return NextResponse.json({ error: 'API_URL not configured' }, { status: 503 });
}
