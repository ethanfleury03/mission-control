import { NextRequest, NextResponse } from 'next/server';
import { pausePhoneCampaign } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params;
  try {
    return NextResponse.json(await pausePhoneCampaign(campaignId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not pause campaign' },
      { status: 400 },
    );
  }
}
