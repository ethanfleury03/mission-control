import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';
import { isOpenClawDisabledForRequest } from '../_lib/is-openclaw-disabled';

export async function GET() {
  if (await isOpenClawDisabledForRequest()) return NextResponse.json([]);
  try {
    const data = await fetchBackend<{ agents?: any[] }>('/api/agents');
    return NextResponse.json(data.agents ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
