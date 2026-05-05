/**
 * Org Chart Snapshot API — proxies to mc-api with a Google ID token in production.
 */

import { NextRequest, NextResponse } from 'next/server';

import { backendFetch, backendUrl } from '../../_lib/backend';
import { withActiveUser } from '../../_lib/with-active-user';

const PATH = '/api/org/snapshot';

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

async function GETHandler(request: NextRequest)    { return proxy(request); }
async function POSTHandler(request: NextRequest)   { return proxy(request); }
async function DELETEHandler(request: NextRequest) { return proxy(request); }

export const GET = withActiveUser(GETHandler);
export const POST = withActiveUser(POSTHandler);
export const DELETE = withActiveUser(DELETEHandler);
