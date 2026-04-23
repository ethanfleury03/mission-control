import { NextResponse } from 'next/server';
import { getPhoneHomeData } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getPhoneHomeData();
  return NextResponse.json(data);
}
