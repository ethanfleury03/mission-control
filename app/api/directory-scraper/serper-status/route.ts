import { NextResponse } from 'next/server';
import { isSerperConfigured } from '@/lib/directory-scraper/serper-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isSerperConfigured();
  return NextResponse.json({
    configured,
    hint: configured
      ? null
      : 'Add SERPER_API_KEY to .env (get a key at https://serper.dev) to enable “Find company websites (Serper)”.',
  });
}
