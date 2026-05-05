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
    url = scopedBackendUrl('/work', params.path, request.nextUrl.search);
  } catch (error) {
    if (error instanceof UnsafeBackendPathError) {
      return NextResponse.json({ error: 'invalid_backend_path' }, { status: 400 });
    }
    throw error;
  }

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

async function GETHandler(request: NextRequest, context: RouteContext)    { return proxy(request, context); }
async function POSTHandler(request: NextRequest, context: RouteContext)   { return proxy(request, context); }
async function PATCHHandler(request: NextRequest, context: RouteContext)  { return proxy(request, context); }
async function DELETEHandler(request: NextRequest, context: RouteContext) { return proxy(request, context); }

export const GET = withActiveUser(GETHandler);
export const POST = withActiveUser(POSTHandler);
export const PATCH = withActiveUser(PATCHHandler);
export const DELETE = withActiveUser(DELETEHandler);
