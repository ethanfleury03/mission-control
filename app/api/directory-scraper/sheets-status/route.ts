import { NextResponse } from 'next/server';
import { isSheetsConfigured } from '@/lib/directory-scraper/export-sheets';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json({
    configured: isSheetsConfigured(),
    hint: isSheetsConfigured()
      ? undefined
      : 'Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, restart the server, and grant the service account Editor access to your spreadsheet.',
  });
}

export const GET = withActiveUser(GETHandler);
