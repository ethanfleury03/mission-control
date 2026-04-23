import { NextRequest, NextResponse } from 'next/server';
import { createPhoneCampaign, getPhoneCampaigns } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getPhoneCampaigns());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const campaign = await createPhoneCampaign({
      name: typeof body.name === 'string' ? body.name : '',
      listId: typeof body.listId === 'string' ? body.listId : '',
      agentProfileKey: typeof body.agentProfileKey === 'string' ? body.agentProfileKey : undefined,
      settings:
        body.settings && typeof body.settings === 'object'
          ? (body.settings as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create campaign' },
      { status: 400 },
    );
  }
}
