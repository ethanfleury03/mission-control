import { NextRequest, NextResponse } from 'next/server';
import { pushLeadGenAccountById } from '@/lib/hubspot/push-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const result = await pushLeadGenAccountById(accountId);
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      hubspotContactId: result.contactId,
      account: result.account,
    });
  }
  return NextResponse.json({ error: result.message }, { status: result.status });
}
