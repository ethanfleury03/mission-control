import { NextRequest, NextResponse } from 'next/server';
import { updatePhoneCampaign } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const campaign = await updatePhoneCampaign(campaignId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      listId: typeof body.listId === 'string' ? body.listId : undefined,
      agentProfileKey: typeof body.agentProfileKey === 'string' ? body.agentProfileKey : undefined,
      settings:
        body.settings && typeof body.settings === 'object'
          ? (body.settings as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update campaign' },
      { status: 400 },
    );
  }
}
