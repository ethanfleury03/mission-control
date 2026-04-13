import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';

const DISABLED = process.env.DISABLE_OPENCLAW === '1' || process.env.DISABLE_OPENCLAW === 'true';

export async function GET() {
  if (DISABLED) return NextResponse.json([]);
  try {
    const data = await fetchBackend<{ agents?: any[] }>('/api/agents');
    return NextResponse.json(data.agents ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
