import { NextRequest, NextResponse } from 'next/server';
import { pushLeadGenAccountById } from '@/lib/hubspot/push-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { accountIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body.accountIds) ? body.accountIds.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'accountIds required' }, { status: 400 });
  if (ids.length > 50) return NextResponse.json({ error: 'Max 50 accounts per bulk push' }, { status: 400 });

  const results: { id: string; ok: boolean; error?: string; hubspotContactId?: string }[] = [];

  for (const accountId of ids) {
    const out = await pushLeadGenAccountById(accountId);
    if (out.ok) {
      results.push({ id: accountId, ok: true, hubspotContactId: out.contactId });
    } else {
      results.push({ id: accountId, ok: false, error: out.message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ pushed: ok, failed: results.length - ok, results });
}
