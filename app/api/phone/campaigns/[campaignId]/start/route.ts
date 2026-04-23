import { NextRequest, NextResponse } from 'next/server';
import { startPhoneCampaign } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params;
  try {
    return NextResponse.json(await startPhoneCampaign(campaignId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start campaign' },
      { status: 400 },
    );
  }
}
