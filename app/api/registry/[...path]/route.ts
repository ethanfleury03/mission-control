import { NextRequest, NextResponse } from 'next/server';

import { backendFetch } from '../../_lib/backend';
import { scopedBackendUrl, UnsafeBackendPathError } from '../../_lib/backend-path';
import { withActiveUser } from '../../_lib/with-active-user';

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function getRouteParams(context: RouteContext): Promise<{ path?: string[] }> {
  return await context.params;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const params = await getRouteParams(context);
  let url: URL;
  try {
    url = scopedBackendUrl('/api', params.path, request.nextUrl.search);
  } catch (error) {
    if (error instanceof UnsafeBackendPathError) {
      return NextResponse.json({ error: 'invalid_backend_path' }, { status: 400 });
    }
    throw error;
  }

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

async function GETHandler(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export const GET = withActiveUser(GETHandler);
