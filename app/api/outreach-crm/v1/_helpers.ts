import { NextResponse } from 'next/server';
import { authorizeOutreachServiceRequest } from '@/lib/outreach-crm/service-auth';

export function serviceAuthResponse(headers: Headers): NextResponse | null {
  const auth = authorizeOutreachServiceRequest(headers);
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error ?? 'unauthorized' }, { status: auth.status });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
