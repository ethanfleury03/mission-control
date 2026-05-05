import { NextResponse } from 'next/server';
import { isSerperConfigured } from '@/lib/directory-scraper/serper-client';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const configured = isSerperConfigured();
  return NextResponse.json({
    configured,
    hint: configured
      ? null
      : 'Add SERPER_API_KEY to .env (get a key at https://serper.dev) to enable “Find company websites (Serper)”.',
  });
}

export const GET = withActiveUser(GETHandler);
