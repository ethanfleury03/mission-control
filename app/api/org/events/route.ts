/**
 * Org Chart Events API — proxies to mc-api with a Google ID token in production.
 */

import { NextRequest, NextResponse } from 'next/server';

import { backendFetch, backendUrl } from '../../_lib/backend';

const PATH = '/api/org/events';

async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = new URL(backendUrl(PATH));
  url.search = request.nextUrl.searchParams.toString();

  const init: RequestInit = {
    method: request.method,
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
    },
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  try {
    const res = await backendFetch(url.toString(), init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    console.error('Proxy to mc-api failed:', err);
    return NextResponse.json({ error: 'API unreachable' }, { status: 503 });
  }
}

export async function GET(request: NextRequest)    { return proxy(request); }
export async function POST(request: NextRequest)   { return proxy(request); }
export async function PATCH(request: NextRequest)  { return proxy(request); }
export async function DELETE(request: NextRequest) { return proxy(request); }
