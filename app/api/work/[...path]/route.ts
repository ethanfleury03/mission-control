import { NextRequest, NextResponse } from 'next/server';

import { backendFetch, backendUrl } from '../../_lib/backend';

async function proxy(request: NextRequest, params: { path?: string[] }) {
  const path = (params.path || []).join('/');
  const url = new URL(backendUrl(`/work/${path}`));
  url.search = request.nextUrl.search;

  const method = request.method;
  const init: RequestInit = {
    method,
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
    },
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.text();
  }

  try {
    const res = await backendFetch(url.toString(), init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Work API unavailable: ${err?.message || 'unknown error'}` },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: any)    { return proxy(request, context?.params || {}); }
export async function POST(request: NextRequest, context: any)   { return proxy(request, context?.params || {}); }
export async function PATCH(request: NextRequest, context: any)  { return proxy(request, context?.params || {}); }
export async function DELETE(request: NextRequest, context: any) { return proxy(request, context?.params || {}); }
