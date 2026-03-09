import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';

export async function GET() {
  try {
    const data = await fetchBackend<{ agents?: any[] }>('/api/agents');
    return NextResponse.json(data.agents ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
