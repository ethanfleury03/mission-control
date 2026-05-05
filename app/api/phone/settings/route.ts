import { NextRequest, NextResponse } from 'next/server';
import { getPhoneSettingsResponse, updatePhoneSettings } from '@/lib/phone/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json(await getPhoneSettingsResponse());
}

async function PATCHHandler(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const response = await updatePhoneSettings({
      defaultTimezone: typeof body.defaultTimezone === 'string' ? body.defaultTimezone : undefined,
      businessHoursStart:
        typeof body.businessHoursStart === 'string' ? body.businessHoursStart : undefined,
      businessHoursEnd: typeof body.businessHoursEnd === 'string' ? body.businessHoursEnd : undefined,
      activeWeekdays: Array.isArray(body.activeWeekdays)
        ? (body.activeWeekdays as string[]).map((value) => value as never)
        : undefined,
      dailyCallCap: typeof body.dailyCallCap === 'number' ? body.dailyCallCap : undefined,
      cooldownSeconds:
        typeof body.cooldownSeconds === 'number' ? body.cooldownSeconds : undefined,
      maxAttemptsPerLead:
        typeof body.maxAttemptsPerLead === 'number' ? body.maxAttemptsPerLead : undefined,
      retryDelayMinutes:
        typeof body.retryDelayMinutes === 'number' ? body.retryDelayMinutes : undefined,
      voicemailEnabled:
        typeof body.voicemailEnabled === 'boolean' ? body.voicemailEnabled : undefined,
      autoPauseAfterRepeatedFailures:
        typeof body.autoPauseAfterRepeatedFailures === 'boolean'
          ? body.autoPauseAfterRepeatedFailures
          : undefined,
      defaultSourceBehavior:
        typeof body.defaultSourceBehavior === 'string' ? body.defaultSourceBehavior : undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update settings' },
      { status: 400 },
    );
  }
}

export const GET = withActiveUser(GETHandler);
export const PATCH = withActiveUser(PATCHHandler);
