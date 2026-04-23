import { NextRequest, NextResponse } from 'next/server';
import { getPhoneCalls } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const data = await getPhoneCalls({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    listId: searchParams.get('listId') ?? undefined,
    campaignId: searchParams.get('campaignId') ?? undefined,
    disposition: (searchParams.get('disposition') ?? '') as '' | never,
    answered: (searchParams.get('answered') ?? '') as '' | 'answered' | 'not_connected',
    bookedOnly:
      searchParams.get('bookedOnly') === '1' || searchParams.get('bookedOnly') === 'true',
    q: searchParams.get('q') ?? undefined,
  });

  return NextResponse.json(data);
}
