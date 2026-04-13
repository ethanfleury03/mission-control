import { NextResponse } from 'next/server';
import { isSheetsConfigured } from '@/lib/directory-scraper/export-sheets';

export async function GET() {
  return NextResponse.json({ configured: isSheetsConfigured() });
}
