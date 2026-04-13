import { NextResponse } from 'next/server';
import { isFirecrawlConfigured } from '@/lib/directory-scraper/firecrawl-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isFirecrawlConfigured();
  return NextResponse.json({
    configured,
    hint: configured
      ? undefined
      : 'Set FIRECRAWL_API_KEY in .env to fetch pages via Firecrawl (clean markdown, no local Chromium for Phase 1).',
  });
}
