import { NextRequest, NextResponse } from 'next/server';
import { getPhoneCalls } from '@/lib/phone/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function numericParam(searchParams: URLSearchParams, key: string): number | undefined {
  if (!searchParams.has(key)) return undefined;
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) ? value : undefined;
}

async function GETHandler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const data = await getPhoneCalls({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    agentId: searchParams.get('agentId') ?? undefined,
    callStatus: searchParams.get('callStatus') ?? undefined,
    direction: searchParams.get('direction') ?? undefined,
    disposition: (searchParams.get('disposition') ?? '') as '' | never,
    answered: (searchParams.get('answered') ?? '') as '' | 'answered' | 'not_connected',
    bookedOnly:
      searchParams.get('bookedOnly') === '1' || searchParams.get('bookedOnly') === 'true',
    successfulOnly:
      searchParams.get('successfulOnly') === '1' || searchParams.get('successfulOnly') === 'true',
    sentiment: searchParams.get('sentiment') ?? undefined,
    minCostCents: numericParam(searchParams, 'minCostCents'),
    maxCostCents: numericParam(searchParams, 'maxCostCents'),
    q: searchParams.get('q') ?? undefined,
  });

  return NextResponse.json(data);
}

export const GET = withActiveUser(GETHandler);
