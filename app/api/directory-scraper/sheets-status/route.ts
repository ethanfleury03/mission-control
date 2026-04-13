import { NextResponse } from 'next/server';
import { isSheetsConfigured } from '@/lib/directory-scraper/export-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    configured: isSheetsConfigured(),
    hint: isSheetsConfigured()
      ? undefined
      : 'Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, restart the server, and grant the service account Editor access to your spreadsheet.',
  });
}
