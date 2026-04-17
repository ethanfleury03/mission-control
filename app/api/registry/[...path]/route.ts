import { NextRequest, NextResponse } from 'next/server';

import { backendFetch, backendUrl } from '../../_lib/backend';

async function proxy(request: NextRequest, params: { path?: string[] }) {
  const path = (params.path || []).join('/');
  const url = new URL(backendUrl(`/api/${path}`));
  url.search = request.nextUrl.search;

  try {
    const res = await backendFetch(url.toString(), { method: 'GET' });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Registry API unavailable: ${err?.message || 'unknown error'}` },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: any) {
  return proxy(request, context?.params || {});
}
